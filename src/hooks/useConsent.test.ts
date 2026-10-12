import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type ConsentModule = typeof import('./useConsent');

function fakeStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial));
    return {
        get length() {
            return data.size;
        },
        key: (i: number) => [...data.keys()][i] ?? null,
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
        clear: () => data.clear(),
    };
}

type StorageListener = (e: { key: string | null }) => void;

/** Just enough of `window` for the store: storage, the storage event, a hostname. */
function fakeWindow(overrides: Record<string, unknown> = {}) {
    const listeners = new Set<StorageListener>();
    const win = {
        localStorage: fakeStorage(),
        sessionStorage: fakeStorage(),
        location: { hostname: 'btcdollarcostaverage.com' },
        addEventListener: (type: string, fn: StorageListener) => {
            if (type === 'storage') listeners.add(fn);
        },
        removeEventListener: (_type: string, fn: StorageListener) => void listeners.delete(fn),
        dispatchEvent: (e: { key: string | null }) => {
            listeners.forEach((fn) => fn(e));
            return true;
        },
    };
    return Object.defineProperties(win, Object.getOwnPropertyDescriptors(overrides)) as typeof win;
}

class FakeStorageEvent {
    key: string | null;
    constructor(
        public type: string,
        init?: { key?: string | null },
    ) {
        this.key = init?.key ?? null;
    }
}

interface StoredCookie {
    name: string;
    value: string;
    /** null = host-only (written without a Domain attribute). */
    domain: string | null;
}

/**
 * document.cookie with the one browser rule that matters here: a cookie is only
 * replaced or expired by a write carrying the same Domain it was set with.
 */
function cookieJar(initial: StoredCookie[]) {
    let cookies = [...initial];
    return {
        get cookie() {
            return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        },
        set cookie(header: string) {
            const [pair, ...rest] = header.split(';').map((part) => part.trim());
            const [name, value = ''] = pair.split('=');
            const attrs = new Map(rest.map((a) => a.split('=') as [string, string | undefined]).map(([k, v]) => [k.toLowerCase(), v ?? '']));
            const domain = attrs.has('domain') ? attrs.get('domain')!.replace(/^\./, '') : null;
            const expired = attrs.get('max-age') === '0' || (attrs.has('expires') && Date.parse(attrs.get('expires')!) < Date.now());
            cookies = cookies.filter((c) => !(c.name === name && c.domain === domain));
            if (!expired) cookies.push({ name, value, domain });
        },
        names: () => cookies.map((c) => c.name),
    };
}

const blocked = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
};

let consent: ConsentModule;

beforeEach(async () => {
    // A fresh module per test: the in-memory fallback is module state.
    vi.resetModules();
    vi.stubGlobal('StorageEvent', FakeStorageEvent);
    consent = await import('./useConsent');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('consent store with working storage', () => {
    it('has no answer until one is saved, then persists it under the existing key', () => {
        const win = fakeWindow();
        vi.stubGlobal('window', win);

        expect(consent.readConsent()).toBeNull();
        expect(consent.hasAnalyticsConsent()).toBe(false);

        consent.saveConsent({ essential: true, analytics: true });
        expect(win.localStorage.getItem('cookie-consent')).toBe('{"essential":true,"analytics":true}');
        expect(consent.hasAnalyticsConsent()).toBe(true);

        consent.saveConsent({ essential: true, analytics: false });
        expect(consent.readConsent()).toEqual({ essential: true, analytics: false });
        expect(consent.hasAnalyticsConsent()).toBe(false);
    });

    it('tells subscribers about a save and a withdrawal, and nothing about other keys', () => {
        const win = fakeWindow();
        vi.stubGlobal('window', win);
        const onChange = vi.fn();
        const unsubscribe = consent.subscribeConsent(onChange);

        consent.saveConsent({ essential: true, analytics: true });
        expect(onChange).toHaveBeenCalledTimes(1);

        consent.withdrawConsent();
        expect(onChange).toHaveBeenCalledTimes(2);
        expect(consent.readConsent()).toBeNull();
        expect(win.localStorage.getItem('cookie-consent')).toBeNull();

        win.dispatchEvent({ key: 'theme-preference' });
        expect(onChange).toHaveBeenCalledTimes(2);
        // storage.clear() in another tab arrives as key === null and removes the answer too.
        win.dispatchEvent({ key: null });
        expect(onChange).toHaveBeenCalledTimes(3);

        unsubscribe();
        consent.saveConsent({ essential: true, analytics: false });
        expect(onChange).toHaveBeenCalledTimes(3);
    });

    it('treats anything that is not an object as no answer', () => {
        for (const raw of ['null', '1', '"yes"', '{not json', '']) {
            const win = fakeWindow({ localStorage: fakeStorage({ 'cookie-consent': raw }) });
            vi.stubGlobal('window', win);
            expect(consent.readConsent()).toBeNull();
        }
    });

    it('reads only booleans as an answer', () => {
        vi.stubGlobal('window', fakeWindow({ localStorage: fakeStorage({ 'cookie-consent': '{"essential":1,"analytics":"true","other":true}' }) }));
        expect(consent.readConsent()).toEqual({});
        expect(consent.hasAnalyticsConsent()).toBe(false);

        vi.stubGlobal('window', fakeWindow({ localStorage: fakeStorage({ 'cookie-consent': '[true]' }) }));
        expect(consent.readConsent()).toEqual({});
    });

    it('keeps an answer from before the analytics flag readable, so the banner can ask again', () => {
        vi.stubGlobal('window', fakeWindow({ localStorage: fakeStorage({ 'cookie-consent': '{"essential":true}' }) }));
        expect(consent.readConsent()).toEqual({ essential: true });
        expect(typeof consent.readConsent()?.analytics).not.toBe('boolean');
        expect(consent.hasAnalyticsConsent()).toBe(false);
    });
});

describe('consent store when the choice cannot be written', () => {
    it('does not throw when storage is blocked, and honours the choice for the session', () => {
        const win = fakeWindow();
        Object.defineProperty(win, 'localStorage', { get: blocked });
        vi.stubGlobal('window', win);
        const onChange = vi.fn();
        consent.subscribeConsent(onChange);

        expect(consent.readConsent()).toBeNull();
        // This call used to throw out of the click handler, leaving the banner up for good.
        expect(() => consent.saveConsent({ essential: true, analytics: false })).not.toThrow();
        expect(consent.readConsent()).toEqual({ essential: true, analytics: false });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('lets a blocked-storage visitor withdraw again', () => {
        const win = fakeWindow();
        Object.defineProperty(win, 'localStorage', { get: blocked });
        vi.stubGlobal('window', win);

        consent.saveConsent({ essential: true, analytics: true });
        expect(consent.hasAnalyticsConsent()).toBe(true);

        expect(() => consent.withdrawConsent()).not.toThrow();
        expect(consent.readConsent()).toBeNull();
        expect(consent.hasAnalyticsConsent()).toBe(false);
    });

    it('falls back to memory when only the write fails (quota full)', () => {
        const storage = fakeStorage();
        storage.setItem = () => {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        };
        vi.stubGlobal('window', fakeWindow({ localStorage: storage }));

        consent.saveConsent({ essential: true, analytics: true });
        expect(storage.getItem('cookie-consent')).toBeNull();
        expect(consent.readConsent()).toEqual({ essential: true, analytics: true });
    });

    it('drops the in-memory copy once a write succeeds, so other tabs are heard again', () => {
        const storage = fakeStorage();
        const realSet = storage.setItem;
        storage.setItem = () => {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        };
        vi.stubGlobal('window', fakeWindow({ localStorage: storage }));

        consent.saveConsent({ essential: true, analytics: true });
        storage.setItem = realSet;
        consent.saveConsent({ essential: true, analytics: true });
        // Another tab withdraws: only storage changes.
        storage.removeItem('cookie-consent');
        expect(consent.readConsent()).toBeNull();
    });
});

describe('googleAdsCookieNames', () => {
    it("picks out Google's first-party ads cookies and nothing else", () => {
        const header = '_gcl_au=1.1.548177285.1791771668; theme=dark; _gcl_aw=GCL.1791.TESTCLICK; _gac_UA-1=1.1.x; _ga=GA1.1.1; gcl_au=nope';
        expect(consent.googleAdsCookieNames(header)).toEqual(['_gcl_au', '_gcl_aw', '_gac_UA-1']);
    });

    it('returns nothing for an empty cookie string', () => {
        expect(consent.googleAdsCookieNames('')).toEqual([]);
    });
});

describe('cookieDomainCandidates', () => {
    it('lists the host and each parent with at least two labels', () => {
        expect(consent.cookieDomainCandidates('btcdollarcostaverage.com')).toEqual(['btcdollarcostaverage.com']);
        expect(consent.cookieDomainCandidates('www.btcdollarcostaverage.com')).toEqual([
            'www.btcdollarcostaverage.com',
            'btcdollarcostaverage.com',
        ]);
    });

    it('never offers a bare TLD, an IP address or a single-label host', () => {
        expect(consent.cookieDomainCandidates('www.btcdollarcostaverage.com')).not.toContain('com');
        expect(consent.cookieDomainCandidates('localhost')).toEqual([]);
        expect(consent.cookieDomainCandidates('127.0.0.1')).toEqual([]);
        expect(consent.cookieDomainCandidates('[::1]')).toEqual([]);
        expect(consent.cookieDomainCandidates('')).toEqual([]);
    });
});

describe('clearGoogleAdsStorage', () => {
    it("removes Google's cookies however they were scoped, and its localStorage entry", () => {
        const storage = fakeStorage({
            _gcl_ls: '{"schema":"gcl"}',
            'cookie-consent': '{"essential":true,"analytics":false}',
            'theme-preference': 'dark',
        });
        const win = fakeWindow({ localStorage: storage, location: { hostname: 'www.btcdollarcostaverage.com' } });
        const jar = cookieJar([
            // gtag writes on the registrable domain in production...
            { name: '_gcl_au', value: '1.1.5', domain: 'btcdollarcostaverage.com' },
            { name: '_gcl_aw', value: 'GCL.1.CLICK', domain: 'btcdollarcostaverage.com' },
            // ...and host-only on localhost. Both forms have to go.
            { name: '_gcl_au', value: '1.1.6', domain: null },
            { name: 'unrelated', value: '1', domain: null },
        ]);
        vi.stubGlobal('window', win);
        vi.stubGlobal('document', jar);

        consent.clearGoogleAdsStorage();

        expect(jar.names()).toEqual(['unrelated']);
        expect(storage.getItem('_gcl_ls')).toBeNull();
        // The site's own keys are not Google's to lose.
        expect(storage.getItem('cookie-consent')).not.toBeNull();
        expect(storage.getItem('theme-preference')).toBe('dark');
    });

    it('does nothing, and does not throw, when cookies and storage are unreachable', () => {
        const win = fakeWindow();
        Object.defineProperty(win, 'localStorage', { get: blocked });
        const doc = {};
        Object.defineProperty(doc, 'cookie', { get: blocked, set: blocked });
        vi.stubGlobal('window', win);
        vi.stubGlobal('document', doc);
        expect(() => consent.clearGoogleAdsStorage()).not.toThrow();
    });
});

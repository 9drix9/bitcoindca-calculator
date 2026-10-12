import { describe, it, expect, afterEach, vi } from 'vitest';
import { readStorage, removeStorage, storageAvailable, storageKeys, writeStorage } from './safeStorage';

/** A working in-memory Storage. */
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

const securityError = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
};

/** What a browser set to block site data does: the property access itself throws. */
function blockedWindow() {
    const win = {};
    Object.defineProperty(win, 'localStorage', { get: securityError });
    Object.defineProperty(win, 'sessionStorage', { get: securityError });
    return win;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('safeStorage with working storage', () => {
    it('round-trips a value per area', () => {
        vi.stubGlobal('window', { localStorage: fakeStorage(), sessionStorage: fakeStorage() });
        expect(storageAvailable('local')).toBe(true);
        expect(readStorage('local', 'k')).toBeNull();
        expect(writeStorage('local', 'k', 'v')).toBe(true);
        expect(readStorage('local', 'k')).toBe('v');
        expect(readStorage('session', 'k')).toBeNull();
        expect(storageKeys('local')).toEqual(['k']);
        expect(removeStorage('local', 'k')).toBe(true);
        expect(readStorage('local', 'k')).toBeNull();
    });
});

describe('safeStorage when the browser blocks site data', () => {
    it('never throws: the getter raising SecurityError reads as "nothing stored"', () => {
        vi.stubGlobal('window', blockedWindow());
        expect(storageAvailable('local')).toBe(false);
        expect(storageAvailable('session')).toBe(false);
        expect(readStorage('local', 'theme-preference')).toBeNull();
        expect(writeStorage('local', 'theme-preference', 'dark')).toBe(false);
        expect(removeStorage('local', 'cookie-consent')).toBe(false);
        expect(storageKeys('local')).toEqual([]);
    });

    it('reports a failed write when only setItem throws (quota full)', () => {
        const storage = fakeStorage({ kept: '1' });
        storage.setItem = () => {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        };
        vi.stubGlobal('window', { localStorage: storage, sessionStorage: storage });
        expect(writeStorage('local', 'cookie-consent', '{}')).toBe(false);
        // Reads still work, so the caller can tell "full" from "blocked".
        expect(storageAvailable('local')).toBe(true);
        expect(readStorage('local', 'kept')).toBe('1');
    });

    it('survives getItem itself throwing', () => {
        const storage = fakeStorage();
        storage.getItem = securityError;
        vi.stubGlobal('window', { localStorage: storage, sessionStorage: storage });
        expect(readStorage('local', 'theme-preference')).toBeNull();
    });
});

describe('safeStorage on the server', () => {
    it('returns empty results when there is no window at all', () => {
        // vitest runs in node: `window` is not defined here.
        expect(typeof window).toBe('undefined');
        expect(storageAvailable('local')).toBe(false);
        expect(readStorage('local', 'k')).toBeNull();
        expect(writeStorage('session', 'k', 'v')).toBe(false);
        expect(storageKeys('session')).toEqual([]);
    });
});

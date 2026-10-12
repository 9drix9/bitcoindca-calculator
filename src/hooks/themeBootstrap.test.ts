import { describe, it, expect } from 'vitest';
import { THEME_BOOTSTRAP_SCRIPT, THEME_COLOR, THEME_KEY } from './themeBootstrap';

interface FakeMeta {
    name: string;
    content: string;
    parentNode: unknown;
}

/**
 * Runs the inline <head> script against a minimal fake DOM. The script is a
 * string of plain ES5 that only touches the handful of globals passed in here.
 */
function boot({ stored, osDark, storageBlocked = false }: { stored: string | null; osDark: boolean; storageBlocked?: boolean }) {
    const classes = new Set<string>();
    const metas: FakeMeta[] = [];
    const head = {
        appendChild(node: FakeMeta) {
            node.parentNode = head;
            metas.push(node);
        },
    };
    let onClassChange: (() => void) | null = null;
    const root = {
        classList: {
            add: (c: string) => void classes.add(c),
            remove: (c: string) => void classes.delete(c),
            contains: (c: string) => classes.has(c),
        },
    };
    const documentStub = {
        documentElement: root,
        head,
        createElement: (): FakeMeta => ({ name: '', content: '', parentNode: null }),
    };
    const windowStub = { matchMedia: () => ({ matches: osDark }) };
    const localStorageStub = {
        getItem: (key: string) => {
            if (storageBlocked) throw new DOMException('The operation is insecure.', 'SecurityError');
            return key === THEME_KEY ? stored : null;
        },
    };
    class MutationObserverStub {
        constructor(private callback: () => void) {}
        observe() {
            onClassChange = this.callback;
        }
    }

    // The body is the module's own compile-time constant, the exact text the
    // layout ships inline. Nothing from outside is interpolated into it.
    new Function('document', 'window', 'localStorage', 'MutationObserver', THEME_BOOTSTRAP_SCRIPT)(
        documentStub,
        windowStub,
        localStorageStub,
        MutationObserverStub,
    );

    return {
        isDark: () => classes.has('dark'),
        metas,
        /** What ThemeToggle does on a click, followed by the observer firing. */
        setDark(dark: boolean) {
            if (dark) classes.add('dark');
            else classes.delete('dark');
            onClassChange?.();
        },
        detachMeta() {
            metas[0].parentNode = null;
        },
    };
}

describe('theme bootstrap script: which theme', () => {
    it('follows an explicit stored choice over the OS', () => {
        expect(boot({ stored: 'dark', osDark: false }).isDark()).toBe(true);
        expect(boot({ stored: 'light', osDark: true }).isDark()).toBe(false);
    });

    it('follows the OS when nothing, "system" or an unrecognised value is stored', () => {
        for (const stored of [null, 'system', 'banana']) {
            expect(boot({ stored, osDark: true }).isDark()).toBe(true);
            expect(boot({ stored, osDark: false }).isDark()).toBe(false);
        }
    });

    it('still follows the OS when reading storage throws', () => {
        // One shared try/catch used to swallow the media query along with the
        // failed read, so an OS-dark visitor with site data blocked got light.
        expect(boot({ stored: null, osDark: true, storageBlocked: true }).isDark()).toBe(true);
        expect(boot({ stored: null, osDark: false, storageBlocked: true }).isDark()).toBe(false);
    });
});

describe('theme bootstrap script: theme-color', () => {
    it('creates exactly one unmediated theme-color tag matching the theme', () => {
        const dark = boot({ stored: 'dark', osDark: false });
        expect(dark.metas).toHaveLength(1);
        expect(dark.metas[0]).toMatchObject({ name: 'theme-color', content: THEME_COLOR.dark });
        expect(dark.metas[0]).not.toHaveProperty('media');

        const light = boot({ stored: 'light', osDark: true });
        expect(light.metas).toHaveLength(1);
        expect(light.metas[0].content).toBe(THEME_COLOR.light);
    });

    it('follows the in-app toggle, not the OS', () => {
        // OS light, visitor switches the site to dark: the bar must go dark too.
        const page = boot({ stored: null, osDark: false });
        expect(page.metas[0].content).toBe(THEME_COLOR.light);
        page.setDark(true);
        expect(page.metas[0].content).toBe(THEME_COLOR.dark);
        page.setDark(false);
        expect(page.metas[0].content).toBe(THEME_COLOR.light);
        expect(page.metas).toHaveLength(1);
    });

    it('puts the tag back if something removed it from <head>', () => {
        const page = boot({ stored: null, osDark: false });
        page.detachMeta();
        page.setDark(true);
        expect(page.metas).toHaveLength(2);
        expect(page.metas[1]).toBe(page.metas[0]);
        expect(page.metas[0].content).toBe(THEME_COLOR.dark);
    });

    it('is set even when storage is blocked', () => {
        const page = boot({ stored: null, osDark: true, storageBlocked: true });
        expect(page.metas[0].content).toBe(THEME_COLOR.dark);
    });
});

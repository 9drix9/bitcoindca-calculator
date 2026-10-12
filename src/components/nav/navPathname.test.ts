import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isEmbedPath, isPlainClick, normalizeNavPathname } from './navPathname';

describe('normalizeNavPathname', () => {
    it("maps Vercel's ISR render path for the home page to '/'", () => {
        // The server sees '/index', the browser sees '/'. If these two disagree
        // the nav renders different markup on each side and hydration fails.
        expect(normalizeNavPathname('/index')).toBe(normalizeNavPathname('/'));
        expect(normalizeNavPathname('/index')).toBe('/');
    });

    it('leaves every real route alone', () => {
        for (const path of ['/', '/about', '/dca', '/dca/100-per-week-since-2020', '/calculators/bitcoin-fire', '/embed']) {
            expect(normalizeNavPathname(path)).toBe(path);
        }
    });

    it('matches /index exactly, not as a prefix or a suffix', () => {
        expect(normalizeNavPathname('/index/')).toBe('/index/');
        expect(normalizeNavPathname('/indexes')).toBe('/indexes');
        expect(normalizeNavPathname('/dca/index')).toBe('/dca/index');
    });

    it('never returns null, so callers need no optional chaining', () => {
        expect(normalizeNavPathname(null)).toBe('/');
        expect(normalizeNavPathname(undefined)).toBe('/');
        expect(normalizeNavPathname('')).toBe('/');
    });
});

describe('isEmbedPath', () => {
    it('is true for the widget route only', () => {
        expect(isEmbedPath('/embed')).toBe(true);
        expect(isEmbedPath('/embed/anything')).toBe(true);
    });

    it('is false for /embed-guide, which is a normal page with navigation', () => {
        expect(isEmbedPath('/embed-guide')).toBe(false);
        expect(isEmbedPath('/')).toBe(false);
        expect(isEmbedPath('/about/embed')).toBe(false);
    });
});

describe('isPlainClick', () => {
    const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

    it('is true for an unmodified primary-button click', () => {
        expect(isPlainClick(click)).toBe(true);
    });

    it('is false for anything that opens the link somewhere else', () => {
        // Those must reach the browser untouched: a handler that prevents them
        // breaks "open in new tab".
        expect(isPlainClick({ ...click, button: 1 })).toBe(false);
        for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
            expect(isPlainClick({ ...click, [key]: true }), key).toBe(false);
        }
    });
});

describe('nav components', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const components = readdirSync(dir).filter((f) => f.endsWith('.tsx'));

    it('read the route only through useNavPathname', () => {
        // One component comparing the raw usePathname() value is enough to make
        // the server and the browser render different nav markup on the home page.
        expect(components.length).toBeGreaterThanOrEqual(4);
        for (const file of components) {
            const source = readFileSync(dir + file, 'utf8');
            expect(source, file).not.toMatch(/from 'next\/navigation'/);
            expect(source, file).not.toMatch(/\busePathname\(/);
        }
    });

    it('keep usePathname in exactly one place', () => {
        const hook = readFileSync(dir + 'useNavPathname.ts', 'utf8');
        expect(hook).toMatch(/normalizeNavPathname\(usePathname\(\)\)/);
    });
});

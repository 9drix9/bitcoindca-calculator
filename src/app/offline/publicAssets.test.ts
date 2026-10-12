import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Nothing checks a string like '/wallets/trezor.webp' against the disk: a
// renamed or deleted file ships as a broken image (WalletImage then falls back
// to its emoji card, so it does not even look like an error).
const ROOT = process.cwd();
const inPublic = (path: string): boolean => existsSync(join(ROOT, 'public', path));

const sourceFiles = (readdirSync(join(ROOT, 'src'), { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => join(ROOT, 'src', file));

describe('files the site points at in public/', () => {
    it('has every wallet image a page references', () => {
        const referenced = new Set<string>();
        for (const file of sourceFiles) {
            for (const match of readFileSync(file, 'utf8').matchAll(/['"`](\/wallets\/[^'"`\s]+)['"`]/g)) referenced.add(match[1]);
        }
        // Guards the scan: with no matches the loop below would pass on nothing.
        expect(referenced.size).toBeGreaterThan(0);
        for (const path of referenced) expect(inPublic(path), `${path} is referenced but not in public/`).toBe(true);
    });

    it('has every icon the web app manifest lists', () => {
        const manifest = JSON.parse(readFileSync(join(ROOT, 'public/manifest.json'), 'utf8')) as {
            icons: { src: string }[];
            shortcuts: { icons: { src: string }[] }[];
        };
        const icons = [...manifest.icons, ...manifest.shortcuts.flatMap((shortcut) => shortcut.icons)].map((icon) => icon.src);
        expect(icons.length).toBeGreaterThan(0);
        for (const path of icons) expect(inPublic(path), `${path} is in manifest.json but not in public/`).toBe(true);
    });
});

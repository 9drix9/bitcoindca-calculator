import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap, * as route from '@/app/sitemap';
import { CURATED_SCENARIOS, SCENARIOS } from '@/app/dca/scenarios';

const ORIGIN = 'https://btcdollarcostaverage.com';
const pathOf = (url: string): string => url.slice(ORIGIN.length);
const lastmodOf = (path: string): unknown => sitemap().find((entry) => pathOf(entry.url) === path)?.lastModified;

afterEach(() => {
    vi.useRealTimers();
});

describe('sitemap', () => {
    // A prerendered /sitemap.xml is deployed as a static file and never
    // regenerates, whatever `revalidate` says. That is how lastmod froze at the
    // build date for eight weeks in 2026. Do not swap this for `revalidate`.
    it('declares itself force-dynamic and exports no revalidate', () => {
        expect(route.dynamic).toBe('force-dynamic');
        expect(Object.keys(route)).not.toContain('revalidate');
    });

    it('dates the pages rebuilt from prices with the latest finished UTC day', () => {
        vi.useFakeTimers();

        vi.setSystemTime(Date.UTC(2026, 9, 12, 0, 0, 5));
        expect(lastmodOf('')).toBe('2026-10-11');
        expect(lastmodOf('/lump-sum-vs-dca')).toBe('2026-10-11');
        expect(lastmodOf('/calculators/bitcoin-fire')).toBe('2026-10-11');
        expect(lastmodOf(`/dca/${SCENARIOS[0].slug}`)).toBe('2026-10-11');
        expect(lastmodOf(`/dca/${CURATED_SCENARIOS[0].slug}`)).toBe('2026-10-11');

        // Same UTC day, one second before midnight: still yesterday's close.
        vi.setSystemTime(Date.UTC(2026, 9, 12, 23, 59, 59));
        expect(lastmodOf('')).toBe('2026-10-11');

        vi.setSystemTime(Date.UTC(2026, 2, 1, 6));
        expect(lastmodOf('')).toBe('2026-02-28');
    });

    it('gives every lastmod as a UTC day, and never one that has not begun', () => {
        // Real clock on purpose: a content page reviewed today is dated today,
        // so the only bound that always holds is "not in the future".
        for (const { url, lastModified } of sitemap()) {
            expect(lastModified, url).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(Date.parse(lastModified as string), url).toBeLessThanOrEqual(Date.now());
        }
    });

    // The pages below state their own review day in source, as a JSON-LD
    // dateModified or a dated constant. Two freshness signals that disagree
    // teach a crawler to ignore both, and they drifted apart for eight weeks in
    // 2026 because nothing compared them.
    it.each([
        ['/why-bitcoin', /"dateModified": "(\d{4}-\d{2}-\d{2})"/],
        ['/self-custody', /"dateModified": "(\d{4}-\d{2}-\d{2})"/],
        ['/mining', /"dateModified": "(\d{4}-\d{2}-\d{2})"/],
        ['/about', /"dateModified": "(\d{4}-\d{2}-\d{2})"/],
        ['/developers', /"dateModified": "(\d{4}-\d{2}-\d{2})"/],
        ['/coldcard', /dateModified: '(\d{4}-\d{2}-\d{2})'/],
        ['/author', /dateModified: '(\d{4}-\d{2}-\d{2})'/],
        ['/contact', /dateModified: '(\d{4}-\d{2}-\d{2})'/],
        ['/methodology', /LAST_UPDATED_ISO = '(\d{4}-\d{2}-\d{2})'/],
        ['/alternatives', /LAST_CHECKED_ISO = '(\d{4}-\d{2}-\d{2})'/],
        ['/alternatives/dcabtc', /LAST_CHECKED_ISO = '(\d{4}-\d{2}-\d{2})'/],
        ['/bitcoin-dca-tax', /LAST_REVIEWED = '(\d{4}-\d{2}-\d{2})'/],
    ] as const)('dates %s the same day the page dates itself', (path, pattern) => {
        const source = readFileSync(join(process.cwd(), 'src/app', path, 'page.tsx'), 'utf8');
        const stated = source.match(pattern)?.[1];
        expect(stated, `${path} no longer states its date in the form this test reads`).toBeDefined();
        expect(lastmodOf(path)).toBe(stated);
    });

    it('does not move a content page’s date with the clock', () => {
        vi.useFakeTimers();
        vi.setSystemTime(Date.UTC(2026, 9, 12));
        const before = lastmodOf('/privacy');
        vi.setSystemTime(Date.UTC(2027, 0, 1));
        expect(lastmodOf('/privacy')).toBe(before);
    });

    it('lists each address once, and only addresses that have a page', () => {
        const paths = sitemap().map((entry) => pathOf(entry.url));
        expect(new Set(paths).size).toBe(paths.length);

        const scenarioSlugs = new Set([...SCENARIOS, ...CURATED_SCENARIOS].map((s) => `/dca/${s.slug}`));
        const app = join(process.cwd(), 'src/app');
        for (const path of paths) {
            const file = scenarioSlugs.has(path) ? join(app, 'dca/[slug]/page.tsx') : join(app, path, 'page.tsx');
            expect(existsSync(file), `${path || '/'} has no page`).toBe(true);
        }
    });

    it('leaves out /embed, /share and /offline, which are noindex', () => {
        const paths = sitemap().map((entry) => pathOf(entry.url));
        for (const hidden of ['/embed', '/share', '/offline']) expect(paths).not.toContain(hidden);
    });
});

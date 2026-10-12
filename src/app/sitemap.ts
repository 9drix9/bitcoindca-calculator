import type { MetadataRoute } from 'next';
import { CURATED_SCENARIOS, SCENARIOS } from './dca/scenarios';
import { DAY_MS, utcIsoToday } from '@/utils/dates';
import { gridLastModified } from './dca/start-date-heatmap/grid';

// Rendered on request, on purpose. Left alone this route is prerendered at build,
// and a prerendered /sitemap.xml is deployed as a plain static file: Next's
// deployment adapter recognises it by name, emits it as a static asset and
// discards its `revalidate` (next/dist/build/adapter/build-complete.js, the
// isStaticMetadataFile branch). So the `revalidate = 86400` that used to sit
// here did nothing once deployed: the live file kept its build timestamp,
// 2026-08-17T19:08Z, on 121 URLs for eight weeks.
//
// A route that is dynamic is the one kind the adapter leaves as a function.
// This one does no I/O, so running it for each crawl costs next to nothing.
export const dynamic = 'force-dynamic';

// Honest per-page content dates, as UTC days. Update a page's entry when its
// content actually changes — do NOT use today's date (fake freshness trains
// Google to ignore lastmod for the whole domain).
const PAGE_DATES = {
    features: '2026-10-12',
    // These three must match the dateModified in each page's Article JSON-LD
    // (why-bitcoin, self-custody, mining) — conflicting freshness signals teach
    // Google to distrust lastmod for the whole domain.
    whyBitcoin: '2026-10-12',
    selfCustody: '2026-10-12',
    mining: '2026-10-12',
    // Must match dateModified in the coldcard page's Article JSON-LD.
    coldcard: '2026-10-12',
    about: '2026-10-12',
    methodology: '2026-10-12',
    embedGuide: '2026-10-12',
    developers: '2026-10-12',
    alternatives: '2026-10-12',
    privacy: '2026-10-12',
    terms: '2026-10-12',
    dcaIndex: '2026-10-12',
    calculators: '2026-10-12',
    author: '2026-10-12',
    // Must match dateModified in the contact page's JSON-LD.
    contact: '2026-10-12',
    dcaTax: '2026-10-12',
} as const satisfies Record<string, `${number}-${number}-${number}`>;

/** Pages whose numbers genuinely recompute against fresh prices every day. */
const DAILY_DATA_PAGES = [
    '/best-day-to-buy-bitcoin',
    '/lump-sum-vs-dca',
] as const;

/** Interactive tools: the copy is static, the figures are rendered from fresh prices. */
const CALCULATOR_PAGES = [
    '/calculators/bitcoin-drawdown',
    '/calculators/bitcoin-fire',
    '/calculators/stack-sats-goal',
    '/calculators/exchange-fees',
    '/calculators/bitcoin-cost-basis',
] as const;

/**
 * lastmod for every page that is rebuilt from prices each day: the latest
 * finished UTC day. That is the newest daily close such a page can hold, and it
 * is the day the best-day and lump-sum pages give as their JSON-LD dateModified, so the
 * two signals agree. A day and not a timestamp: a time of day would claim a
 * precision nothing here has.
 */
const lastClosedUtcDay = (now: number = Date.now()): string => utcIsoToday(now - DAY_MS);

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com').replace(/\/+$/, '');
    const dataDay = lastClosedUtcDay();

    return [
        {
            url: baseUrl,
            // The homepage genuinely changes daily (live prices, widgets).
            lastModified: dataDay,
            changeFrequency: 'daily',
            priority: 1,
        },
        {
            url: `${baseUrl}/calculators`,
            lastModified: PAGE_DATES.calculators,
            changeFrequency: 'monthly',
            priority: 0.9,
        },
        ...CALCULATOR_PAGES.map((path): MetadataRoute.Sitemap[number] => ({
            url: `${baseUrl}${path}`,
            lastModified: dataDay,
            changeFrequency: 'weekly',
            priority: 0.8,
        })),
        ...DAILY_DATA_PAGES.map((path): MetadataRoute.Sitemap[number] => ({
            url: `${baseUrl}${path}`,
            lastModified: dataDay,
            changeFrequency: 'daily',
            priority: 0.8,
        })),
        {
            // The heatmap's grid only gains a row when a calendar year closes,
            // so it carries the day the grid last changed (the same day the
            // page gives as its Dataset dateModified), not yesterday.
            url: `${baseUrl}/dca/start-date-heatmap`,
            lastModified: gridLastModified(Date.now() - DAY_MS),
            changeFrequency: 'yearly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/dca`,
            lastModified: PAGE_DATES.dcaIndex,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        // Scenario pages recompute against fresh prices every day (ISR, revalidate
        // 86400), so a moving lastModified is honest here — unlike the static
        // content pages below.
        ...SCENARIOS.map((s): MetadataRoute.Sitemap[number] => ({
            url: `${baseUrl}/dca/${s.slug}`,
            lastModified: dataDay,
            changeFrequency: 'daily',
            priority: 0.6,
        })),
        // Curated story scenarios — the shareable ones, so slightly higher priority.
        ...CURATED_SCENARIOS.map((s): MetadataRoute.Sitemap[number] => ({
            url: `${baseUrl}/dca/${s.slug}`,
            lastModified: dataDay,
            changeFrequency: 'daily',
            priority: 0.7,
        })),
        {
            url: `${baseUrl}/bitcoin-dca-tax`,
            lastModified: PAGE_DATES.dcaTax,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/features`,
            lastModified: PAGE_DATES.features,
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/why-bitcoin`,
            lastModified: PAGE_DATES.whyBitcoin,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/self-custody`,
            lastModified: PAGE_DATES.selfCustody,
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            // Incident write-up for an exploit that was still active when
            // published, hence 'weekly' — drop to 'monthly' once it settles.
            url: `${baseUrl}/coldcard`,
            lastModified: PAGE_DATES.coldcard,
            changeFrequency: 'weekly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/mining`,
            lastModified: PAGE_DATES.mining,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/methodology`,
            lastModified: PAGE_DATES.methodology,
            changeFrequency: 'monthly',
            priority: 0.6,
        },
        {
            url: `${baseUrl}/about`,
            lastModified: PAGE_DATES.about,
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        // Authorship and contact are E-E-A-T signals rather than ranking targets,
        // but they must be crawlable for Google to associate them with the site.
        {
            url: `${baseUrl}/author`,
            lastModified: PAGE_DATES.author,
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/contact`,
            lastModified: PAGE_DATES.contact,
            changeFrequency: 'yearly',
            priority: 0.4,
        },
        {
            // The embeddable widget itself (/embed) is intentionally absent: it is
            // noindex and only ever meant to load inside someone else's page.
            url: `${baseUrl}/embed-guide`,
            lastModified: PAGE_DATES.embedGuide,
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/developers`,
            lastModified: PAGE_DATES.developers,
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/alternatives`,
            lastModified: PAGE_DATES.alternatives,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/alternatives/dcabtc`,
            lastModified: PAGE_DATES.alternatives,
            changeFrequency: 'monthly',
            priority: 0.6,
        },
        {
            url: `${baseUrl}/privacy`,
            lastModified: PAGE_DATES.privacy,
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${baseUrl}/terms`,
            lastModified: PAGE_DATES.terms,
            changeFrequency: 'yearly',
            priority: 0.3,
        },
    ];
}

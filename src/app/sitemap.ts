import type { MetadataRoute } from 'next';
import { SCENARIOS } from './dca/scenarios';

// The sitemap is a static route, so without this it would be generated once at
// build time and every `new Date()` below would be frozen at the build date —
// the "daily" pages would advertise a lastmod that never moved.
export const revalidate = 86400;

// Honest per-page content dates. Update a page's entry when its content
// actually changes — do NOT use new Date() (fake freshness trains Google
// to ignore lastmod for the whole domain).
const PAGE_DATES = {
    features: new Date('2026-07-25'),
    whyBitcoin: new Date('2026-07-25'),
    selfCustody: new Date('2026-07-25'),
    mining: new Date('2026-07-25'),
    about: new Date('2026-07-24'),
    methodology: new Date('2026-08-08'),
    embedGuide: new Date('2026-07-25'),
    privacy: new Date('2026-07-24'),
    terms: new Date('2026-07-24'),
    dcaIndex: new Date('2026-07-24'),
    calculators: new Date('2026-08-08'),
    author: new Date('2026-08-08'),
    contact: new Date('2026-08-08'),
    dcaTax: new Date('2026-08-08'),
} as const;

/** Pages whose numbers genuinely recompute against fresh prices every day. */
const DAILY_DATA_PAGES = [
    '/best-day-to-buy-bitcoin',
    '/lump-sum-vs-dca',
    '/dca/start-date-heatmap',
] as const;

/** Interactive tools: the shell is static, the data is live. */
const CALCULATOR_PAGES = [
    '/calculators/bitcoin-drawdown',
    '/calculators/bitcoin-fire',
    '/calculators/stack-sats-goal',
    '/calculators/exchange-fees',
    '/calculators/bitcoin-cost-basis',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com').replace(/\/+$/, '');
    const now = new Date();

    return [
        {
            url: baseUrl,
            // The homepage genuinely changes daily (live prices, widgets).
            lastModified: now,
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
            lastModified: now,
            changeFrequency: 'weekly',
            priority: 0.8,
        })),
        ...DAILY_DATA_PAGES.map((path): MetadataRoute.Sitemap[number] => ({
            url: `${baseUrl}${path}`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 0.8,
        })),
        {
            url: `${baseUrl}/dca`,
            lastModified: PAGE_DATES.dcaIndex,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        // Scenario pages recompute against fresh prices every day (ISR, revalidate
        // 86400), so a live lastModified is honest here — unlike the static
        // content pages below.
        ...SCENARIOS.map((s): MetadataRoute.Sitemap[number] => ({
            url: `${baseUrl}/dca/${s.slug}`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 0.6,
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

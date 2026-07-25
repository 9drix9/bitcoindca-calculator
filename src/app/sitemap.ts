import type { MetadataRoute } from 'next';
import { SCENARIOS } from './dca/scenarios';

// Honest per-page content dates. Update a page's entry when its content
// actually changes — do NOT use new Date() (fake freshness trains Google
// to ignore lastmod for the whole domain).
const PAGE_DATES = {
    features: new Date('2026-07-25'),
    whyBitcoin: new Date('2026-07-25'),
    selfCustody: new Date('2026-07-25'),
    mining: new Date('2026-07-25'),
    about: new Date('2026-07-24'),
    methodology: new Date('2026-07-24'),
    embedGuide: new Date('2026-07-25'),
    privacy: new Date('2026-07-24'),
    terms: new Date('2026-07-24'),
    dcaIndex: new Date('2026-07-24'),
} as const;

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com').replace(/\/+$/, '');

    return [
        {
            url: baseUrl,
            // The homepage genuinely changes daily (live prices, widgets).
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1,
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
            url: `${baseUrl}/about`,
            lastModified: PAGE_DATES.about,
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/methodology`,
            lastModified: PAGE_DATES.methodology,
            changeFrequency: 'monthly',
            priority: 0.6,
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
            url: `${baseUrl}/dca`,
            lastModified: PAGE_DATES.dcaIndex,
            changeFrequency: 'monthly',
            priority: 0.7,
        },
        // Scenario pages recompute against fresh prices every day (ISR, revalidate
        // 86400), so a live lastModified is honest here — unlike the static
        // content pages above.
        ...SCENARIOS.map((s): MetadataRoute.Sitemap[number] => ({
            url: `${baseUrl}/dca/${s.slug}`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.6,
        })),
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

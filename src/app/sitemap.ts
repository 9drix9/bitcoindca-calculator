import type { MetadataRoute } from 'next';

// Honest per-page content dates. Update a page's entry when its content
// actually changes — do NOT use new Date() (fake freshness trains Google
// to ignore lastmod for the whole domain).
const PAGE_DATES = {
    features: new Date('2026-07-24'),
    whyBitcoin: new Date('2026-07-24'),
    selfCustody: new Date('2026-07-24'),
    mining: new Date('2026-07-24'),
    about: new Date('2026-07-24'),
    methodology: new Date('2026-07-24'),
    privacy: new Date('2026-07-24'),
    terms: new Date('2026-07-24'),
} as const;

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com';

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

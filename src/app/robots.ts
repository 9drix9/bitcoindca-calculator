import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com';

    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                // NOTE: never disallow /_next/ — it blocks Googlebot from all JS/CSS
                // and breaks rendering-based indexing.
                disallow: ['/api/', '/offline'],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}

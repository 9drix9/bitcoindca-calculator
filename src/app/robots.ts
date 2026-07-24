import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    // Trailing slash stripped: the env var may include one, which would produce "…com//sitemap.xml"
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com').replace(/\/+$/, '');

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

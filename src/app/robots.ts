import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    // Trailing slash stripped: the env var may include one, which would produce "…com//sitemap.xml"
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com').replace(/\/+$/, '');

    return {
        rules: [
            {
                userAgent: '*',
                // /api/og renders the share card image, and /share points both
                // og:image and twitter:image at it. Blanket-disallowing /api/ told
                // every crawler not to fetch the one asset the sharing loop depends
                // on, so a shared result unfurled as a bare link. The more specific
                // allow wins over the disallow below for that one path.
                allow: ['/', '/api/og'],
                // NOTE: never disallow /_next/ — it blocks Googlebot from all JS/CSS
                // and breaks rendering-based indexing. /offline is deliberately NOT
                // disallowed: it relies on its meta noindex, which a crawl-blocked
                // URL could never surface (same pattern as /share and /embed).
                disallow: ['/api/'],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    };
}

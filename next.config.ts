import type { NextConfig } from 'next';

const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Framing is locked to same-origin everywhere except /embed (see below).
    // Both headers are sent: frame-ancestors (CSP Level 2) formally obsoletes
    // X-Frame-Options, but XFO is kept as defence-in-depth for older clients.
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
    },
];

const nextConfig: NextConfig = {
    devIndicators: false,
    experimental: {
        optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: securityHeaders,
            },
            {
                // The embeddable widget only has a reason to exist inside someone
                // else's page, and the site-wide SAMEORIGIN above made that
                // impossible — /embed-guide has been publishing a copy-paste
                // iframe snippet that could never render anywhere but here.
                //
                // The embeddable widget only has a reason to exist inside someone
                // else's page, and the site-wide SAMEORIGIN above made that
                // impossible — /embed-guide has been publishing a copy-paste iframe
                // snippet that could never render anywhere but here.
                //
                // Later rules override earlier ones per header key, so this rule
                // relaxes framing for /embed alone. X-Frame-Options has no
                // "allow any origin" value, so it is set to a deliberately invalid
                // one: browsers must ignore an XFO header they cannot parse, which
                // leaves frame-ancestors in charge. Emitting exactly one XFO header
                // matters — two conflicting values are treated as DENY by some
                // browsers.
                //
                // The route serves no cookies, no auth and no user data, so there is
                // nothing here to clickjack.
                source: '/embed',
                headers: [
                    ...securityHeaders.filter(
                        (h) => h.key !== 'X-Frame-Options' && h.key !== 'Content-Security-Policy',
                    ),
                    { key: 'X-Frame-Options', value: 'ALLOWALL' },
                    { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
                ],
            },
            {
                source: '/sw.js',
                headers: [
                    { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
                    { key: 'Service-Worker-Allowed', value: '/' },
                ],
            },
        ];
    },
};

export default nextConfig;

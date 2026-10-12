import type { NextConfig } from 'next';

const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Framing is locked to same-origin everywhere except /embed (see below).
    // Both headers are sent: frame-ancestors (CSP Level 2) formally obsoletes
    // X-Frame-Options, but XFO is kept as defence-in-depth for older clients.
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    // Origin only, on same-site requests too. The calculator keeps its settings
    // in the address, and every request a page makes carries that address as
    // its referrer unless this says otherwise. /privacy, /about and /contact
    // say the analytics reports do not carry it, and that the ad frames learn
    // only which site sent them; both statements depend on this value.
    { key: 'Referrer-Policy', value: 'strict-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
    },
];

// stackmysats.com is a second domain on the same Vercel project. It exists to be
// said aloud and retyped; btcdollarcostaverage.com stays the only host that serves
// pages, holds the index, the JSON-LD entity @ids, the embed src and the API docs
// (see docs/brand.md). Both the apex and www resolve to this deployment, so the
// host must be matched as a regex — Next anchors it (^…$) and lower-cases it.
const SECOND_DOMAIN_HOST = '(www\\.)?stackmysats\\.com';
const PRIMARY_ORIGIN = 'https://btcdollarcostaverage.com';

const nextConfig: NextConfig = {
    devIndicators: false,
    // Every client gets a page's metadata in <head>. Left to itself, Next sends
    // the tags of a per-request page there only to the crawlers on its own
    // list, and to everyone else appends them to <body> once generateMetadata
    // has resolved. A link-preview fetcher that reads no further than </head>
    // then finds no title, description or image, and /share exists to be
    // unfurled. Setting the option replaces Next's list instead of adding to
    // it, so the pattern has to match everything.
    //
    // The price is that such a page sends nothing until its metadata is ready.
    // /share is the only one whose metadata waits on something its page does
    // not (prices), and it caps that wait itself (CARD_WAIT_MS in
    // src/app/share/page.tsx).
    //
    // One client is out of reach: Next never tests a request that carries no
    // User-Agent header at all, so that one still gets the streamed form.
    htmlLimitedBots: /.*/,
    experimental: {
        optimizePackageImports: ['lucide-react', 'recharts'],
    },
    async redirects() {
        return [
            {
                // Every path on stackmysats.com — including /sw.js, /manifest.json,
                // /_next/* and /api/* — 301s to the same path on the primary, so
                // nothing is ever served (or installed as a PWA) on that origin.
                //
                // A plain redirect with nothing added: btcdollarcostaverage.com is
                // the only name the site goes by, and analytics reports carry no
                // query string, so a tag here would only sit in the address bar.
                // Both Next (prepare-destination) and Vercel's edge pass the
                // request's own query string through, so share links survive.
                //
                // It lives here, not in the Vercel dashboard "Redirect to"
                // setting, because both domains are set to serve; never run
                // both, the dashboard answers first and hides this rule.
                //
                // 301 rather than permanent:true (308): the site is GET-only and
                // 301 is understood by every client, including old link checkers.
                source: '/:path*',
                has: [{ type: 'host', value: SECOND_DOMAIN_HOST }],
                destination: `${PRIMARY_ORIGIN}/:path*`,
                statusCode: 301,
            },
        ];
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
            {
                // Last on purpose: later rules override earlier ones per header key, and
                // the /embed rule above re-spreads the full security set.
                //
                // Next exempts /_next/* from user redirects (the compiled source regex
                // starts with `(?!/_next)`), so static chunks ARE served on the second
                // host, and the site-wide rule above would stamp them with the primary's
                // HSTS `preload` directive. Preload is a two-year, effectively
                // irreversible promise about every subdomain of the registrable
                // domain; a host that only ever redirects should not make it. Verified
                // with `next start`: the 301s themselves carry no header rules, and a
                // /_next chunk on the second host gets max-age only.
                source: '/(.*)',
                has: [{ type: 'host', value: SECOND_DOMAIN_HOST }],
                headers: [{ key: 'Strict-Transport-Security', value: 'max-age=63072000' }],
            },
        ];
    },
};

export default nextConfig;

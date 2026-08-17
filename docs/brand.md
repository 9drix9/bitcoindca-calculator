# Names and domains

Decided 2026-08-17. Change this file before changing anything it describes.

## Names

| Thing | Name |
|---|---|
| Product, site, publisher (H1, title template, `siteName`, JSON-LD `WebSite`/`Organization`, manifest) | **Bitcoin DCA Calculator** |
| Wordmark (`LogoLockup`), PWA `short_name` | Bitcoin DCA / BTC DCA |
| Mark | The Ð monogram (`src/components/brand/Logo.tsx` + `scripts/generate-icons.js`) |
| Author | drix (@9drix9). Never the legal name. |
| "Stack My Sats" | A spoken address only. Not the product name, not the publisher. |

"Bitcoin DCA Calculator" is the search query people type. It stays on every page
that ranks. Do not rename it, and do not half-rename it (brand strings changed while
the H1, canonicals and URLs stay).

## Domains

**btcdollarcostaverage.com** is the only host that serves pages. It holds the index,
`metadataBase`, every canonical, the sitemap and robots, the JSON-LD entity ids
(`#website`, `#organization`, `author#person`), the `/embed` iframe `src` published
on `/embed-guide`, the `/developers` curl examples, the `/api/og` card text, the PWA
and service worker, and all browser state (cost basis, currency, sats mode).

**stackmysats.com** (and www) is a 301 front door. Every path redirects to the same
path on the primary with `?utm_source=stackmysats` appended. Nothing is served on it,
nothing is indexed, no sitemap, no PWA. The rule lives in `next.config.ts`
(`redirects()` with `has: host`), and the same file drops HSTS `preload` for that host.

Why it exists: a human can say and retype it. It has no search demand of its own
("stack my sats" autocompletes away), so it is not a traffic lever and never will be.
The UTM is the only way to learn whether anyone types it: Vercel Web Analytics does not
fire on a redirect and runtime logs keep about a day.

Vercel: both stackmysats domains are set to **serve** (no dashboard "Redirect to"), so
the code path is the only path. Never run both; the dashboard answers first and hides
the code.

## What never moves without a written migration plan

Canonicals, `metadataBase`, sitemap, robots, JSON-LD `@id`s, the embed `src`, the API
docs. There are ~90 hardcoded `btcdollarcostaverage.com` literals across ~40 files and
only four read `NEXT_PUBLIC_BASE_URL`; a move is a coordinated project, not a config
flip. Do not start it speculatively.

## If the name is going to be said aloud

Only then, and as one change:

- `WebSite.alternateName: "Stack My Sats"` in `src/app/layout.tsx`, a plain-text line
  on `/about` and in the footer ("Also reachable at stackmysats.com"), and short paths
  on the primary (`/goal`, `/fire`, `/drawdown`, `/fees`, `/heatmap`, `/best-day`).
- Print `stackmysats.com` **only** on the artefacts a person retypes: the Share My
  Stack PNG card and receipt (`ShareMyStack.tsx`) and the chart watermark
  (`DcaChart.tsx`), with the wordmark beside it. Leave `/api/og`, every
  `opengraph-image.tsx` footer, `shareData.ts`, the embed snippet, the curl examples
  and all JSON-LD on the served domain, so no unfurled card shows two domains.
- Within two weeks, check that a search for "stackmysats" returns the primary first.
  Watch the displayed site name in Search Console for four weeks; remove the
  `alternateName` if the site name flips.

Before printing the name anywhere: auto-renew, registrar lock and a multi-year renewal
at Name.com. A name baked into PNGs and podcast audio is a phishing surface if the
domain ever lapses. If it is ever dropped, revert the printed artefacts first.

## Do not

- Serve the app on both hosts, or route a subset of pages to stackmysats.com. It splits
  browser state, PWA identity and link equity for a domain with no links.
- Read `headers()` in the root layout, `sitemap.ts`, `robots.ts` or any
  `opengraph-image.tsx` to make metadata host-aware. It flips ~130 prerendered
  routes to per-request rendering.
- Sell merch under the name. US Reg. 6712920 "STACK SATS 0.00000001" is live in
  Class 25 (apparel). Software and education are clear.
- Open brand social accounts nobody will post from. `@stackmysats` on X is a dormant
  third-party account; `@stack_my_sats` and `youtube.com/@stackmysats` were free on
  2026-08-17. drix stays the voice.
- Launch accounts, streaks, leaderboards or a newsletter under the name. "My" already
  hints at accounts; the positioning is no accounts, no email capture.

## Measuring

Monthly: Search Console queries containing "sats" or "stack" for
`/calculators/stack-sats-goal`; `utm_source=stackmysats` in Vercel Web Analytics.
No typed traffic after 8–12 weeks: leave the redirect forever and stop thinking about it.

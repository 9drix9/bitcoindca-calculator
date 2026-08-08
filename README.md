# Bitcoin DCA Calculator

A comprehensive Bitcoin Dollar Cost Averaging calculator with real-time market data, interactive charts, and advanced financial planning tools. Built with Next.js 16, TypeScript, and Tailwind CSS.

**Live:** [btcdollarcostaverage.com](https://btcdollarcostaverage.com)

## Features

### Core Calculator
- **DCA Simulation** — Calculate returns from recurring Bitcoin purchases (daily, weekly, bi-weekly, monthly) with customizable amounts, date ranges, and exchange fee percentages
- **Live Price Data** — Fetches historical daily prices from Kraken and Coinbase public APIs with closest-match fallback for missing dates
- **Multi-Currency Support** — Input amounts in USD, EUR, GBP, CAD, AUD, or JPY with automatic conversion
- **ATH Presets** — One-click scenarios: "What if I started DCA at the 2013, 2017, or 2021 all-time high?"
- **CSV Export** — Download full transaction history with dates, prices, amounts, and portfolio values

### Charts & Visualization
- **Interactive Portfolio Chart** — Tabbed single-axis Recharts chart: "Portfolio" (value vs total invested) and "BTC Price" (price with an average-cost reference line and buy markers). Log-scale toggle, brush zoom, and a theme-aware crosshair tooltip
- **Asset Comparisons** — Overlay S&P 500, Gold, and CPI-adjusted returns on the same chart
- **Multi-Asset Growth Chart** — BTC vs S&P 500 vs Gold DCA growth on one shared axis
- **Historical Events** — Toggle vertical markers for Mt. Gox collapse, China bans, COVID crash, El Salvador adoption, ETF approval, and $100k milestone
- **Bitcoin Halving Lines** — Visual halving markers with epoch labels
- **Power Law Trend** — Optional logarithmic trendline overlay

### Sidebar Widgets (Real-Time)
- **Halving Countdown** — Current block height, blocks remaining, estimated date, and epoch progress bar
- **Live Block Feed** — Latest 5 confirmed blocks with height, time ago, transaction count, and size (polls every 30s with new-block highlighting)
- **Fear & Greed Index** — Market sentiment gauge with color-coded indicator
- **Mempool Fees** — Current Bitcoin transaction fee rates (low/medium/high priority)
- **Hash Rate & Difficulty** — Network hashrate in EH/s, difficulty, next adjustment percentage, and blocks until retarget
- **Supply Scarcity** — Circulating supply progress bar toward 21M cap, estimated lost coins, current block reward
- **Purchasing Power** — CPI-based comparison of dollar depreciation vs Bitcoin appreciation since 2015
- **Lightning Network** — Node count, channel count, and total network capacity in BTC
- **Bitcoin Dominance** — BTC market cap dominance percentage with progress bar
- **Sat/USD Converter** — Bidirectional satoshi-to-fiat converter with live price

### Advanced Financial Tools
- **Risk & Return Metrics** — Money-weighted annualized return (XIRR, solved by Newton's method with a bisection fallback), max drawdown, best/worst buy, and total fees paid
- **Historical Win Rate** — The share of comparable DCA windows since 2010 that ended in profit, computed across the full price history for your chosen frequency and duration
- **Plan Comparison** — Overlay up to three DCA plans (different amounts, schedules, or start dates) on one shared axis with per-plan summaries
- **Drawdown / DCA-Out Calculator** — Simulates spending the stack down: how long it lasts at a given monthly withdrawal, with inflation-adjusted withdrawals, bear/base/bull scenarios, and a bisection-solved sustainable withdrawal figure
- **Sats-First Mode** — A persisted site-wide denomination preference; every Bitcoin amount renders in BTC or satoshis
- **Future Projection** — When end date is in the future, projects forward from three editable annual rates that bracket a loss, no change and a gain (−20%, 0%, +20% by default). These are stated assumptions, not forecasts, plus custom target price mode
- **FIRE Calculator** — Years until financial independence using the 4% withdrawal rule across three appreciation scenarios (conservative 10%, moderate 25%, aggressive 50%)
- **Savings Account Comparison** — Side-by-side comparison of BTC DCA vs traditional savings with editable APY
- **Cost Basis Tracker** — Track multiple DCA positions with independent date ranges, amounts, and fees (persisted in localStorage)
- **Unit Bias Calculator** — Shows how your satoshi stack compares to the global fair share (21M BTC / 8B people)
- **Stacking Goal Tracker** — Progress toward custom BTC accumulation targets
- **Price Prediction Scenarios** — Project portfolio value at user-defined future BTC prices
- **Lump Sum Comparison** — What if you had invested the total amount on day one instead?
- **Exchange Fee Comparison** — Compare fees across major exchanges (Coinbase, Kraken, Binance, Cash App, Strike, Swan, River) with your specific investment pattern
- **Opportunity Cost Calculator** — "What If You Skipped..." shows what daily habits (coffee, streaming, eating out, smoking) would be worth if invested in Bitcoin over 5 years
- **Inflation-Adjusted Returns** — CPI-adjusted real returns using FRED data

### Educational Content
- **Features Guide Page** — Comprehensive `/features` page explaining every tool and widget in simple, beginner-friendly terms
- **Why Bitcoin Page** — `/why-bitcoin` covers how the protocol actually works, what the value rests on, an evidence scorecard grading common claims (including ones this project previously repeated), open risks such as the long-run security budget, and a misconceptions FAQ. Article + FAQPage JSON-LD
- **Methodology Page** — `/methodology` documents every data source, the exact DCA/XIRR/drawdown formulas, where data is interpolated, known limitations, and a changelog
- **Bitcoin Adoption Tracker** — Interactive chart comparing Bitcoin's adoption curve to early internet growth, with global owner estimates and Metcalfe's Law context
- **Rotating Bitcoin Quotes** — Curated quotes from Satoshi Nakamoto, Michael Saylor, Milton Friedman, and others
- **FAQ with Structured Data** — JSON-LD FAQ schema for rich search results

### Other
- **Share My Stack** — Generate and download a shareable portfolio summary image
- **Dark Mode** — System-aware theme toggle with localStorage persistence
- **PWA Ready** — Web app manifest with PNG icons for iOS and Android home screen
- **Vercel Analytics** — Built-in analytics and speed insights integration
- **Ad Placements** — Two fixed-height, lazy-loaded A-ADS slots. Google AdSense was deliberately removed in July 2026: surveillance display advertising contradicts the site's stated privacy position, and A-ADS is Bitcoin-native and cookieless
- **Cookie Consent** — GDPR-compliant consent banner

### SEO & Performance
- **Structured Data** — WebSite, FAQPage, and Article JSON-LD schemas
- **Dynamic OG Images** — Per-page Open Graph images generated at the edge with SVG Bitcoin logo
- **Optimized Meta Tags** — Proper title, description, canonical, and Twitter card tags on every page
- **Sitemap & Robots** — Auto-generated `sitemap.xml` and `robots.txt`
- **Font Loading** — `display: swap` prevents invisible text during font load
- **Programmatic Scenario Pages** — 104 prerendered `/dca/{amount}-per-{week|month}-since-{year}` pages with server-computed results, year-by-year tables, and FAQPage + BreadcrumbList JSON-LD (ISR, revalidated daily)
- **Result-Specific Share Cards** — `/share` serves Open Graph metadata and a generated `/api/og` image reflecting the shared calculation's actual numbers
- **Lazy Loading** — Dynamic imports for below-fold charts (`BitcoinAdoption`), on-demand `html-to-image` loading, and lazy ad iframes
- **Semantic HTML** — Proper heading hierarchy (one h1 per page), `<main>`, `<header>`, `<footer>`, `<article>`, `<section>` elements

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm, pnpm, or yarn

### Installation

```bash
git clone https://github.com/9drix9/bitcoindca-calculator.git
cd bitcoindca-calculator
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Required for CPI inflation data (inflation-adjusted returns)
FRED_API_KEY=your_fred_api_key_here

# Base URL for sitemap and canonical URLs (defaults to https://btcdollarcostaverage.com)
NEXT_PUBLIC_BASE_URL=https://btcdollarcostaverage.com

# Optional. Overrides the Lightning donation address shown alongside the on-chain
# address in the footer. Defaults to the project's own address; set to an empty
# string to hide the Lightning row entirely.
NEXT_PUBLIC_LIGHTNING_ADDRESS=
```

Get a free FRED API key at [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html).

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

### Lint

```bash
npm run lint
```

### Testing

The DCA engine has a [Vitest](https://vitest.dev/) suite at `src/utils/dca.test.ts` covering
`calculateDca`, `calculateLumpSum`, and `calculateXirr` — UTC day bucketing, fee handling,
frequency schedules, drawdown, and XIRR convergence.

```bash
npm test        # single run
npm run test:watch
```

The engine is pure and deterministic, so the suite needs no network access or API keys. Run it
before any change to `src/utils/dca.ts` or `src/utils/dates.ts`.

## Brand assets

`scripts/generate-icons.js` is the single source for every rasterised icon — the multi-frame
`src/app/favicon.ico`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`,
and the `public/icon-*.svg` vector fallbacks referenced by the manifest. None of those files are
hand-edited; they are all generated.

```bash
node scripts/generate-icons.js
```

The script's geometry mirrors `src/components/brand/Logo.tsx`, which renders the mark in-app. **If
you change the logo, change both and re-run the script** — otherwise the in-app mark and the icons
the OS and browser chrome show will drift apart.

## Architecture

```
src/
  app/
    page.tsx              # Home page (server component, fetches all widget data)
    layout.tsx            # Root layout with header, footer, theme, WebSite JSON-LD
    actions.ts            # Server actions (13 API integrations)
    sitemap.ts            # Auto-generated sitemap
    robots.ts             # Robots.txt configuration
    globals.css           # Tailwind CSS entry point
    opengraph-image.tsx   # Dynamic OG image (edge runtime)
    features/
      page.tsx            # Features guide page
    why-bitcoin/
      page.tsx            # "Why Bitcoin" educational page with Article JSON-LD
      opengraph-image.tsx # Page-specific OG image
    privacy/
      page.tsx
    terms/
      page.tsx
  components/
    DcaCalculator.tsx     # Main calculator (client component)
    DcaChart.tsx          # Recharts ComposedChart with overlays
    EducationalContent.tsx
    BitcoinAdoption.tsx   # Adoption curve chart (dynamically imported)
    FutureProjection.tsx  # Future returns projection (when end date > today)
    AdSlot.tsx            # Lazy-loaded ad iframe wrapper
    ThemeToggle.tsx
    CookieConsent.tsx
    BtcDonationButton.tsx
    ShareMyStack.tsx      # Stack card image export (dynamic html-to-image)
    # Sidebar widgets (all SSR with client-side polling)
    LiveBlocksWidget.tsx
    HalvingCountdownWidget.tsx
    FearGreedWidget.tsx
    MempoolFeeWidget.tsx
    HashRateWidget.tsx
    SupplyScarcityWidget.tsx
    PurchasingPowerWidget.tsx
    LightningWidget.tsx
    DominanceWidget.tsx
    SatConverterWidget.tsx
    # Advanced tools
    UnitBiasCalculator.tsx
    SavingsComparison.tsx
    OpportunityCostCalculator.tsx
    ExchangeFeeComparison.tsx
    FireCalculator.tsx
    CostBasisTracker.tsx
  types/
    index.ts              # Shared TypeScript types
  utils/
    dca.ts                # Core DCA calculation logic
    dca.test.ts           # Vitest suite for the DCA engine
    dates.ts              # UTC date helpers (every rendered date goes through here)
    csv.ts                # CSV export helpers
    urlParams.ts          # URL state encoding/decoding
scripts/
  generate-icons.js       # Single source for every icon — re-run after any logo change
```

## External APIs

| API | Purpose | Rate Limit Strategy |
|-----|---------|-------------------|
| Kraken | Historical BTC prices | Per-request |
| Coinbase | Fallback price data | Per-request |
| mempool.space | Block height, fees, hashrate, difficulty, lightning stats, recent blocks | 30-60s polling |
| blockchain.info | Circulating supply | 5min polling |
| CoinGecko | BTC dominance, market cap | 5min revalidate |
| alternative.me | Fear & Greed Index | 5min polling |
| FRED (Federal Reserve) | CPI data (inflation-adjusted returns) | 24h LRU cache |
| Yahoo Finance | S&P 500 and Gold historical data | Per-request |
| frankfurter.app | ECB reference FX rates for display currencies | 12h cache |
| Static snapshot | Real daily BTC prices Aug 2010 – Jun 2015 (`src/data/btcHistorical.ts`, sourced from blockchain.info) | Bundled |

All external API calls are made server-side via Next.js server actions. Widgets render from server-supplied `initialData` and poll for updates client-side, gated on tab visibility. When data is unavailable a widget keeps its last known good value and otherwise renders an explicit "Data unavailable" state — it never silently disappears or renders zeros as fact.

Provider history is fetched in full, cached per provider, and sliced per request; Kraken and Coinbase automatically fall back to one another on failure.

## Deployment

Optimized for [Vercel](https://vercel.com/):

1. Push to GitHub
2. Import in Vercel
3. Add environment variables (`FRED_API_KEY`, `NEXT_PUBLIC_BASE_URL`)
4. Deploy

Also works with any Node.js hosting that supports Next.js 16.

## Tech Stack

| Technology | Version |
|-----------|---------|
| Next.js | 16.1.3 |
| React | 19 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| Recharts | 3 |
| date-fns | 4 |
| lucide-react | 0.562 |
| clsx | 2 |
| html-to-image | 1.11 (lazy-loaded) |
| @vercel/analytics | 1.6 |
| @vercel/speed-insights | 1.3 |

## License

MIT

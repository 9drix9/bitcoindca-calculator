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
- **Interactive Portfolio Chart** — Total Invested vs Portfolio Value over time with Recharts
- **Asset Comparisons** — Overlay S&P 500, Gold, and CPI-adjusted returns on the same chart
- **M2 Money Supply Overlay** — Normalized Federal Reserve M2 data plotted alongside your portfolio
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
- **FIRE Calculator** — Years until financial independence using the 4% withdrawal rule across three appreciation scenarios (conservative 10%, moderate 25%, aggressive 50%)
- **Savings Account Comparison** — Side-by-side comparison of BTC DCA vs traditional savings with editable APY
- **Cost Basis Tracker** — Track multiple DCA positions with independent date ranges, amounts, and fees (persisted in localStorage)
- **Unit Bias Calculator** — Shows how your satoshi stack compares to the global fair share (21M BTC / 8B people)
- **Stacking Goal Tracker** — Progress toward custom BTC accumulation targets
- **Price Prediction Scenarios** — Project portfolio value at user-defined future BTC prices
- **Lump Sum Comparison** — What if you had invested the total amount on day one instead?
- **Exchange Fee Impact** — Visualize how different fee tiers erode returns over time
- **Inflation-Adjusted Returns** — CPI-adjusted real returns using FRED data

### Educational Content
- **Why Bitcoin Page** — Dedicated `/why-bitcoin` page explaining Bitcoin's value proposition across four pillars: user adoption, network effects, cost of mining, and exiting fiat. Includes a satoshi explainer with price-level table. Static page with Article JSON-LD for rich search results
- **Bitcoin Adoption Tracker** — Interactive chart comparing Bitcoin's adoption curve to early internet growth, with global owner estimates and Metcalfe's Law context
- **Rotating Bitcoin Quotes** — Curated quotes from Satoshi Nakamoto, Michael Saylor, Milton Friedman, and others
- **FAQ with Structured Data** — JSON-LD FAQ schema for rich search results

### Other
- **Share My Stack** — Generate and download a shareable portfolio summary image
- **Dark Mode** — System-aware theme toggle with localStorage persistence
- **PWA Ready** — Web app manifest for add-to-homescreen
- **Ad Placements** — Three ad slots with lazy-loaded iframes
- **Cookie Consent** — GDPR-compliant consent banner

### SEO & Performance
- **Structured Data** — WebSite, FAQPage, and Article JSON-LD schemas
- **Dynamic OG Images** — Per-page Open Graph images generated at the edge with SVG Bitcoin logo
- **Optimized Meta Tags** — Proper title, description, canonical, and Twitter card tags on every page
- **Sitemap & Robots** — Auto-generated `sitemap.xml` and `robots.txt`
- **Font Loading** — `display: swap` prevents invisible text during font load
- **Preconnect Hints** — DNS prefetch and preconnect for external API domains
- **Lazy Loading** — Dynamic imports for below-fold charts (`BitcoinAdoption`), on-demand `html-to-image` loading, and lazy ad iframes
- **Semantic HTML** — Proper heading hierarchy (one h1 per page), `<main>`, `<header>`, `<footer>`, `<article>`, `<section>` elements

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm, pnpm, or yarn

### Installation

```bash
git clone https://github.com/yourusername/bitcoin-dca-calculator.git
cd bitcoin-dca-calculator
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Required for M2 Money Supply data and CPI inflation data
FRED_API_KEY=your_fred_api_key_here

# Base URL for sitemap and canonical URLs (defaults to https://btcdollarcostaverage.com)
NEXT_PUBLIC_BASE_URL=https://btcdollarcostaverage.com
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
    FireCalculator.tsx
    CostBasisTracker.tsx
  types/
    index.ts              # Shared TypeScript types
  utils/
    dca.ts                # Core DCA calculation logic
    csv.ts                # CSV export helpers
    urlParams.ts          # URL state encoding/decoding
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
| FRED (Federal Reserve) | M2 money supply, CPI data | 24h LRU cache |
| Yahoo Finance | S&P 500 historical data | Per-request |

All external API calls are made server-side via Next.js server actions. Widgets pass `initialData` from the server and poll for updates client-side. All widgets gracefully return `null` when API data is unavailable.

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

## License

MIT

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
- **Fear & Greed Index** — Market sentiment gauge with color-coded indicator
- **Mempool Fees** — Current Bitcoin transaction fee rates (low/medium/high priority)
- **Hash Rate & Difficulty** — Network hashrate in EH/s, difficulty, next adjustment percentage, and blocks until retarget
- **Supply Scarcity** — Circulating supply progress bar toward 21M cap, estimated lost coins, current block reward
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

### Other
- **Share My Stack** — Generate and download a shareable portfolio summary image
- **Rotating Bitcoin Quotes** — Curated quotes from Satoshi Nakamoto, Michael Saylor, Milton Friedman, and others
- **FAQ with Structured Data** — JSON-LD FAQ schema for rich search results
- **Dark Mode** — System-aware theme toggle with localStorage persistence
- **PWA Ready** — Web app manifest for add-to-homescreen
- **Google AdSense** — Three ad placements with push-guard protection against double-rendering
- **SEO** — Auto-generated sitemap.xml, robots.txt, OpenGraph, and Twitter card metadata
- **Cookie Consent** — GDPR-compliant consent banner

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
    page.tsx          # Home page (server component, fetches all widget data)
    layout.tsx        # Root layout with header, footer, theme, AdSense
    actions.ts        # Server actions (12 API integrations)
    sitemap.ts        # Auto-generated sitemap
    robots.ts         # Robots.txt configuration
    globals.css       # Tailwind CSS entry point
  components/
    DcaCalculator.tsx # Main calculator (client component, ~1200 lines)
    DcaChart.tsx      # Recharts ComposedChart with overlays
    EducationalContent.tsx
    AdSlot.tsx        # AdSense wrapper with push-guard
    GoogleAdSense.tsx # AdSense script loader
    ThemeToggle.tsx
    CookieConsent.tsx
    BtcDonationButton.tsx
    ShareMyStack.tsx
    # Sidebar widgets
    HalvingCountdownWidget.tsx
    FearGreedWidget.tsx
    MempoolFeeWidget.tsx
    HashRateWidget.tsx
    SupplyScarcityWidget.tsx
    LightningWidget.tsx
    DominanceWidget.tsx
    SatConverterWidget.tsx
    # Advanced tools
    UnitBiasCalculator.tsx
    SavingsComparison.tsx
    FireCalculator.tsx
    CostBasisTracker.tsx
  types/
    index.ts          # Shared TypeScript types
  utils/
    dca.ts            # Core DCA calculation logic
```

## External APIs

| API | Purpose | Rate Limit Strategy |
|-----|---------|-------------------|
| Kraken | Historical BTC prices | Per-request |
| Coinbase | Fallback price data | Per-request |
| mempool.space | Block height, fees, hashrate, difficulty, lightning stats | 60s polling |
| blockchain.info | Circulating supply | 5min polling |
| CoinGecko | BTC dominance, market cap | 5min revalidate |
| alternative.me | Fear & Greed Index | 5min polling |
| FRED (Federal Reserve) | M2 money supply, CPI data | 24h LRU cache |
| Yahoo Finance | S&P 500 historical data | Per-request |

All external API calls are made server-side via Next.js server actions. Widgets gracefully hide when API data is unavailable.

## AdSense Configuration

The app uses three ad placements:

1. **Top slot** — Below the calculator inputs
2. **Mid-content slot** — Between the chart and transaction table
3. **Sidebar slot** — Bottom of the sidebar widget stack

To configure your own AdSense:
- Update the `data-ad-client` in `src/components/AdSlot.tsx`
- Update the `content` meta tag in `src/app/layout.tsx`
- Update `public/ads.txt` with your publisher ID
- Replace slot IDs in `src/components/DcaCalculator.tsx` and `src/app/page.tsx`

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
| React | 19.2.3 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| Recharts | 3.6.0 |
| date-fns | 4.1.0 |
| lucide-react | 0.562.0 |
| clsx | 2.1.1 |
| tailwind-merge | 3.4.0 |
| html-to-image | 1.11.13 |

## License

MIT

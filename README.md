# Bitcoin DCA Calculator

A free, open-source Bitcoin dollar-cost-averaging backtester. It answers one question honestly: if you had bought a fixed amount of Bitcoin on a schedule, what would you have now? It uses real market prices back to August 2010, computes money-weighted returns (XIRR) and max drawdown, compares the result against the S&P 500 (total return), gold, and inflation, and publishes its full methodology, including the places where the model falls short of reality. No accounts, no email capture, no price predictions.

**Live:** [btcdollarcostaverage.com](https://btcdollarcostaverage.com)

## Screenshots

<!-- OWNER TODO before launch: add 2-3 screenshots here.
     Suggested shots:
       1. The main calculator with a completed backtest (chart + stats strip)
       2. The start-date heatmap (/dca/start-date-heatmap)
       3. The embeddable widget or a /share card
     Put the images in docs/screenshots/ and reference them like:
       ![Main calculator](docs/screenshots/calculator.png)
     Dark mode screenshots read better on GitHub's default themes. -->

*Screenshots coming — see the live site in the meantime.*

## Features

### The core backtest

- **DCA simulation** — recurring buys (daily, weekly, bi-weekly, monthly) with custom amounts, date ranges, and an exchange-fee percentage that drags on returns the way it does on a real exchange
- **Real data back to 2010** — simulations can start in August 2010 at around $0.07. Prices before an exchange's own candles begin come from a bundled blockchain.info daily snapshot, not from extrapolation. If there is no price for a date, the engine does not invent one
- **Risk and return metrics** — money-weighted annualized return (XIRR, Newton's method with a bisection fallback), max drawdown, best/worst buy, total fees paid
- **Historical win rate** — the share of comparable DCA windows since 2010 that ended in profit, for your chosen frequency and duration
- **Lump sum comparison** — what the same total invested on day one would be worth, priced with the same lookback rules as the DCA leg
- **Asset comparisons** — overlay S&P 500 total return (`^SP500TR`, dividends reinvested), gold, and CPI-adjusted real returns on the same chart
- **Plan comparison** — up to three DCA plans (different amounts, schedules, start dates) on one shared axis
- **Multi-currency display** — USD, EUR, GBP, CAD, AUD, JPY at live ECB reference rates (all math runs in USD; historical FX is not modeled and the methodology page says so)
- **CSV export** — full transaction history with dates, prices, amounts, and portfolio values

### Standalone studies (recomputed daily against fresh prices)

- **[Start-date heatmap](https://btcdollarcostaverage.com/dca/start-date-heatmap)** — annualized returns for a $100/month DCA by start year and holding period, each window valued at its own end date
- **[Lump sum vs DCA](https://btcdollarcostaverage.com/lump-sum-vs-dca)** — every start month since 2010, with win rates, median edge, and the worst windows shown alongside the average
- **[Best day to buy](https://btcdollarcostaverage.com/best-day-to-buy-bitcoin)** — seven identical weekly schedules, one per weekday. The page's conclusion is that the spread between them is start-date noise, and it shows you exactly where the noise comes from instead of crowning a winner
- **[112 scenario pages](https://btcdollarcostaverage.com/dca)** — prerendered `/dca/{amount}-per-{week|month}-since-{year}` backtests plus 8 curated story scenarios ("bought the exact 2021 top", "a coffee a day"), each with year-by-year tables

### Planning tools

- **FIRE calculator** — years until the 4% rule covers your spending, across three editable annual price-change scenarios that deliberately include a losing path
- **Drawdown / DCA-out calculator** — how long a stack lasts at a given monthly withdrawal, with inflation-adjusted withdrawals and a bisection-solved sustainable-withdrawal figure
- **Cost basis tracker** — multiple positions with independent dates, amounts, and fees, stored only in your browser's localStorage
- **Stack-sats goal tracker, exchange fee comparison, savings-account comparison, opportunity-cost calculator, unit-bias calculator** — all under [/calculators](https://btcdollarcostaverage.com/calculators)
- **Future projection** — when the end date is in the future, projects forward from three editable annual rates that bracket a loss, no change, and a gain (−20% / 0% / +20% by default). Stated assumptions, not forecasts

### Live network widgets

Halving countdown, latest blocks, mempool fees, hashrate and difficulty, supply scarcity, Lightning stats, Fear & Greed, BTC dominance, purchasing power vs CPI, and a sat/fiat converter. All fetched server-side, polled client-side gated on tab visibility. When a provider fails, a widget shows an explicit "unavailable" state instead of rendering zeros as fact.

### Sharing, embedding, and the API

- **Share cards** — `/share` serves Open Graph metadata and a generated `/api/og` image with the shared calculation's actual numbers
- **Embeddable widget** — one iframe drops a live DCA result card into any page ([guide](https://btcdollarcostaverage.com/embed-guide)). No API key. The embed loads no third-party scripts and sets no cookies, and that promise is enforced in code
- **Public API** — free JSON endpoints for the same price history and DCA math the site uses, documented at [/developers](https://btcdollarcostaverage.com/developers) <!-- OWNER TODO: verify /developers is deployed and the docs match the endpoints before publishing this README -->
- **Provider health endpoint** — `/api/health` probes all nine upstream data sources individually, without the silent fallbacks that would keep a broken provider looking green

### Education

Plain-English guides with sources: [why Bitcoin](https://btcdollarcostaverage.com/why-bitcoin) (including an evidence scorecard that grades common claims, some of which this project itself used to repeat), [self-custody](https://btcdollarcostaverage.com/self-custody), [mining](https://btcdollarcostaverage.com/mining), [DCA tax basics](https://btcdollarcostaverage.com/bitcoin-dca-tax), and a [features guide](https://btcdollarcostaverage.com/features).

### Platform

- **PWA** — installable, with a real offline page and bounded runtime caches
- **Dark mode** — system-aware, persisted
- **Sats-first mode** — a persisted site-wide denomination preference; every Bitcoin amount renders in BTC or satoshis
- **Accessibility** — 44px touch targets, AA contrast checked against the installed design tokens, screen-reader tables for charts
- **SEO** — JSON-LD structured data where a visible counterpart exists on the page (and only there), honest per-page `lastmod` dates, per-result OG images

## Quickstart

```bash
git clone https://github.com/9drix9/bitcoindca-calculator.git
cd bitcoindca-calculator
npm install
npm run dev      # http://localhost:3000
npm test         # Vitest suite for the DCA engine and dataset checks
npm run build    # production build
```

Node.js 20.9 or later (required by Next.js 16).

### Environment variables

Create a `.env.local` in the project root. Everything is optional for local development except CPI-based features:

```env
# Required for CPI inflation data (inflation-adjusted returns)
FRED_API_KEY=your_fred_api_key_here

# Base URL for sitemap and canonical URLs (defaults to https://btcdollarcostaverage.com)
NEXT_PUBLIC_BASE_URL=https://btcdollarcostaverage.com

# Optional. Overrides the Lightning donation address shown in the footer.
# Defaults to the project's own address; set to an empty string to hide the row.
NEXT_PUBLIC_LIGHTNING_ADDRESS=
```

Get a free FRED API key at [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html).

## Architecture

Next.js App Router, React 19, TypeScript, Tailwind CSS 4, Recharts. All market-data fetches happen server-side through server actions in `src/app/actions.ts`; the browser never talks to an upstream API directly, and no personal data is sent to any provider.

```
src/
  app/
    page.tsx                    # Home: calculator + widgets (server component)
    actions.ts                  # Server actions: every upstream API integration
    api/health/route.ts         # Per-provider health probe (no masking fallbacks)
    api/og/route.tsx            # Generated share-card images
    calculators/                # FIRE, drawdown, cost basis, sats goal, fees
    dca/                        # 112 scenario pages + start-date heatmap
    best-day-to-buy-bitcoin/    # The weekday study (see Data honesty below)
    lump-sum-vs-dca/            # Rolling-window lump sum study
    embed/  embed-guide/        # Embeddable result card + publisher guide
    methodology/                # Every source, formula, and limitation
    why-bitcoin/  self-custody/  mining/  bitcoin-dca-tax/   # Guides
  components/                   # Calculator, charts, widgets, tools
  data/
    btcHistorical.ts            # Real 2010-2015 daily closes (blockchain.info)
  utils/
    dca.ts                      # The DCA engine: pure, deterministic, tested
    dca.test.ts                 # Engine tests (UTC bucketing, fees, XIRR, drawdown)
    dates.ts                    # UTC day helpers — every rendered date goes through here
    datasets.ts + tests         # Detects interpolated vs real daily series
    csv.ts  urlParams.ts        # Export and URL state
```

### Where the math lives

`src/utils/dca.ts` is the whole engine: `calculateDca`, `calculateLumpSum`, `calculateXirr`. It is a pure function of its inputs, so the Vitest suite runs with no network and no API keys. Two design decisions worth knowing before you touch it:

- **Everything is bucketed by UTC calendar day.** Exchange candles are UTC-aligned; doing schedule math in local time silently shifts every purchase date by a day for users west of Greenwich.
- **No price means no purchase.** The price lookup returns nothing for dates before the first known bar rather than the earliest known price. Backfilling would fabricate history: a 2009 start date pricing 18 months of buys at 2010's $0.07 would conjure billions out of a few thousand dollars.

Run `npm test` before any change to `dca.ts` or `dates.ts`.

## Data provenance

The full story is on the live [methodology page](https://btcdollarcostaverage.com/methodology); the short version:

- **August 2010 – July 2015:** a bundled static snapshot of real daily market prices from blockchain.info (`src/data/btcHistorical.ts`). That history no longer changes, so it ships with the repo. It replaced an earlier synthetic interpolation; no prices are fabricated anywhere in the pipeline.
- **2015 onward (Coinbase source):** real daily candles, stitched to meet the snapshot at Coinbase's first BTC-USD daily candle (2015-07-20) with no gap.
- **Kraken source (default):** weekly closes linearly interpolated to daily values. This smooths intra-week volatility, and the site says so rather than presenting the interpolation as daily data. Pages whose conclusions depend on real daily structure detect which series they actually received and disclose it.
- **Gaps** carry the last known price forward rather than skipping the buy.
- **Comparisons:** S&P 500 total return and gold from Yahoo Finance, CPI from FRED, FX display rates from the ECB via frankfurter.app.

Known limitations are listed on the methodology page too: no taxes, no withdrawal fees, no spread modeling, one price per day.

## External APIs

| API | Purpose | Cadence |
|-----|---------|---------|
| Kraken | Historical BTC prices (default source) | Cached ~1 hour |
| Coinbase | Real daily candles from 2015 (alternate source) | Cached ~1 hour |
| mempool.space | Blocks, fees, hashrate, difficulty, Lightning | 30s – 5 min |
| blockchain.info | Circulating supply (live); 2010–2015 daily prices (bundled) | ~5 min / fixed |
| CoinGecko | BTC dominance, market cap | ~5 min |
| alternative.me | Fear & Greed Index | ~5 min |
| FRED (St. Louis Fed) | CPI series | 24h cache |
| Yahoo Finance | S&P 500 total return, gold | Cached ~1 hour |
| frankfurter.app | ECB reference FX rates | ~12h cache |

Provider history is fetched in full, cached per provider, and sliced per request; Kraken and Coinbase fall back to one another on failure. `/api/health` probes each provider directly so a fallback cannot hide an outage from the owner.

## Deployment

Built for [Vercel](https://vercel.com/) (push, import, set `FRED_API_KEY` and `NEXT_PUBLIC_BASE_URL`, deploy), but it is a standard Next.js app and runs on any Node.js host that supports it.

## Brand assets

`scripts/generate-icons.js` is the single source for every rasterised icon: the multi-frame `src/app/favicon.ico`, the PNG/SVG icons in `public/`, and the apple-touch icon. None are hand-edited. The script's geometry mirrors `src/components/brand/Logo.tsx`, which renders the mark in-app. If you change the logo, change both and re-run the script, or the in-app mark and the OS-level icons will drift apart.

```bash
node scripts/generate-icons.js
```

## Contributing

Issues and pull requests are welcome, especially ones that catch a wrong number. The bar for merging anything that touches the math or the published figures: it must be verifiable. If you change `src/utils/dca.ts`, add or update a test that would have failed before your change. If you challenge a claim on the site, link a source. The methodology page is the contract with users; code that contradicts it is a bug in one of the two.

## License

[MIT](LICENSE). Fork it, self-host it, embed it.

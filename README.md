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

- **DCA simulation** — recurring buys (daily, weekly, bi-weekly, monthly) with custom amounts and date ranges, and a per-buy fee (a percentage, a flat amount, or both) taken out of each purchase the way an exchange takes it
- **Real data back to 2010** — simulations can start on 2010-08-18 at around $0.07. Before 2015-07-20 prices come from a bundled blockchain.info daily snapshot; from then on they are Coinbase daily closes by default. A purchase dated before the first known price is skipped, not priced at an invented one
- **Estimated prices are marked** — a day the source has no price for is filled along a straight line between its neighbours and flagged as an estimate, per row, in the engine's output, the CSV export and the API. On the optional Kraken series that is about six days in seven (see Data provenance)
- **Risk and return metrics** — money-weighted annualized return (XIRR, Newton's method with a bisection fallback), max drawdown, best/worst buy, total fees paid
- **Range of past outcomes** — the same plan run from every past start date: worst, 10th percentile, median, 90th percentile and best total return, the share of runs that ended below cost, and how many non-overlapping periods the history holds
- **Lump sum comparison** — what the same total invested on day one would be worth, priced with the same lookback rules as the DCA leg
- **Asset comparisons** — overlay S&P 500 total return (`^SP500TR`, dividends reinvested), gold, and CPI-adjusted real returns on the same chart
- **Plan comparison** — up to three DCA plans (different amounts, schedules, start dates) on one shared axis
- **Multi-currency display** — USD, EUR, GBP, CAD, AUD, JPY at live ECB reference rates (all math runs in USD; historical FX is not modeled and the methodology page says so)
- **CSV export** — every purchase made so far, with dates, prices, amounts, and portfolio values, plus a column saying which prices are estimates when the series has any. A file in a currency other than US dollars ends with a column giving the one exchange rate every figure in it was converted at. Buys that a plan with a future end date has not made yet are left out

### Standalone studies (recomputed daily against fresh prices)

- **[Start-date heatmap](https://btcdollarcostaverage.com/dca/start-date-heatmap)** — annualized returns for a $100/month DCA by start year and holding period, each window valued at its own end date
- **[Lump sum vs DCA](https://btcdollarcostaverage.com/lump-sum-vs-dca)** — every start month since 2010, with win rates, median edge, and the worst windows shown alongside the average
- **[Best day to buy](https://btcdollarcostaverage.com/best-day-to-buy-bitcoin)** — seven identical weekly schedules, one per weekday, and a week-by-week test of each weekday against the seven days around it. The page's conclusion is that the spread between the seven plans is start-date noise and that no weekday stands outside the margin of error. It shows where the noise comes from instead of crowning a winner
- **[112 scenario pages](https://btcdollarcostaverage.com/dca)** — 104 prerendered `/dca/{amount}-per-{week|month}-since-{year}` backtests and 8 curated story scenarios ("bought the exact 2021 top", "a coffee a day"), each with year-by-year tables

### Planning tools

- **FIRE calculator** — years until the 4% rule covers your spending, across three editable annual price-change scenarios that deliberately include a losing path
- **Drawdown / DCA-out calculator** — how long a stack lasts at a given monthly withdrawal, with inflation-adjusted withdrawals and a bisection-solved sustainable-withdrawal figure
- **Cost basis tracker** — multiple positions with independent dates, amounts, and fees, stored only in your browser's localStorage
- **Stack-sats goal tracker and exchange fee comparison** — on their own pages under [/calculators](https://btcdollarcostaverage.com/calculators), with the three tools above. The fee comparison reads one sourced record per platform from `src/data/exchangeFees.ts`
- **Savings-account comparison, opportunity-cost calculator, unit-bias calculator** — inside the main calculator's results
- **Future projection** — when the end date is in the future, projects forward from three editable annual rates that bracket a loss, no change, and a gain (−20% / 0% / +20% by default). Stated assumptions, not forecasts

### Live network widgets

Halving countdown, latest blocks, mempool fees, hashrate and difficulty, supply scarcity, Lightning stats, Fear & Greed, BTC dominance, purchasing power vs CPI, and a sat/fiat converter. Every figure is fetched server-side. While the tab is visible the browser polls two same-origin GET routes, `/api/live/ticker` for the price ticker and `/api/live/sidebar` for every card in one request; they take no parameters, and the requests carry no cookies and no referrer. When a provider fails and a widget has no figure, it shows an explicit "unavailable" state instead of rendering zeros as fact. A widget that already has a figure keeps it. Once that figure is older than its bound (5, 15 or 30 minutes, by how fast it moves) the card says "Could not refresh", with the time it was last updated when that is known; the price ticker and the sat converter mark an old quote "last known".

### Sharing, embedding, and the API

- **Share cards** — `/share` serves Open Graph metadata and a generated `/api/og` image with the shared calculation's actual numbers
- **Embeddable widget** — one iframe drops a live DCA result card into any page ([guide](https://btcdollarcostaverage.com/embed-guide)). No API key. The embed loads no third-party scripts and sets no cookies, and that promise is enforced in code
- **Public API** — free JSON and CSV endpoints for the same price history and DCA math the site uses, documented at [/developers](https://btcdollarcostaverage.com/developers)
- **Provider health endpoint** — `/api/health` runs twelve checks across the nine upstream providers, asking each one directly, without the silent fallbacks that would keep a broken provider looking green

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
npm test         # Vitest suite: the DCA engine, the price pipeline, the API, the data tables
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

Next.js App Router, React 19, TypeScript, Tailwind CSS 4, Recharts. Every market-data fetch happens server-side in `src/app/actions.ts`. The calculator reaches it through server actions; the price ticker and the network widgets poll two GET routes under `/api/live` that call the same module. The browser never talks to an upstream API directly, and no personal data is sent to any provider.

```
src/
  app/
    page.tsx                    # Home: calculator + widgets (server component)
    actions.ts                  # Server actions: every upstream API integration
    api/health/route.ts         # Per-provider health probe (no masking fallbacks)
    api/live/                   # Ticker and widget figures, polled by the browser
    api/og/route.tsx            # Generated share-card images
    api/v1/                     # Public JSON/CSV API (documented at /developers)
    calculators/                # FIRE, drawdown, cost basis, sats goal, fees
    dca/                        # 112 scenario pages + start-date heatmap
    best-day-to-buy-bitcoin/    # The weekday study
    lump-sum-vs-dca/            # Rolling-window lump sum study
    embed/  embed-guide/        # Embeddable result card + publisher guide
    methodology/                # Every source, formula, and limitation
    why-bitcoin/  self-custody/  mining/  bitcoin-dca-tax/   # Guides
  components/                   # Calculator, charts, widgets, tools
  data/
    btcHistorical.ts            # Daily market prices, Aug 2010 to Jul 2015 (blockchain.info)
    priceSources.ts             # Which exchange is the default, and the words used to say so
    exchangeFees.ts             # Published recurring-buy costs, one sourced record per platform
    currencies.ts               # Display currencies and the dated fallback FX rates
    planDefaults.ts             # The calculator's default plan
  utils/
    dca.ts                      # The DCA engine: tested, no network, clock only through `asOf`
    dca.test.ts                 # Engine tests (UTC bucketing, fees, XIRR, drawdown)
    dates.ts                    # UTC day helpers for schedule, "today" and price-bucketing math
    priceSeries.ts + tests      # One price per UTC day, each marked observed or estimated
    datasets.ts + tests         # Start-date walks and outcome ranges behind the studies
    csv.ts  urlParams.ts        # Export and URL state
```

### Where the math lives

`src/utils/dca.ts` is the whole engine: `calculateDca`, `calculateDcaToDate`, `calculateLumpSum`, `calculateXirr`. It makes no network calls, so the Vitest suite runs with no network and no API keys.

It reads the clock in one situation: when the caller leaves out `asOf`. `calculateDca` uses `asOf` as the moment the stack is valued, which dates the final XIRR cash flow, and `calculateDcaToDate` also uses it as "today" when it cuts a plan off at the purchases that have already happened. Pass `asOf` and the same plan, prices and spot price always give the same result. Leave it out and it falls back to the current time, so `xirrPercent` drifts from day to day for an identical plan, while totals, ROI and drawdown from `calculateDca` do not. Pass it whenever a result has to be reproducible: a test, a cached page, a server render that is hydrated later.

Three design decisions worth knowing before you touch it:

- **Everything is bucketed by UTC calendar day.** Exchange candles are UTC-aligned; doing schedule math in local time silently shifts every purchase date by a day for users west of Greenwich.
- **No price means no purchase.** The price lookup returns nothing for dates before the first known bar rather than the earliest known price. Backfilling would fabricate history: a 2009 start date pricing 18 months of buys at 2010's $0.07 would conjure billions out of a few thousand dollars.
- **A fee is taken from the buy, not added to it.** Each purchase loses `min(amount, amount × percent + flat fee)` before any bitcoin is bought. Total invested and the XIRR cash flows use the full amount, because that is what left the bank.

Run `npm test` before any change to `dca.ts` or `dates.ts`.

## Data provenance

The full story is on the live [methodology page](https://btcdollarcostaverage.com/methodology); the short version:

- **August 2010 – July 2015:** a bundled static snapshot of blockchain.info's daily market price (`src/data/btcHistorical.ts`), a cross-exchange average stamped at 00:00 UTC. That history no longer changes, so it ships with the repo. It replaced an earlier synthetic interpolation.
- **2015 onward (Coinbase source, the default):** real daily candles, stitched to meet the snapshot at Coinbase's first BTC-USD daily candle (2015-07-20) with no gap.
- **Kraken source (optional, and the fallback when Coinbase is unreachable):** weekly closes, with the days in between filled along a straight line. About six days in seven are estimates, and each is marked as one. A straight line through a week cannot fall as far as the week did, so drawdowns can read shallower on this series than on daily closes. The three study pages (start-date heatmap, lump sum vs DCA, best day to buy) are never computed on it: when Coinbase's daily closes cannot be had, each keeps its last published version.
- **Gaps** inside a series are filled along a straight line between the prices on either side and marked as estimates. A purchase dated after the newest price uses the last known price rather than being skipped, and that is marked as an estimate too. Nothing else in the pipeline is a price no source reported.
- **Comparisons:** S&P 500 total return and gold from Yahoo Finance, CPI from FRED, FX display rates from the ECB via Frankfurter (frankfurter.dev).

Known limitations are listed on the methodology page too: no taxes, no withdrawal fees, no spread modeling, one price per day.

## External APIs

| API | Purpose | Cadence |
|-----|---------|---------|
| Coinbase | Daily BTC-USD candles from 2015-07-20 (default source); spot price | History ~1 hour, spot ~1 min |
| Kraken | Weekly BTC candles (optional source, and Coinbase's fallback); live price ticker | History ~1 hour, ticker ~30s |
| mempool.space | Blocks, fees, hashrate, difficulty, Lightning | 30s – 10 min |
| blockchain.info | Circulating supply (live); 2010–2015 daily prices (bundled) | ~5 min / fixed |
| CoinGecko | BTC dominance, market cap | ~5 min |
| alternative.me | Fear & Greed Index | ~5 min |
| FRED (St. Louis Fed) | CPI series | 24h cache |
| Yahoo Finance | S&P 500 total return, gold | Cached ~1 hour |
| Frankfurter (frankfurter.dev) | ECB reference FX rates | ~12h cache |

Provider history is fetched in full, cached per provider, and sliced per request. When an exchange fails, the copy of its series fetched earlier the same UTC day is used if there is one; otherwise Kraken and Coinbase fall back to one another. The result says which exchange actually answered and whether its copy is out of date, so the page can tell the reader. A failed exchange is not asked again for 30 seconds. `/api/health` probes each provider directly so a fallback cannot hide an outage from the owner.

## Deployment

Built for [Vercel](https://vercel.com/) (push, import, set `FRED_API_KEY` and `NEXT_PUBLIC_BASE_URL`, deploy), but it is a standard Next.js app and runs on any Node.js host that supports it.

One thing to handle off Vercel. The calculator keeps a visitor's plan in the query string, and under `next start` the cached home page is regenerated with the query string of whichever request triggered it, which then sits in the page source served to everyone until the next regeneration. Strip the query string from requests for `/` before they reach Next (a reverse-proxy rule), or do not cache that page. On Vercel the regeneration runs without a query.

## Brand assets

`scripts/generate-icons.js` is the single source for every icon file: the multi-frame `src/app/favicon.ico`, the vector favicon `src/app/icon.svg`, and the PNG icons in `public/` (the PWA icons, the maskable one and the apple-touch icon). None are hand-edited. The script's geometry mirrors `src/components/brand/Logo.tsx`, which renders the mark in-app. If you change the logo, change both and re-run the script, or the in-app mark and the OS-level icons will drift apart.

```bash
node scripts/generate-icons.js
```

## Contributing

Issues and pull requests are welcome, especially ones that catch a wrong number. The bar for merging anything that touches the math or the published figures: it must be verifiable. If you change `src/utils/dca.ts`, add or update a test that would have failed before your change. If you challenge a claim on the site, link a source. The methodology page is the contract with users; code that contradicts it is a bug in one of the two.

## License

[MIT](LICENSE). Fork it, self-host it, embed it.

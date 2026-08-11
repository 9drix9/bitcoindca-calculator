import { Suspense } from 'react';
import Link from 'next/link';
import { HowItWorks } from '@/components/HowItWorks';
import { EducationalContent } from '@/components/EducationalContent';
import { FearGreedWidget } from '@/components/FearGreedWidget';
import { MempoolFeeWidget } from '@/components/MempoolFeeWidget';
import { HalvingCountdownWidget } from '@/components/HalvingCountdownWidget';
import { HashRateWidget } from '@/components/HashRateWidget';
import { SupplyScarcityWidget } from '@/components/SupplyScarcityWidget';
import { LightningWidget } from '@/components/LightningWidget';
import { DominanceWidget } from '@/components/DominanceWidget';
import { SatConverterWidget } from '@/components/SatConverterWidget';
import { PurchasingPowerWidget } from '@/components/PurchasingPowerWidget';
import { LiveBlocksWidget } from '@/components/LiveBlocksWidget';
import { LivePriceTicker } from '@/components/LivePriceTicker';
import { AdSlot } from '@/components/AdSlot';
import { SkeletonCard } from '@/components/Skeleton';
import { MobileCollapse } from '@/components/MobileCollapse';
import { LazyDcaCalculator, DcaCalculatorSkeleton } from '@/components/LazyDcaCalculator';
import dynamic from 'next/dynamic';
import {
  getMempoolFees,
  getFearGreedIndex,
  getBlockHeight,
  getHashRateDifficulty,
  getCirculatingSupply,
  getLightningStats,
  getBitcoinDominance,
  getPurchasingPowerData,
  getRecentBlocks,
  getHeroStat,
  getCurrentBitcoinPriceWithChange,
  getBitcoinPriceHistory,
  getCurrentBitcoinPrice,
} from '@/app/actions';
import {
  DAY_MS,
  DEFAULT_YEARS_BACK,
  parseUtcDate,
  utcIsoToday,
  utcIsoYearsAgo,
} from '@/utils/dates';

const usd = (n: number) =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// Recharts-backed. `ssr: false` cannot be set from a Server Component, so the
// opt-out lives in the client wrapper — see LazyBitcoinAdoption.
const BitcoinAdoption = dynamic(() => import('@/components/LazyBitcoinAdoption').then(m => m.LazyBitcoinAdoption), {
  loading: () => <div className="h-[400px] bg-slate-100 dark:bg-slate-800/50 rounded-xl animate-pulse" />,
});

const faqItems = [
  {
    question: "Is this calculator accurate?",
    answer: "Prices come from Kraken and Coinbase. In Coinbase mode you get real daily candles (one recorded price per day) going back to 2015. In Kraken mode you get weekly closing prices, interpolated to daily: the days in between are filled in along a straight line between two real weekly prices. For August 2010 through mid-2015 we use a static snapshot of real daily market prices from blockchain.info. No prices are fabricated. Those earliest years were quoted in whole cents, so figures from that era are coarse. If a date has no price at all, the last known price carries forward. The Methodology page documents exactly how every number is computed. Intended for estimation and education."
  },
  {
    question: "What do annualized return (XIRR) and max drawdown mean?",
    answer: "XIRR is your yearly return rate, adjusted for the fact that your money went in at different times. Its formal name is money-weighted annualized return. Because it accounts for the size and date of every buy, it's the honest way to put a yearly figure on a DCA plan. Max drawdown is the largest fall your portfolio value took from a high point to the low that came after it."
  },
  {
    question: "Does this include transaction fees?",
    answer: "Yes. Set the 'Fee %' input to whatever your exchange charges. Most major exchanges charge between 0.1% and 1.5% per purchase, and over a few hundred buys that adds up to real money."
  },
  {
    question: "What is the best frequency for DCA?",
    answer: "Historically, the difference between Daily and Weekly DCA is negligible over multi-year periods. People who buy by hand tend to pick Weekly, because it means fewer fees and less record-keeping. Daily is great for automated setups."
  },
  {
    question: "Can I export my data?",
    answer: "Yes. Once you have results, use the CSV button below them, or the download icon next to the total invested. Either one exports your full transaction history. It includes every purchase date, BTC price, amount invested, BTC bought, and portfolio value, converted to your selected currency."
  }
];

const softwareAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Bitcoin DCA Calculator",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "url": "https://btcdollarcostaverage.com",
  "description": "Free Bitcoin dollar cost averaging calculator with real historical price data. Compare BTC vs S&P 500, Gold, and savings accounts.",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": faqItems.map(item => ({
    "@type": "Question",
    "name": item.question,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": item.answer
    }
  }))
};

// Streams in via Suspense: the live proof line + price ticker seeded with SSR data
async function HeroLive() {
  const [stat, ticker] = await Promise.all([
    getHeroStat(),
    getCurrentBitcoinPriceWithChange().catch(() => null),
  ]);

  return (
    <>
      {stat ? (
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto text-balance">
          $50 of Bitcoin every week for the last 5 years comes to{' '}
          {usd(stat.invested)} invested, worth{' '}
          <strong className="font-bold text-slate-900 dark:text-white">{usd(stat.value)}</strong> today
          {Number.isFinite(stat.roi) && (
            <span className={stat.roi >= 0 ? 'text-gain' : 'text-loss'}>
              {' '}({stat.roi >= 0 ? '+' : ''}{stat.roi.toFixed(0)}%)
            </span>
          )}.
        </p>
      ) : (
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
          See what steady weekly buys of Bitcoin would be worth today, using real market history rather than vibes.
        </p>
      )}
      <LivePriceTicker initialData={ticker} />
    </>
  );
}

function HeroLiveSkeleton() {
  return (
    <>
      <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
        See what steady weekly buys of Bitcoin would be worth today, using real market history rather than vibes.
      </p>
      <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800/60 animate-pulse">
        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
        <span className="h-5 w-32 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </>
  );
}

/**
 * Fetches the default window's prices on the server and hands them to the
 * calculator, so a first-time visitor (and Googlebot) sees a completed backtest
 * in the initial HTML rather than a loading state that resolves a second later.
 *
 * The date range MUST be derived the same way the client derives it — both call
 * the UTC helpers in utils/dates — or the seed covers the wrong window and the
 * client refetches anyway.
 */
async function SeededCalculator() {
  const startDate = utcIsoYearsAgo(DEFAULT_YEARS_BACK);
  const endDate = utcIsoToday();

  // Providers down: seed nothing and let the client-fetching calculator use its
  // own retry and manual-price escape hatch.
  const seed = await Promise.all([
    getBitcoinPriceHistory(parseUtcDate(startDate), parseUtcDate(endDate) + DAY_MS, 'kraken'),
    getCurrentBitcoinPrice('kraken').catch(() => null),
  ]).catch(() => null);

  // The series ships inside the RSC payload, so trim it to cents. Full float
  // precision cost ~8 KB gzipped per page load to express sub-cent resolution on
  // a five-figure asset.
  const trimmed = seed?.[0]?.map(([ts, price]): [number, number] => [ts, Math.round(price * 100) / 100]);

  return (
    <LazyDcaCalculator
      initialPriceData={trimmed}
      initialLivePrice={seed?.[1] ?? null}
    />
  );
}

function SidebarSkeleton() {
  return (
    <div className="space-y-4 lg:sticky lg:top-20">
      {/* Mirror MobileCollapse: below lg the resolved sidebar shows 3 cards plus
          a toggle button, so 10 unconditional cards left the streaming page
          ~700px taller than its final height on phones. */}
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className={i >= 3 ? 'hidden lg:block' : undefined}>
          <SkeletonCard />
        </div>
      ))}
      {/* Stand-in for the "Show more" toggle (lg:hidden in MobileCollapse). */}
      <div className="lg:hidden h-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
    </div>
  );
}

async function Sidebar() {
  const [mempoolFees, fearGreed, blockHeight, hashRateData, circulatingSupply, lightningData, dominanceData, purchasingPowerData, recentBlocks] = await Promise.all([
    getMempoolFees(),
    getFearGreedIndex(),
    getBlockHeight(),
    getHashRateDifficulty(),
    getCirculatingSupply(),
    getLightningStats(),
    getBitcoinDominance(),
    getPurchasingPowerData(),
    getRecentBlocks(),
  ]);

  return (
    // A labelled landmark: ten stat cards with no grouping made this an
    // unnavigable wall for screen-reader users, who had no way to skip past it.
    <aside aria-label="Live Bitcoin network stats" className="space-y-4 lg:sticky lg:top-20">
      {/* Collapsed to three cards on phones — see MobileCollapse. */}
      <MobileCollapse previewCount={3} label="network stats">
        <HalvingCountdownWidget initialHeight={blockHeight} />
        <LiveBlocksWidget initialData={recentBlocks} />
        <FearGreedWidget initialData={fearGreed} />
        <MempoolFeeWidget initialData={mempoolFees} />
        <HashRateWidget initialData={hashRateData} />
        <SupplyScarcityWidget initialSupply={circulatingSupply} blockHeight={blockHeight} />
        <PurchasingPowerWidget initialData={purchasingPowerData} />
        <LightningWidget initialData={lightningData} />
        <DominanceWidget initialData={dominanceData} />
        <SatConverterWidget />
      </MobileCollapse>
      <AdSlot />
    </aside>
  );
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* viewport-fit=cover extends layout into the notch zone; on a notched
          phone in landscape safe-area-inset-left/right is ~47px, so a flat px-4
          put the first ~30px of every line under the sensor housing. Same
          max(env(),…) pattern the nav uses (ResponsiveNav.tsx). */}
      <div className="max-w-7xl mx-auto pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)] sm:pl-[max(env(safe-area-inset-left),1.5rem)] sm:pr-[max(env(safe-area-inset-right),1.5rem)] lg:pl-[max(env(safe-area-inset-left),2rem)] lg:pr-[max(env(safe-area-inset-right),2rem)] py-6 sm:py-8 space-y-8 sm:space-y-12">

        {/* Hero Section */}
        {/* No hero-glow: the radial wash was a 1.04:1 tint that read as gradient
            banding rather than depth. The amber Ð monogram in the nav carries the
            brand; the H1's job is to be read. */}
        <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4 pt-2 sm:pt-6">
          {/* Flat, not bg-clip-text. Logo.tsx already documents why that technique
              was removed from the wordmark: clipping a gradient to text discards
              the text's real colour, so it fails contrast checks and disappears
              entirely in forced-colors mode. The H1 had been missed. */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-[var(--text-strong)] text-balance">
            Bitcoin DCA Calculator
          </h1>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
            Dollar-cost averaging means buying a fixed amount on a set schedule, whatever the
            price is that day. This tool runs that plan against real Bitcoin market history and
            shows you what it would be worth.
          </p>
          <Suspense fallback={<HeroLiveSkeleton />}>
            <HeroLive />
          </Suspense>
        </section>

        {/* How It Works */}
        <HowItWorks />

        {/* Mission */}
        <p className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          A free, open-source calculator for long-term Bitcoin thinkers. No accounts, no email capture, no shitcoins.{' '}
          <Link href="/about" className="text-amber-700 dark:text-amber-400 hover:underline">Learn more &rarr;</Link>
        </p>

        {/* Main Calculator — streams in seeded with server-fetched prices, so the
            first paint shows a real backtest instead of a skeleton. */}
        {/* The fallback must be a PLAIN component. It was <LazyDcaCalculator />,
            which lazy-loads and therefore suspends — and a Suspense fallback that
            itself suspends leaves the boundary stuck: the calculator rendered as a
            permanent skeleton on the client even though the server had already
            streamed the real markup into the page. */}
        <Suspense fallback={<DcaCalculatorSkeleton />}>
          <SeededCalculator />
        </Suspense>

        {/* Content + Sidebar */}
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-8">
            <EducationalContent />

            <BitcoinAdoption />

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Frequently Asked Questions</h2>
              <div className="space-y-2.5">
                {faqItems.map((item, i) => (
                  <details key={i} className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-sm">
                    <summary className="flex items-center justify-between cursor-pointer p-4 list-none [&::-webkit-details-marker]:hidden">
                      <h3 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200 pr-4">{item.question}</h3>
                      <svg className="w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 group-open:rotate-180 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </summary>
                    <div className="px-4 pb-4 -mt-1">
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.answer}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar - streams in after main content renders */}
          <Suspense fallback={<SidebarSkeleton />}>
            <Sidebar />
          </Suspense>
        </div>

      </div>
    </>
  );
}

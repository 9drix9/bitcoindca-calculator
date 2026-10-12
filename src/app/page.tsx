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
import { DcaCalculatorSkeleton } from '@/components/LazyDcaCalculator';
import { DcaCalculator, type DcaCalculatorProps } from '@/components/DcaCalculator';
import dynamic from 'next/dynamic';
import {
  getLiveSidebar,
  getLiveTicker,
  getHeroStat,
  getBitcoinPriceHistoryWithMeta,
  getBitcoinSpot,
  getOutcomeRange,
} from '@/app/actions';
import { HeroProofLine } from '@/components/HeroProofLine';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { DAILY_VS_WEEKLY_GAP } from '@/app/calculators/stack-sats-goal/frequencyGap';
import { packDailyPrices } from '@/app/calculators/bitcoin-cost-basis/priceSeed';
import { withPriceKinds } from '@/utils/dca';
import { DAY_MS, defaultPlanWindow } from '@/utils/dates';

// Recharts-backed. `ssr: false` cannot be set from a Server Component, so the
// opt-out lives in the client wrapper — see LazyBitcoinAdoption.
const BitcoinAdoption = dynamic(() => import('@/components/LazyBitcoinAdoption').then(m => m.LazyBitcoinAdoption), {
  // The shape LazyBitcoinAdoption renders before its card loads: the heading's
  // line, then the card's height.
  loading: () => (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-7 sm:h-8 w-48 bg-slate-100 dark:bg-slate-800/50 rounded animate-pulse" />
      <div className="h-[840px] sm:h-[750px] bg-slate-100 dark:bg-slate-800/50 rounded-xl animate-pulse" />
    </div>
  ),
});

const faqItems = [
  {
    question: "Is this calculator accurate?",
    answer: "By default each day is priced at Coinbase's daily close from July 20, 2015, and before that at blockchain.info's daily market price, back to August 18, 2010. That older series is in whole cents, which is coarse for the months to April 2011 when a bitcoin cost under a dollar. Today's price is the latest trade, because the day has not closed. Switch the price source to Kraken and you get weekly closes, with the days in between filled in along a straight line. Every price that is an estimate is marked 'est.' in the purchase table and 'estimated' in the CSV export. If Coinbase cannot be reached, the calculator uses the Kraken series and says so next to the result. The Methodology page documents how every number is computed. The results are for estimation and education."
  },
  {
    question: "What do annualized return (XIRR) and max drawdown mean?",
    answer: "XIRR is your yearly return rate, adjusted for the fact that your money went in at different times. Its formal name is money-weighted annualized return. Because it accounts for the size and date of every buy, it's the honest way to put a yearly figure on a DCA plan. Max drawdown is the largest fall your portfolio value took from a high point to the low that came after it."
  },
  {
    question: "Does this include transaction fees?",
    answer: `Yes. The calculator starts with a ${DEFAULT_PLAN.feePercentage}% fee on every buy. You can change it, add a flat fee per buy, or tap a platform's name to use the figure that platform publishes, which for some is a fee and for others a spread. The fee comes out of each purchase before any bitcoin is bought, and the full amount still counts as money invested. Withdrawal fees and taxes are not modeled, and nothing is added for spread beyond the percentage you set.`
  },
  {
    question: "What is the best frequency for DCA?",
    answer: `On Coinbase's daily closes since ${DAILY_VS_WEEKLY_GAP.seriesFrom}, the same money spent daily or weekly over any ${DAILY_VS_WEEKLY_GAP.windowYears}-year stretch ended within ${DAILY_VS_WEEKLY_GAP.withinPercent}% of each other (measured ${DAILY_VS_WEEKLY_GAP.measuredOn}). A percentage fee costs the same in total however often you buy. A flat fee per order costs more the more orders you place.`
  },
  {
    question: "Can I export my data?",
    answer: "Yes. Once your plan has made a purchase, use the CSV button in the result card, or the download icon at the foot of the form. Either one exports your full transaction history. It includes every purchase date, BTC price, amount invested, BTC bought, and portfolio value, converted to your selected currency at one exchange rate, which a file in any currency but US dollars states in a column of its own. When the prices come from an exchange, a Price Kind column says whether each one was observed or estimated. A plan that runs past today exports the purchases made so far, not the ones still to come."
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

/**
 * The line under the title when there are no figures to state: while the hero
 * streams in, when the default plan could not be computed, and whenever the
 * calculator holds a plan other than the default one (see HeroProofLine).
 */
const HERO_LINE_WITHOUT_FIGURES =
  'See what steady weekly buys of Bitcoin would be worth today, using real market history rather than vibes.';

// Streams in via Suspense: the live proof line + price ticker seeded with SSR data
async function HeroLive() {
  const [stat, ticker] = await Promise.all([getHeroStat(), getLiveTicker()]);

  return (
    <>
      {stat ? (
        // A client component: the calculator below re-quotes the price when
        // this cached page is old, and the sentence has to follow it or the
        // two disagree about the same plan. See HeroProofLine.
        <HeroProofLine stat={stat} otherPlanLine={HERO_LINE_WITHOUT_FIGURES} />
      ) : (
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
          {HERO_LINE_WITHOUT_FIGURES}
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
        {HERO_LINE_WITHOUT_FIGURES}
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
 * `seededAt` is the one clock read. This page is a cached prerender: the HTML
 * can be served hours after it was built, and to the first visitor of a new
 * UTC day it is yesterday's. The calculator therefore takes its default window
 * and its "today" from `seededAt` for the render that hydrates this markup,
 * never from the visitor's clock, and only then catches up with the real date.
 * With each side reading its own clock, that first render disagrees with the
 * HTML (React error #418), the server's DOM is thrown away and the ad iframes
 * inside it load twice.
 *
 * Same window, same series, same spot quote and the same cents rounding as
 * getHeroStat, so the headline sentence and the result card below it agree.
 */
async function loadCalculatorSeed(): Promise<DcaCalculatorProps> {
  const seededAt = Date.now();
  const window = defaultPlanWindow(seededAt);

  // Providers down: seed nothing and let the client-fetching calculator use its
  // own retry and manual-price escape hatch.
  const [history, spot, outcomeRange] = await Promise.all([
    getBitcoinPriceHistoryWithMeta(window.startTs, window.endTs + DAY_MS).catch(() => null),
    getBitcoinSpot().catch(() => null),
    // The "same plan, every start date" card for the default plan, so it is in
    // the first paint too and costs a first-time visitor no extra request.
    getOutcomeRange(
      DEFAULT_PLAN.frequency,
      Math.round((window.endTs - window.startTs) / DAY_MS),
      DEFAULT_PLAN.feePercentage,
    ).catch(() => null),
  ]);
  // Two decimals is more than a percentile rank needs, and the 101 quantiles
  // ride in the page payload.
  const initialOutcomeRange = outcomeRange && {
    ...outcomeRange,
    quantiles: outcomeRange.quantiles.map((q) => Math.round(q * 100) / 100),
  };
  if (history === null) return { seededAt, initialOutcomeRange };

  // The series ships inside the RSC payload, on this page and in every other
  // page's prefetch of it. So it is trimmed to cents (full float precision
  // cost ~8 KB gzipped to express sub-cent resolution on a five-figure asset)
  // and packed: with one row per UTC day, the first date and the prices say
  // everything a timestamp on each row did, for 8 KB gzipped less again.
  const initialPrices = packDailyPrices(withPriceKinds(
    history.data.map(([ts, price]): [number, number] => [ts, Math.round(price * 100) / 100]),
    history.kinds,
  ));
  if (initialPrices === null) return { seededAt, initialOutcomeRange };

  return {
    seededAt,
    initialPrices,
    initialPriceSource: {
      requestedProvider: history.requestedProvider,
      servedProvider: history.servedProvider,
      fallback: history.fallback,
      stale: history.stale,
      fetchedAt: history.fetchedAt,
    },
    initialLivePrice: spot?.price ?? null,
    initialLivePriceAsOf: spot?.asOf,
    initialOutcomeRange,
  };
}

async function SeededCalculator() {
  return <DcaCalculator {...await loadCalculatorSeed()} />;
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
  // Each figure comes with the time it was fetched from its provider. This
  // page is served from a cache, so a card is handed that time as well: it is
  // how the card knows when its figure is due a refresh, and when the figure
  // in old HTML is too old to show as current.
  const live = await getLiveSidebar();

  return (
    // A labelled landmark: ten stat cards with no grouping made this an
    // unnavigable wall for screen-reader users, who had no way to skip past it.
    <aside aria-label="Live Bitcoin network stats" className="space-y-4 lg:sticky lg:top-20">
      {/* Collapsed to three cards on phones — see MobileCollapse. */}
      <MobileCollapse previewCount={3} label="network stats">
        <HalvingCountdownWidget initialHeight={live.blockHeight?.data ?? null} fetchedAt={live.blockHeight?.fetchedAt} />
        <LiveBlocksWidget initialData={live.recentBlocks?.data ?? null} fetchedAt={live.recentBlocks?.fetchedAt} />
        <FearGreedWidget initialData={live.fearGreed?.data ?? null} fetchedAt={live.fearGreed?.fetchedAt} />
        <MempoolFeeWidget initialData={live.mempoolFees?.data ?? null} fetchedAt={live.mempoolFees?.fetchedAt} />
        <HashRateWidget initialData={live.hashRate?.data ?? null} fetchedAt={live.hashRate?.fetchedAt} />
        <SupplyScarcityWidget
          initialSupply={live.supplySats?.data ?? null}
          blockHeight={live.blockHeight?.data ?? null}
          fetchedAt={live.supplySats?.fetchedAt}
          blockHeightFetchedAt={live.blockHeight?.fetchedAt}
        />
        <PurchasingPowerWidget initialData={live.purchasingPower?.data ?? null} fetchedAt={live.purchasingPower?.fetchedAt} />
        <LightningWidget initialData={live.lightning?.data ?? null} fetchedAt={live.lightning?.fetchedAt} />
        <DominanceWidget initialData={live.dominance?.data ?? null} fetchedAt={live.dominance?.fetchedAt} />
        <SatConverterWidget />
      </MobileCollapse>
      {/* One of the home page's three A-ADS slots (the other two are in
          DcaCalculator). /alternatives and /author state that count in their
          copy, so it has to change there if a slot is ever added or removed. */}
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
          {/* One line. The longer paragraph, the three "how it works" steps
              and the mission line are below the calculator: above it, on a
              390px phone, they put the first input 1,144px down the page, a
              screen and a half of reading before the tool the visitor came for. */}
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl mx-auto text-balance">
            Test a regular Bitcoin buy against real price history.
          </p>
          <Suspense fallback={<HeroLiveSkeleton />}>
            <HeroLive />
          </Suspense>
        </section>

        {/* Without JavaScript the form below cannot be changed and a link's
            settings are never read, so the page says which plan its figures are
            for. With it, a visit that opens on a link has the default plan's
            figures hidden until the link's are in place (hooks/planLinkBootstrap). */}
        <noscript>
          <p className="mx-auto max-w-2xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-slate-700 dark:border-amber-700/60 dark:bg-amber-950/25 dark:text-slate-300">
            This calculator needs JavaScript. Without it, the figures on this page are for the
            example plan the form below is set to. The plan in a shared link is not opened, and
            changing the form changes nothing.
          </p>
        </noscript>

        {/* Main Calculator — streams in seeded with server-fetched prices, so the
            first paint shows a real backtest instead of a skeleton. */}
        {/* The calculator is imported directly, not through next/dynamic. That
            wrapper puts a second Suspense boundary inside this one, and React
            leaves hydrating it until nothing else is pending: while any Server
            Action is in flight the form would stay unhydrated and a link's plan
            unapplied. Its code is preloaded with the page either way, since
            the markup is server-rendered. */}
        <Suspense fallback={<DcaCalculatorSkeleton />}>
          <SeededCalculator />
        </Suspense>

        {/* What the tool does, in words. Under the calculator, not over it
            (see the note in the hero). */}
        <div className="space-y-6 sm:space-y-8">
          <p className="text-center text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
            Dollar-cost averaging means buying a fixed amount on a set schedule, whatever the
            price is that day. This tool runs that plan against real Bitcoin market history and
            shows you what it would be worth.
          </p>

          {/* How It Works */}
          <HowItWorks />

          {/* Mission */}
          <p className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            A free, open-source calculator for long-term Bitcoin thinkers. No accounts, no email capture, no shitcoins.{' '}
            <Link href="/about" className="text-amber-700 dark:text-amber-400 hover:underline">Learn more &rarr;</Link>
          </p>
        </div>

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

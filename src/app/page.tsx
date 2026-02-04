import { HowItWorks } from '@/components/HowItWorks';
import dynamic from 'next/dynamic';

// First sidebar widget - load early but not blocking
const HalvingCountdownWidget = dynamic(() => import('@/components/HalvingCountdownWidget').then(m => m.HalvingCountdownWidget));

// Critical path - load immediately
const DcaCalculator = dynamic(() => import('@/components/DcaCalculator').then(m => m.DcaCalculator), {
  loading: () => <div className="h-[600px] bg-slate-100 dark:bg-slate-800/50 rounded-xl animate-pulse" />,
});

// Below fold - lazy load
const EducationalContent = dynamic(() => import('@/components/EducationalContent').then(m => m.EducationalContent));
const BitcoinAdoption = dynamic(() => import('@/components/BitcoinAdoption').then(m => m.BitcoinAdoption), {
  loading: () => <div className="h-[400px] bg-slate-100 dark:bg-slate-800/50 rounded-xl animate-pulse" />,
});

// Sidebar widgets - lazy load (below fold on mobile)
const FearGreedWidget = dynamic(() => import('@/components/FearGreedWidget').then(m => m.FearGreedWidget));
const MempoolFeeWidget = dynamic(() => import('@/components/MempoolFeeWidget').then(m => m.MempoolFeeWidget));
const HashRateWidget = dynamic(() => import('@/components/HashRateWidget').then(m => m.HashRateWidget));
const SupplyScarcityWidget = dynamic(() => import('@/components/SupplyScarcityWidget').then(m => m.SupplyScarcityWidget));
const LightningWidget = dynamic(() => import('@/components/LightningWidget').then(m => m.LightningWidget));
const DominanceWidget = dynamic(() => import('@/components/DominanceWidget').then(m => m.DominanceWidget));
const SatConverterWidget = dynamic(() => import('@/components/SatConverterWidget').then(m => m.SatConverterWidget));
const PurchasingPowerWidget = dynamic(() => import('@/components/PurchasingPowerWidget').then(m => m.PurchasingPowerWidget));
const LiveBlocksWidget = dynamic(() => import('@/components/LiveBlocksWidget').then(m => m.LiveBlocksWidget));
const AdSlot = dynamic(() => import('@/components/AdSlot').then(m => m.AdSlot));
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
} from '@/app/actions';
import { ChevronDown } from 'lucide-react';

const faqItems = [
  {
    question: "Is this calculator accurate?",
    answer: "We use real historical daily price data from high-volume exchanges for our 'Live API' mode. However, for dates where data might be missing, we use a closest-match fallback. It is intended for estimation and educational purposes."
  },
  {
    question: "Does this include transaction fees?",
    answer: "Yes! You can adjust the 'Fee %' input to simulate exchange fees. Most major exchanges like Coinbase, Kraken, or Binance charge between 0.1% and 1.5% per transaction, which can impact long-term returns."
  },
  {
    question: "What is the best frequency for DCA?",
    answer: "Historically, the difference between Daily and Weekly DCA is negligible over multi-year periods. Weekly is often preferred by manual investors to minimize transaction fees and record-keeping effort, while Daily is great for automated setups."
  },
  {
    question: "Can I export my data?",
    answer: "Yes! Click the download icon next to the projected investment total to export your full transaction history as a CSV file. The export includes every purchase date, BTC price, amount invested, BTC bought, and portfolio value."
  }
];

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

export default async function Home() {
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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8 sm:space-y-12">

        {/* Hero Section */}
        <section className="text-center max-w-3xl mx-auto space-y-3 sm:space-y-4">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight text-balance">
            Calculate Your <span className="text-amber-500">Bitcoin</span> Wealth
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
            See how much you would have today if you started investing $50 a week in Bitcoin 5 years ago.
          </p>
        </section>

        {/* How It Works */}
        <HowItWorks />

        {/* Main Calculator */}
        <DcaCalculator />

        {/* Content + Sidebar */}
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-8">
            <EducationalContent />

            <BitcoinAdoption />

            <section className="space-y-4">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Frequently Asked Questions</h3>
              <div className="space-y-2.5">
                {faqItems.map((item, i) => (
                  <details key={i} className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 transition-shadow hover:shadow-sm">
                    <summary className="flex items-center justify-between cursor-pointer p-4 list-none [&::-webkit-details-marker]:hidden">
                      <h4 className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200 pr-4">{item.question}</h4>
                      <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 group-open:rotate-180 shrink-0" aria-hidden="true" />
                    </summary>
                    <div className="px-4 pb-4 -mt-1">
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.answer}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 lg:sticky lg:top-20">
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
            <AdSlot />
          </div>
        </div>

      </div>
    </>
  );
}

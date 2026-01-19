import { DcaCalculator } from '@/components/DcaCalculator';
import { AdSlot } from '@/components/AdSlot';

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto space-y-4">
        <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Calculate Your <span className="text-amber-500">Bitcoin</span> Wealth
        </h2>
        <p className="text-lg text-slate-600 dark:text-slate-300">
          See how much you would have today if you started investing $50 a week in Bitcoin 5 years ago.
        </p>
      </section>

      {/* Main Calculator */}
      <DcaCalculator />

      {/* Content Blocks */}
      <div className="grid md:grid-cols-3 gap-8 items-start">
        <div className="md:col-span-2 space-y-8">
          <section className="prose dark:prose-invert max-w-none">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">What is Dollar Cost Averaging (DCA)?</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Dollar Cost Averaging (DCA) is an investment strategy where you divide the total amount to be invested across periodic purchases of a target asset in an effort to reduce the impact of volatility on the overall purchase. The purchases occur regardless of the asset's price and at regular intervals.
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              For Bitcoin, this strategy is particularly popular because it removes the emotional component of "timing the market" and takes advantage of Bitcoin's long-term upward trend while mitigating short-term crashes.
            </p>

            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-8">Why Use a Bitcoin DCA Calculator?</h3>
            <ul className="list-disc pl-5 text-slate-600 dark:text-slate-400 space-y-2">
              <li><strong>Visualize Growth:</strong> See exactly how small, regular contributions can compound over time.</li>
              <li><strong>Compare Strategies:</strong> Test different frequencies (daily vs weekly) to see what works best.</li>
              <li><strong>Understand value:</strong> Track the "Avg. Cost" to see your break-even price.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Frequently Asked Questions</h3>
            <div className="space-y-4">
              <ConfigurableFaq question="Is this calculator accurate?" answer="We use real historical daily price data from Kraken for our 'Live API' mode. However, for dates where data might be missing, we use a closest-match fallback. It is intended for estimation and educational purposes." />
              <ConfigurableFaq question="Does this include transaction fees?" answer="Yes! You can adjust the 'Fee %' input to simulate exchange fees (e.g., Coinbase or Binance usually charge 0.1% to 1.5%)." />
              <ConfigurableFaq question="What is the best frequency for DCA?" answer="Historically, there is little difference between daily and weekly DCA over long periods. Weekly is often preferred to minimize transaction fees and record-keeping." />
            </div>
          </section>
        </div>

        {/* Sidebar Ad Utility */}
        <div className="space-y-6">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 md:p-6 border border-slate-200 dark:border-slate-800">
            <h4 className="font-bold text-slate-800 dark:text-white mb-2">Start Stacking Sats</h4>
            <p className="text-sm text-slate-500 mb-4">Consistency is key. Use this tool to plan your path to financial sovereignty.</p>
            <div className="flex justify-center">
              <AdSlot slotId="sidebar-ad" format="rectangle" className="min-h-[250px] w-full max-w-[300px]" />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

const ConfigurableFaq = ({ question, answer }: { question: string, answer: string }) => (
  <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
    <h4 className="font-bold text-slate-800 dark:text-slate-200">{question}</h4>
    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{answer}</p>
  </div>
)

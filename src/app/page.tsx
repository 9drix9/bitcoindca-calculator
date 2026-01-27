import { DcaCalculator } from '@/components/DcaCalculator';
import { AdSlot } from '@/components/AdSlot';
import { EducationalContent } from '@/components/EducationalContent';

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
          <div className="mb-12">
            <EducationalContent />
          </div>

          <section className="space-y-4">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Frequently Asked Questions</h3>
            <div className="space-y-4">
              <ConfigurableFaq question="Is this calculator accurate?" answer="We use real historical daily price data from high-volume exchanges for our 'Live API' mode. However, for dates where data might be missing, we use a closest-match fallback. It is intended for estimation and educational purposes." />
              <ConfigurableFaq question="Does this include transaction fees?" answer="Yes! You can adjust the 'Fee %' input to simulate exchange fees. Most major exchanges like Coinbase, Kraken, or Binance charge between 0.1% and 1.5% per transaction, which can impact long-term returns." />
              <ConfigurableFaq question="What is the best frequency for DCA?" answer="Historically, the difference between Daily and Weekly DCA is negligible over multi-year periods. Weekly is often preferred by manual investors to minimize transaction fees and record-keeping effort, while Daily is great for automated setups." />
              <ConfigurableFaq question="Can I export my data?" answer="Currently, this tool is a visualizer. We are working on a feature to export your calculation results to CSV for tax or record-keeping purposes." />
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

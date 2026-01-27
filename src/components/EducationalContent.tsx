import React from 'react';
import { BookOpen, TrendingUp, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';

export const EducationalContent = () => {
    return (
        <div className="space-y-12">

            {/* Strategy Section */}
            <section className="prose dark:prose-invert max-w-none">
                <div className="flex items-center gap-3 mb-4">
                    <BookOpen className="w-8 h-8 text-amber-500" />
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white m-0">Mastering Bitcoin DCA</h2>
                </div>
                <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                    Dollar Cost Averaging (DCA) isn't just a buzzing investment term—it's a time-tested strategy tailored for volatile assets like Bitcoin. By automatedly purchasing a fixed dollar amount of Bitcoin at regular intervals, you effectively remove the emotional stress of trying to time the market.
                </p>
                <div className="grid md:grid-cols-2 gap-8 mt-8">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-3">Time in the Market {'>'} Timing the Market</h3>
                        <p className="text-slate-600 dark:text-slate-400">
                            History shows that trying to buy the "perfect bottom" is nearly impossible. DCA ensures you catch the lows along with the highs, often resulting in a lower average entry price over time than a lump-sum investment made at a local peak.
                        </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-3">Psychological Advantage</h3>
                        <p className="text-slate-600 dark:text-slate-400">
                            When prices drop, human nature is to panic sell. With DCA, a price drop is seen as a discount—your regular buy order simply accumulates more Satoshis for the same dollar cost.
                        </p>
                    </div>
                </div>
            </section>

            {/* Historical Context */}
            <section className="prose dark:prose-invert max-w-none">
                <div className="flex items-center gap-3 mb-4">
                    <TrendingUp className="w-8 h-8 text-green-500" />
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white m-0">A History of Volatility</h2>
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                    Bitcoin is famous for its cycles, typically revolving around the 4-year "Halving" event. While long-term trends have been up, the journey includes drawdowns of 50%, 70%, or even 80%.
                </p>
                <p className="text-slate-600 dark:text-slate-400 mt-4">
                    Our calculator uses <strong>real historical daily data</strong> from Kraken to simulate exactly how a DCA strategy would have performed during these turbulent times. Whether you started at the 2017 peak or the 2020 crash, the results often surprise investors who assume they missed the boat.
                </p>
            </section>

            {/* How to Use */}
            <section className="bg-slate-100 dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3 mb-6">
                    <HelpCircle className="w-8 h-8 text-blue-500" />
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white m-0">How to Use This Calculator</h2>
                </div>
                <ol className="list-decimal pl-5 space-y-4 text-slate-700 dark:text-slate-300">
                    <li>
                        <strong>Set Amount & Frequency:</strong> Choose how much you want to invest (e.g., $50) and how often (Daily, Weekly, Bi-weekly, Monthly).
                    </li>
                    <li>
                        <strong>Select Dates:</strong> Pick a start date in the past. We support data going back to 2010.
                    </li>
                    <li>
                        <strong>Adjust Parameters:</strong> Add an estimated exchange fee (standard is 0.5% - 1.5%) to see net results.
                    </li>
                    <li>
                        <strong>Analyze:</strong> Check the "Total Invested" vs "Current Value" cards and explore the interactive chart to see how your portfolio value diverged from your cash input over time.
                    </li>
                </ol>
            </section>

            {/* Disclaimer */}
            <section className="border-t border-slate-200 dark:border-slate-800 pt-8 mt-12">
                <div className="flex items-start gap-4">
                    <AlertTriangle className="w-6 h-6 text-slate-400 shrink-0 mt-1" />
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        <strong>Disclaimer:</strong> This website is for educational and entertainment purposes only. The calculations are based on historical data and do not guarantee future performance. Bitcoin and cryptocurrency investments carry significant risk, including the possible loss of principal. Always conduct your own research (DYOR) and consult with a qualified financial advisor before making investment decisions.
                    </div>
                </div>
            </section>

        </div>
    );
};

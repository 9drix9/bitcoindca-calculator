import React from 'react';
import { BookOpen, TrendingUp, AlertTriangle, HelpCircle } from 'lucide-react';

const BITCOIN_QUOTES = [
    { text: "If you don't believe it or don't get it, I don't have the time to try to convince you, sorry.", author: "Satoshi Nakamoto" },
    { text: "Bitcoin is a technological tour de force.", author: "Bill Gates" },
    { text: "Bitcoin is the most important invention in the history of the world since the Internet.", author: "Roger Ver" },
    { text: "Every informed person needs to know about Bitcoin because it might be one of the world's most important developments.", author: "Leon Luow" },
    { text: "Bitcoin will do to banks what email did to the postal industry.", author: "Rick Falkvinge" },
    { text: "Bitcoin is a remarkable cryptographic achievement and the ability to create something that is not duplicable in the digital world has enormous value.", author: "Eric Schmidt" },
    { text: "I think the fact that within the bitcoin universe an algorithm replaces the function of the government is actually pretty cool.", author: "Al Gore" },
    { text: "The best time to buy bitcoin was 10 years ago. The second best time is now.", author: "Bitcoin Proverb" },
    { text: "Bitcoin is the beginning of something great: a currency without a government, something necessary and imperative.", author: "Nassim Nicholas Taleb" },
    { text: "There is no second best.", author: "Michael Saylor" },
    { text: "I am very intrigued by Bitcoin. It has all the signs. Paradigm shift, hackers love it, yet it's derided as a toy. Just like microcomputers.", author: "Paul Graham" },
    { text: "The swarm is headed towards us.", author: "Satoshi Nakamoto" },
];

export const EducationalContent = () => {
    // Use current date as deterministic seed for quote selection (changes daily)
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
    const randomQuote = BITCOIN_QUOTES[dayOfYear % BITCOIN_QUOTES.length];

    return (
        <div className="space-y-8 sm:space-y-12">

            {/* Strategy Section */}
            <section>
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Mastering Bitcoin DCA</h2>
                </div>
                <p className="text-sm sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                    Dollar Cost Averaging (DCA) isn&apos;t just a buzzing investment term&mdash;it&apos;s a time-tested strategy tailored for volatile assets like Bitcoin. By purchasing a fixed dollar amount of Bitcoin at regular intervals, you effectively remove the emotional stress of trying to time the market.
                </p>
                <div className="grid sm:grid-cols-2 gap-3 sm:gap-6 mt-4 sm:mt-8">
                    <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                        <h3 className="text-sm sm:text-xl font-bold text-slate-800 dark:text-white mb-2 sm:mb-3">Time in the Market {'>'} Timing the Market</h3>
                        <p className="text-xs sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                            History shows that trying to buy the &quot;perfect bottom&quot; is nearly impossible. DCA ensures you catch the lows along with the highs, often resulting in a lower average entry price over time.
                        </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-700">
                        <h3 className="text-sm sm:text-xl font-bold text-slate-800 dark:text-white mb-2 sm:mb-3">Psychological Advantage</h3>
                        <p className="text-xs sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                            When prices drop, human nature is to panic sell. With DCA, a price drop is seen as a discount&mdash;your regular buy order simply accumulates more Satoshis for the same dollar cost.
                        </p>
                    </div>
                </div>
            </section>

            {/* Bitcoin Quote */}
            <section className="border-l-4 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 px-4 sm:px-6 py-3 sm:py-4 rounded-r-xl">
                <blockquote className="text-sm sm:text-base text-slate-700 dark:text-slate-300 italic leading-relaxed">
                    &ldquo;{randomQuote.text}&rdquo;
                </blockquote>
                <cite className="block mt-2 text-xs sm:text-sm text-amber-700 dark:text-amber-400 font-medium not-italic">
                    &mdash; {randomQuote.author}
                </cite>
            </section>

            {/* Historical Context */}
            <section>
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-green-500 shrink-0" />
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">A History of Volatility</h2>
                </div>
                <div className="space-y-3 text-xs sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>
                        Bitcoin is famous for its cycles, typically revolving around the 4-year &quot;Halving&quot; event. While long-term trends have been up, the journey includes drawdowns of 50%, 70%, or even 80%.
                    </p>
                    <p>
                        Our calculator uses <strong className="text-slate-800 dark:text-slate-200">real historical daily data</strong> from Kraken to simulate exactly how a DCA strategy would have performed during these turbulent times. Whether you started at the 2017 peak or the 2020 crash, the results often surprise investors who assume they missed the boat.
                    </p>
                </div>
            </section>

            {/* How to Use */}
            <section className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                    <HelpCircle className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500 shrink-0" />
                    <h2 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">How to Use This Calculator</h2>
                </div>
                <ol className="list-decimal pl-4 sm:pl-5 space-y-2 sm:space-y-4 text-xs sm:text-base text-slate-700 dark:text-slate-300">
                    <li>
                        <strong>Set Amount &amp; Frequency:</strong> Choose how much you want to invest (e.g., $50) and how often (Daily, Weekly, Bi-weekly, Monthly).
                    </li>
                    <li>
                        <strong>Select Dates:</strong> Pick a start date in the past. We support data going back to 2010.
                    </li>
                    <li>
                        <strong>Adjust Parameters:</strong> Add an estimated exchange fee (standard is 0.5% - 1.5%) to see net results.
                    </li>
                    <li>
                        <strong>Analyze:</strong> Check the result cards and explore the interactive chart to see how your portfolio value diverged from your cash input over time.
                    </li>
                </ol>
            </section>

            {/* Disclaimer */}
            <section className="border-t border-slate-200 dark:border-slate-800 pt-6 sm:pt-8">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        <strong>Disclaimer:</strong> This website is for educational and entertainment purposes only. The calculations are based on historical data and do not guarantee future performance. Bitcoin and cryptocurrency investments carry significant risk. Always conduct your own research (DYOR) and consult with a qualified financial advisor before making investment decisions.
                    </p>
                </div>
            </section>

        </div>
    );
};

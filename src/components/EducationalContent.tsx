import React from 'react';
import Link from 'next/link';
import { BookOpen, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';

const BITCOIN_QUOTES = [
    { text: "If you don't believe it or don't get it, I don't have the time to try to convince you, sorry.", author: "Satoshi Nakamoto" },
    { text: "Bitcoin is a technological tour de force.", author: "Bill Gates" },
    { text: "Running bitcoin", author: "Hal Finney" },
    { text: "Every informed person needs to know about Bitcoin because it might be one of the world's most important developments.", author: "Leon Louw" },
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
                    <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Why DCA Works</h2>
                </div>
                <p className="text-sm sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                    Dollar cost averaging, or DCA, means buying a fixed amount on a schedule, whatever the price is that day. It suits jumpy assets like Bitcoin because it takes the timing decision, and most of the second-guessing, off your plate. New to the asset itself? Start with{' '}
                    <Link href="/why-bitcoin" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">where Bitcoin&apos;s value comes from</Link>.
                </p>
                <div className="grid sm:grid-cols-2 gap-3 sm:gap-6 mt-4 sm:mt-8">
                    <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <h3 className="text-sm sm:text-xl font-bold text-slate-800 dark:text-white mb-2 sm:mb-3">Time in the Market {'>'} Timing the Market</h3>
                        <p className="text-xs sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                            Almost nobody buys the exact bottom, and the people who did it once rarely do it twice. Buying on a schedule catches the lows along with the highs. The average price you pay usually ends up lower than guessing would have.
                        </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <h3 className="text-sm sm:text-xl font-bold text-slate-800 dark:text-white mb-2 sm:mb-3">The Psychology</h3>
                        <p className="text-xs sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                            A falling price is exactly when most people sell. If your buy is already scheduled, the same drop just hands you more sats for the same money.
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
                        Bitcoin moves in cycles, loosely tied to the four-year &quot;halving&quot;, when the supply of new coins is cut in half. The long-term trend has been up. Getting there meant falls of 50%, 70%, even 80% along the way.
                    </p>
                    <p>
                        This calculator runs on <strong className="text-slate-800 dark:text-slate-200">real historical data</strong> from Kraken and Coinbase. You can see how a plan would have held up through those stretches. Prices reach back to 18 August 2010. The years before 2015 now use real daily market prices from blockchain.info rather than the synthetic estimates they used to. One caveat is worth knowing. Coinbase mode reads real daily prices, while Kraken mode fills in the daily figures from weekly closing prices. Our{' '}
                        <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">Methodology</Link>{' '}
                        page covers how the data is built. Start at the 2017 peak or the 2020 crash and the results still tend to surprise people who assume they missed the boat.
                    </p>
                </div>
            </section>

            {/* How to Use */}
            <section className="bg-slate-100 dark:bg-slate-900/50 p-5 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                    <Lightbulb className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
                    <h2 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">How to Use This Calculator</h2>
                </div>
                <ol className="list-decimal pl-4 sm:pl-5 space-y-2 sm:space-y-4 text-xs sm:text-base text-slate-700 dark:text-slate-300">
                    <li>
                        <strong>Set amount &amp; frequency:</strong> How much per buy (say $50) and how often (daily, weekly, bi-weekly, monthly).
                    </li>
                    <li>
                        <strong>Select dates:</strong> Pick a start date in the past. Price history goes back to 18 August 2010, the first day with a real market price.
                    </li>
                    <li>
                        <strong>Add your fees:</strong> Put in what your exchange charges (0.5% - 1.5% is typical) to see what you actually keep.
                    </li>
                    <li>
                        <strong>Read the results:</strong> The cards and the chart show where portfolio value pulled away from what you put in.
                    </li>
                    <li>
                        <strong>Set a target:</strong> If you think in bitcoin rather than dollars, the{' '}
                        <Link href="/calculators/stack-sats-goal" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">stack sats calculator</Link>{' '}
                        shows how long 0.01, 0.1 or a whole coin takes at your contribution rate.
                    </li>
                    <li>
                        <strong>Withdraw &amp; secure:</strong> Stacking is half the job. Once the balance matters to you, move it to your own keys. Our{' '}
                        <Link href="/self-custody" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">self-custody guide</Link>{' '}
                        covers how.
                    </li>
                </ol>
            </section>

            {/* Disclaimer */}
            <section className="border-t border-slate-200 dark:border-slate-800 pt-6 sm:pt-8">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        <strong>Disclaimer:</strong> This site is for education and entertainment, not investment advice. Every figure here comes from historical data, which guarantees nothing about the future. Bitcoin carries a real risk of loss. Do your own research and talk to a qualified financial advisor before you invest.
                    </p>
                </div>
            </section>

        </div>
    );
};

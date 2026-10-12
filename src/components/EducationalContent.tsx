import React from 'react';
import Link from 'next/link';
import { BookOpen, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';
import { feePresetsAsOf, feesCheckIsStale, feesLastVerified } from '@/data/exchangeFees';
import { EARLIEST_PRICE_TS, formatUtc, utcDayIndex } from '@/utils/dates';
import { FIRST_EXCHANGE_CLOSE_TS } from '@/data/priceSources';

// What does not belong in this list: a call to buy, a promotional slogan, or a
// line that cannot be traced to the person named. Three were removed on those
// grounds in October 2026: the "best time to buy bitcoin was 10 years ago, the
// second best time is now" proverb (a buy-now call with no known origin),
// Michael Saylor's "There is no second best" (a slogan), and a line attributed
// to Nassim Taleb that we could not trace to a primary source; his 2021 paper
// "Bitcoin, Currencies, and Fragility" argues the opposite.
const BITCOIN_QUOTES = [
    { text: "If you don't believe it or don't get it, I don't have the time to try to convince you, sorry.", author: "Satoshi Nakamoto" },
    { text: "Bitcoin is a technological tour de force.", author: "Bill Gates" },
    { text: "Running bitcoin", author: "Hal Finney" },
    { text: "Every informed person needs to know about Bitcoin because it might be one of the world's most important developments.", author: "Leon Louw" },
    { text: "Bitcoin will do to banks what email did to the postal industry.", author: "Rick Falkvinge" },
    { text: "Bitcoin is a remarkable cryptographic achievement and the ability to create something that is not duplicable in the digital world has enormous value.", author: "Eric Schmidt" },
    { text: "I think the fact that within the bitcoin universe an algorithm replaces the function of the government is actually pretty cool.", author: "Al Gore" },
    { text: "I am very intrigued by Bitcoin. It has all the signs. Paradigm shift, hackers love it, yet it's derided as a toy. Just like microcomputers.", author: "Paul Graham" },
    { text: "The swarm is headed towards us.", author: "Satoshi Nakamoto" },
];

export const EducationalContent = () => {
    const now = Date.now();
    // The quote changes once a UTC day. This counted days in the server's local
    // time, the one place on the page that did not follow the UTC calendar.
    const dayOfYear = utcDayIndex(now) - utcDayIndex(Date.UTC(new Date(now).getUTCFullYear(), 0, 0));
    const randomQuote = BITCOIN_QUOTES[dayOfYear % BITCOIN_QUOTES.length];

    // The fee range in step 3 is read off the fee comparison's own rows, so the
    // two cannot disagree. It used to be a typed "0.5% - 1.5% is typical" that
    // matched nothing else on the site. No range is quoted when a row carries a
    // flat fee (a percentage range would misstate it) or when the rows have not
    // been re-checked for long enough that the comparison warns about itself.
    const feeRows = feePresetsAsOf(now);
    const feeRange = feeRows.length > 1 && feeRows.every((row) => row.flatFee === 0) && !feesCheckIsStale(now)
        ? {
            count: feeRows.length,
            low: Math.min(...feeRows.map((row) => row.feePercentage)),
            high: Math.max(...feeRows.map((row) => row.feePercentage)),
            checked: formatUtc(feesLastVerified(), 'full'),
            someFeeOnly: feeRows.some((row) => row.includes === 'fee'),
        }
        : null;
    // "Aug 18, 2010": the date style of the calculator this block sits under.
    const earliestDay = formatUtc(EARLIEST_PRICE_TS, 'full');
    const firstExchangeDay = formatUtc(FIRST_EXCHANGE_CLOSE_TS, 'full');

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
                            Almost nobody buys the exact bottom, and the people who did it once rarely do it twice. Buying on a schedule catches the lows along with the highs. What you pay works out as an average across all of those days: never the best price of the stretch, and never the worst.
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
                        This calculator runs on <strong className="text-slate-800 dark:text-slate-200">real historical prices</strong>, so you can see how a plan would have held up through those stretches. From {firstExchangeDay} it uses Coinbase&apos;s daily closing prices. Before that, back to {earliestDay}, it uses blockchain.info&apos;s daily market prices. One caveat is worth knowing. You can switch the price source to Kraken, where we only have one closing price a week: the days in between are straight-line estimates, not prices that traded. Our{' '}
                        <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">Methodology</Link>{' '}
                        page covers how the data is built. Try starting at the December 2017 peak, the March 2020 crash or the November 2021 peak and see how each plan held up.
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
                        <strong>Select dates:</strong> Pick a start date in the past. The earliest date you can pick is {earliestDay}, where our daily price data begins.
                    </li>
                    <li>
                        <strong>Add your fees:</strong> Put in what your platform takes from each buy to see what you actually keep.
                        {feeRange && (
                            ` The ${feeRange.count} platforms in our fee comparison that publish a rate take between ${feeRange.low}% and ${feeRange.high}% of a recurring buy (checked ${feeRange.checked}).${feeRange.someFeeOnly ? ' Where the figure is a fee alone, any spread in the quoted price comes on top.' : ''}`
                        )}
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
                        <strong>After the purchase:</strong> Bitcoin left on an exchange is a claim on that company, and bitcoin in your own wallet depends on your own backup. Our{' '}
                        <Link href="/self-custody" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">self-custody guide</Link>{' '}
                        covers both.
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

'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatUtc } from '@/utils/dates';
import {
    FEE_CHECK_MAX_AGE_DAYS,
    feeCostLabel,
    feeCostUsd,
    feesCheckIsStale,
    feesLastVerified,
    membershipBreakEvenUsdPerMonth,
    resolveExchangeFees,
    type ResolvedExchangeFee,
} from '@/data/exchangeFees';

interface ExchangeFeeComparisonProps {
    totalInvested: number;
    purchaseCount: number;
    /**
     * The instant the rates are resolved for (ms). A server page passes the
     * time it rendered at, so the HTML it caches and the browser hydrating it
     * agree even when a promotion ends in between. Left out, it is the moment
     * this component mounted.
     */
    asOf?: number;
    /** Show the per-platform notes and sources expanded. */
    notesOpen?: boolean;
}

// Platform prices in the notes are quoted in dollars as the platform lists
// them. They are not run through the display currency: Kraken+ is 4.99 in
// each major currency, not $4.99 converted.
const usdPrice = (value: number): string =>
    value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    });

const usdWhole = (value: number): string =>
    Math.round(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** A paid plan that waives the fee, stated as arithmetic and nothing more. */
function membershipSentence(fee: ResolvedExchangeFee): string | null {
    const plan = fee.membership;
    const breakEven = membershipBreakEvenUsdPerMonth(fee);
    if (!plan || !breakEven) return null;
    return (
        `${plan.name} waives this fee on up to ${usdWhole(plan.feeFreeUsdPerMonth)} of trades a month. ` +
        `It costs ${usdPrice(plan.monthlyUsd)} a month or ${usdPrice(plan.annualUsd)} a year. ` +
        `At ${fee.percent}%, ${usdPrice(plan.monthlyUsd)} is the fee on ${usdWhole(breakEven.monthlyPlan)} of buys in a month, ` +
        `and the yearly price works out to the fee on about ${usdWhole(breakEven.annualPlan)} a month. ${plan.note}`
    );
}

const missing = (
    <>
        <span aria-hidden="true">&mdash;</span>
        <span className="sr-only">not published</span>
    </>
);

/**
 * What the same schedule costs on each platform in data/exchangeFees.ts.
 *
 * The rows are not one comparable fee: some figures are a fee, some a spread,
 * and a platform may publish no figure at all. So nothing here is coloured or
 * badged as cheapest or dearest, every row says what its figure is made of,
 * and a platform with no published figure gets no total.
 */
export const ExchangeFeeComparison = ({ totalInvested, purchaseCount, asOf, notesOpen = false }: ExchangeFeeComparisonProps) => {
    const { formatCurrency, convertFromUsd, currencyConfig } = useCurrency();
    const [mountedAt] = useState(() => Date.now());

    if (totalInvested <= 0 || purchaseCount <= 0) return null;

    const resolvedAt = asOf ?? mountedAt;
    const rows = resolveExchangeFees(resolvedAt).map((fee) => ({
        fee,
        totalFees: feeCostUsd(fee, totalInvested, purchaseCount),
    }));
    const checkedOn = formatUtc(feesLastVerified(), 'full');
    const stale = feesCheckIsStale(resolvedAt);

    // Costs are read as money, so they are printed to the cent. They do not go
    // through formatCurrency: it trims trailing zeros ("$130.5") and gives
    // anything under one unit four decimals, which suits an early bitcoin
    // price and not the fee on one buy.
    const cost = (usd: number): string =>
        feeCostLabel(convertFromUsd(usd), currencyConfig.symbol, currencyConfig.code === 'JPY' ? 0 : 2);

    const cell = 'px-3 sm:px-4 py-2 align-top text-right whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400';
    const wideOnly = 'hidden sm:table-cell';

    return (
        <Card className="p-4 sm:p-6">
            <CardHeader
                title="Exchange Fee Comparison"
                subtitle={<>What {formatCurrency(totalInvested)} over {purchaseCount} recurring purchase{purchaseCount === 1 ? '' : 's'} costs at each platform&apos;s own published rate, last checked {checkedOn}</>}
                className="mb-3 sm:mb-4"
            />

            {/* On a phone the table is three columns: name with its note wrapped
                underneath, pricing, and cost with the per-buy figure below it.
                The note used to sit on one unbreakable line beside the name,
                which pushed the table to roughly twice the screen width. */}
            <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-xs sm:text-sm">
                    <caption className="sr-only">
                        Cost of the same recurring-buy schedule on each platform. The figures are not like-for-like:
                        the note under each name says whether it is a fee, a spread or both.
                    </caption>
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                            <th scope="col" className="text-left px-3 sm:px-4 py-2.5 font-medium">Platform</th>
                            <th scope="col" className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Pricing</th>
                            <th scope="col" className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Total Cost</th>
                            <th scope="col" className={`${wideOnly} text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap`}>Net Invested</th>
                            <th scope="col" className={`${wideOnly} text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap`}>Per Purchase</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {rows.map(({ fee, totalFees }) => {
                            const perPurchase = totalFees === null ? null : totalFees / purchaseCount;
                            return (
                                <tr key={fee.id}>
                                    <th scope="row" className="px-3 sm:px-4 py-2 align-top text-left font-normal">
                                        <span className="block font-medium text-slate-700 dark:text-slate-300">{fee.name}</span>
                                        <span className="block text-2xs text-slate-500 dark:text-slate-400">
                                            {fee.note}
                                            {fee.promo && (
                                                <> (promotional rate through {formatUtc(fee.promo.validUntil, 'full')}, then {fee.promo.thenRateLabel})</>
                                            )}
                                        </span>
                                    </th>
                                    <td className={cell}>{fee.rateLabel}</td>
                                    <td className={cell}>
                                        {totalFees === null ? missing : cost(totalFees)}
                                        {perPurchase !== null && (
                                            <span className="block sm:hidden text-2xs text-slate-500 dark:text-slate-400">
                                                {cost(perPurchase)} a buy
                                            </span>
                                        )}
                                    </td>
                                    <td className={`${wideOnly} ${cell}`}>
                                        {totalFees === null ? missing : formatCurrency(totalInvested - totalFees)}
                                    </td>
                                    <td className={`${wideOnly} ${cell}`}>
                                        {perPurchase === null ? missing : cost(perPurchase)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <p className="mt-3 text-2xs sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                These are not one comparable fee. Each platform prices differently, so the line under each name says
                whether its figure is a fee, a spread or both, and what it leaves out. A platform that publishes no
                figure gets no total. Every figure was read from the platform&apos;s own pricing page, last checked{' '}
                {checkedOn}; your own cost moves with order size and payment method. Not every platform is offered
                in every country, and fees can differ by region.
            </p>
            {stale && (
                <p role="note" className="mt-2 text-2xs sm:text-xs font-medium text-amber-700 dark:text-amber-400 leading-relaxed">
                    That check is more than {FEE_CHECK_MAX_AGE_DAYS} days old. Platforms reprice without notice, so
                    read each platform&apos;s own page before relying on these figures.
                </p>
            )}

            <details className="group mt-3 border-t border-slate-100 dark:border-slate-800 pt-1" open={notesOpen}>
                {/* 48px on any touch screen: the floor globals.css gives a summary
                    below 640px, carried up to tablets and phones held sideways. */}
                <summary className="flex items-center justify-between gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden py-2 pointer-coarse:min-h-12 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400">
                    What each figure counts, and its source
                    <ChevronDown
                        className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform group-open:rotate-180"
                        aria-hidden="true"
                    />
                </summary>
                <ul className="mt-1 space-y-3 text-2xs sm:text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {rows.map(({ fee }) => {
                        const membership = membershipSentence(fee);
                        return (
                            <li key={fee.id}>
                                <p>
                                    <strong className="font-semibold text-slate-700 dark:text-slate-300">{fee.name}.</strong>{' '}
                                    {fee.detail}
                                    {membership && <> {membership}</>}
                                </p>
                                {/* One link per line on phones, each a full 44px target.
                                    From 640px they share a row; with a mouse that
                                    row is compact, on a touch screen each link
                                    keeps its 44px. */}
                                <p className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-4">
                                    {fee.sources.map((source) => (
                                        <a
                                            key={source.url}
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center self-start max-sm:min-h-11 pointer-coarse:min-h-11 sm:py-1 text-amber-700 dark:text-amber-400 underline underline-offset-2"
                                        >
                                            {source.label}
                                        </a>
                                    ))}
                                    <span className="inline-flex items-center self-start sm:py-1 pointer-coarse:sm:min-h-11 text-slate-500 dark:text-slate-400">
                                        Checked {formatUtc(fee.verifiedOn, 'full')}
                                    </span>
                                </p>
                            </li>
                        );
                    })}
                </ul>
            </details>
        </Card>
    );
};

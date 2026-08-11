'use client';

import { useState, useMemo, memo } from 'react';
import { DcaBreakdownItem } from '@/types';
import { ChevronDown } from 'lucide-react';
import { useCurrency, Denomination } from '@/context/CurrencyContext';
import { formatUtc } from '@/utils/dates';
import { Card } from '@/components/ui/Card';
import clsx from 'clsx';

interface TransactionTableProps {
    breakdown: DcaBreakdownItem[];
    /** Overrides the site-wide denomination preference when supplied. */
    unit?: Denomination;
}

// Long ranges render at most this many rows until the user asks for all of them.
const INITIAL_ROWS = 200;

const thClass =
    'sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap';

/**
 * Bare numeric amount for the aligned columns — the unit lives in the column header
 * so sats strings (which get long fast) don't blow the row width out.
 */
const formatAmountBare = (btc: number, unit: Denomination): string => {
    if (!Number.isFinite(btc)) return '0';
    if (unit === 'SATS') return Math.floor(btc * 100_000_000).toLocaleString('en-US');
    return btc.toFixed(Math.abs(btc) >= 1 ? 4 : 8).replace(/\.?0+$/, '');
};

export const TransactionTable = memo(function TransactionTable({ breakdown, unit }: TransactionTableProps) {
    const { formatCurrency, denomination } = useCurrency();
    const [open, setOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);

    // Falls back to the site-wide preference when the call site doesn't pin a unit.
    const activeUnit: Denomination = unit ?? denomination;
    const unitLabel = activeUnit === 'SATS' ? 'sats' : 'BTC';

    const { bestIdx, worstIdx } = useMemo(() => {
        if (!breakdown || breakdown.length < 2) return { bestIdx: -1, worstIdx: -1 };
        let minIdx = 0,
            maxIdx = 0;
        for (let i = 1; i < breakdown.length; i++) {
            if (breakdown[i].price < breakdown[minIdx].price) minIdx = i;
            if (breakdown[i].price > breakdown[maxIdx].price) maxIdx = i;
        }
        if (minIdx === maxIdx) return { bestIdx: -1, worstIdx: -1 };
        return { bestIdx: minIdx, worstIdx: maxIdx };
    }, [breakdown]);

    if (!breakdown || breakdown.length === 0) return null;

    const rows = showAll ? breakdown : breakdown.slice(0, INITIAL_ROWS);
    const hiddenCount = breakdown.length - rows.length;

    return (
        <Card className="overflow-hidden">
            {/* Heading wraps the button (WAI-ARIA disclosure pattern) — nested the
                other way round, role=button flattened its children and the heading
                vanished from the accessibility tree. No aria-label: the visible
                text plus the count is the accessible name, and aria-expanded
                already carries the state. */}
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 sm:text-lg">
                <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:p-5"
                >
                    <span>
                        Transaction History{' '}
                        <span className="font-normal text-slate-500 dark:text-slate-400 tabular-nums">
                            ({breakdown.length.toLocaleString()})
                        </span>
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className={clsx(
                            'h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 dark:text-slate-400',
                            open && 'rotate-180',
                        )}
                    />
                </button>
            </h3>

            {open && (
                <div className="border-t border-slate-200 dark:border-slate-800">
                    {/* Card is overflow-hidden, so this is the only thing that scrolls
                        sideways; overscroll-x-contain keeps the swipe off the back gesture
                        while vertical scrolling still chains to the page. */}
                    <div className="max-h-[480px] overflow-x-auto overflow-y-auto overscroll-x-contain">
                        <table className="w-full min-w-[560px] text-xs sm:text-sm">
                            <thead className="text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th scope="col" className={clsx(thClass, 'text-left')}>Date</th>
                                    <th scope="col" className={clsx(thClass, 'text-right')}>BTC Price</th>
                                    <th scope="col" className={clsx(thClass, 'text-right')}>Invested</th>
                                    <th scope="col" className={clsx(thClass, 'text-right')}>Bought ({unitLabel})</th>
                                    <th scope="col" className={clsx(thClass, 'text-right')}>Holdings ({unitLabel})</th>
                                    <th scope="col" className={clsx(thClass, 'text-right')}>Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {rows.map((item, i) => (
                                    <tr
                                        key={i}
                                        className={clsx(
                                            'transition-colors',
                                            i === bestIdx
                                                ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30'
                                                : i === worstIdx
                                                    ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/30'
                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/30',
                                        )}
                                    >
                                        <td className="whitespace-nowrap px-3 py-2 text-slate-700 dark:text-slate-300 sm:px-4">
                                            <span className="flex items-center gap-1.5">
                                                {formatUtc(item.date, 'full')}
                                                {i === bestIdx && (
                                                    <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-medium leading-none text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                                                        Best
                                                    </span>
                                                )}
                                                {i === worstIdx && (
                                                    <span className="rounded bg-rose-100 px-1 py-0.5 text-[10px] font-medium leading-none text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">
                                                        Worst
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600 tabular-nums dark:text-slate-400 sm:px-4">
                                            {formatCurrency(item.price)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600 tabular-nums dark:text-slate-400 sm:px-4">
                                            {formatCurrency(item.invested)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600 tabular-nums dark:text-slate-400 sm:px-4">
                                            {formatAmountBare(item.accumulated, activeUnit)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600 tabular-nums dark:text-slate-400 sm:px-4">
                                            {formatAmountBare(item.totalAccumulated, activeUnit)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-700 tabular-nums dark:text-slate-300 sm:px-4">
                                            {formatCurrency(item.portfolioValue)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {hiddenCount > 0 && (
                        <div className="border-t border-slate-100 p-2 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setShowAll(true)}
                                className="flex min-h-9 w-full items-center justify-center rounded-lg py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10 sm:text-sm"
                            >
                                Show all {breakdown.length.toLocaleString()} purchases
                            </button>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
});

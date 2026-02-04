'use client';

import { useState, useMemo } from 'react';
import { DcaBreakdownItem } from '@/types';
import { format } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import clsx from 'clsx';

interface TransactionTableProps {
    breakdown: DcaBreakdownItem[];
    unit?: 'BTC' | 'SATS';
}

export const TransactionTable = ({ breakdown, unit = 'BTC' }: TransactionTableProps) => {
    const { formatCurrency } = useCurrency();
    const [open, setOpen] = useState(false);

    const isSats = unit === 'SATS';

    const { bestIdx, worstIdx } = useMemo(() => {
        if (!breakdown || breakdown.length < 2) return { bestIdx: -1, worstIdx: -1 };
        let minIdx = 0, maxIdx = 0;
        for (let i = 1; i < breakdown.length; i++) {
            if (breakdown[i].price < breakdown[minIdx].price) minIdx = i;
            if (breakdown[i].price > breakdown[maxIdx].price) maxIdx = i;
        }
        if (minIdx === maxIdx) return { bestIdx: -1, worstIdx: -1 };
        return { bestIdx: minIdx, worstIdx: maxIdx };
    }, [breakdown]);

    if (!breakdown || breakdown.length === 0) return null;

    const formatBtcValue = (btc: number) => {
        if (isSats) return Math.floor(btc * 100_000_000).toLocaleString();
        return btc.toFixed(8);
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
                <h3 className="text-sm sm:text-lg font-semibold text-slate-800 dark:text-slate-100">
                    Transaction History <span className="text-slate-500 dark:text-slate-400 font-normal">({breakdown.length})</span>
                </h3>
                <ChevronDown className={clsx(
                    "w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 shrink-0",
                    open && "rotate-180"
                )} />
            </button>

            {open && (
                <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs sm:text-sm min-w-[560px]">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                                <th className="text-left px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Date</th>
                                <th className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">BTC Price</th>
                                <th className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Invested</th>
                                <th className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">{isSats ? 'Sats Bought' : 'BTC Bought'}</th>
                                <th className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">{isSats ? 'Total Sats' : 'Total BTC'}</th>
                                <th className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {breakdown.map((item, i) => (
                                <tr key={i} className={clsx(
                                    "transition-colors",
                                    i === bestIdx
                                        ? "bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/30"
                                        : i === worstIdx
                                            ? "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30"
                                            : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                                )}>
                                    <td className="px-3 sm:px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                                        <span className="flex items-center gap-1.5">
                                            {format(new Date(item.date), 'MMM d, yy')}
                                            {i === bestIdx && (
                                                <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 leading-none">Best</span>
                                            )}
                                            {i === worstIdx && (
                                                <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 leading-none">Worst</span>
                                            )}
                                        </span>
                                    </td>
                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap text-slate-600 dark:text-slate-400 tabular-nums">
                                        {formatCurrency(item.price)}
                                    </td>
                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap text-slate-600 dark:text-slate-400 tabular-nums">
                                        {formatCurrency(item.invested)}
                                    </td>
                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                                        {formatBtcValue(item.accumulated)}
                                    </td>
                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                                        {formatBtcValue(item.totalAccumulated)}
                                    </td>
                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                                        {formatCurrency(item.portfolioValue)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

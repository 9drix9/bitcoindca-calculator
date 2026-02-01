'use client';

import { AssetDcaResult } from '@/types';
import clsx from 'clsx';

interface AssetComparisonProps {
    btcResult: AssetDcaResult;
    sp500Result: AssetDcaResult | null;
    goldResult: AssetDcaResult | null;
    loading: boolean;
}

const cardStyles = {
    btc: {
        bg: 'bg-amber-50 dark:bg-amber-950/20',
        border: 'border-amber-200 dark:border-amber-800/50',
        label: 'text-amber-700 dark:text-amber-400',
    },
    sp500: {
        bg: 'bg-blue-50 dark:bg-blue-950/20',
        border: 'border-blue-200 dark:border-blue-800/50',
        label: 'text-blue-700 dark:text-blue-400',
    },
    gold: {
        bg: 'bg-yellow-50 dark:bg-yellow-950/20',
        border: 'border-yellow-200 dark:border-yellow-800/50',
        label: 'text-yellow-700 dark:text-yellow-400',
    },
};

const AssetCard = ({
    result,
    style,
    unavailable,
}: {
    result: AssetDcaResult | null;
    style: typeof cardStyles.btc;
    unavailable?: boolean;
}) => {
    if (unavailable || !result) {
        return (
            <div className={clsx('p-3 sm:p-4 rounded-lg border', style.bg, style.border, 'opacity-50')}>
                <div className={clsx('text-xs sm:text-sm font-medium mb-1', style.label)}>
                    {result?.label ?? 'Asset'}
                </div>
                <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">Data unavailable</div>
            </div>
        );
    }

    const isProfit = result.profit >= 0;

    return (
        <div className={clsx('p-3 sm:p-4 rounded-lg border', style.bg, style.border)}>
            <div className={clsx('text-xs sm:text-sm font-medium mb-1', style.label)}>{result.label}</div>
            <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">
                ${result.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className={clsx('text-xs sm:text-sm mt-0.5', isProfit ? 'text-green-600' : 'text-red-600')}>
                {isProfit ? '+' : '-'}${Math.abs(result.profit).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({result.roi.toFixed(1)}%)
            </div>
        </div>
    );
};

export const AssetComparison = ({ btcResult, sp500Result, goldResult, loading }: AssetComparisonProps) => {
    if (loading) {
        return (
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-800 dark:text-slate-100">BTC vs Other Assets (DCA)</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="h-20 sm:h-24 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-800 dark:text-slate-100">BTC vs Other Assets (DCA)</h3>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <AssetCard result={btcResult} style={cardStyles.btc} />
                <AssetCard result={sp500Result} style={cardStyles.sp500} unavailable={!sp500Result} />
                <AssetCard result={goldResult} style={cardStyles.gold} unavailable={!goldResult} />
            </div>
        </div>
    );
};

'use client';

import { useState, useEffect } from 'react';
import { getBitcoinDominance } from '@/app/actions';

interface DominanceData {
    dominancePercent: number;
    btcMarketCap: number;
    totalMarketCap: number;
}

interface DominanceWidgetProps {
    initialData: DominanceData | null;
}

const formatMarketCap = (value: number): string => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toLocaleString()}`;
};

export const DominanceWidget = ({ initialData }: DominanceWidgetProps) => {
    const [data, setData] = useState<DominanceData | null>(initialData);

    useEffect(() => {
        let mounted = true;
        const refresh = async () => {
            try {
                const fresh = await getBitcoinDominance();
                if (mounted && fresh) setData(fresh);
            } catch { /* keep last known */ }
        };
        refresh();
        const interval = setInterval(refresh, 5 * 60_000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    if (!data) return null;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <h4 className="font-semibold text-slate-800 dark:text-white mb-3 text-xs sm:text-sm flex items-center gap-1.5">
                <span className="text-amber-500">&#9733;</span>
                Bitcoin Dominance
            </h4>

            <div className="text-center mb-3">
                <span className="text-2xl sm:text-3xl font-bold tabular-nums text-amber-500">
                    {data.dominancePercent.toFixed(1)}%
                </span>
            </div>

            <div className="mb-3">
                <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, data.dominancePercent)}%` }}
                    />
                </div>
                <div className="flex justify-between mt-1">
                    <span className="text-[9px] sm:text-[10px] text-slate-400">0%</span>
                    <span className="text-[9px] sm:text-[10px] text-slate-400">100%</span>
                </div>
            </div>

            <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">BTC Market Cap</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-white">{formatMarketCap(data.totalMarketCap * (data.dominancePercent / 100))}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Total Crypto</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-white">{formatMarketCap(data.totalMarketCap)}</span>
                </div>
            </div>
        </div>
    );
};

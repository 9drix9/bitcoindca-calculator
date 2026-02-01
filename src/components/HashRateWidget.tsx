'use client';

import { useState, useEffect } from 'react';
import { getHashRateDifficulty } from '@/app/actions';

interface HashRateData {
    hashrate: number;
    difficulty: number;
    adjustmentPercent: number;
    blocksUntilAdjustment: number;
    estimatedRetargetDate: string;
}

interface HashRateWidgetProps {
    initialData: HashRateData | null;
}

const formatHashrate = (h: number): string => {
    const ehps = h / 1e18;
    if (ehps >= 1) return `${ehps.toFixed(1)} EH/s`;
    const phps = h / 1e15;
    if (phps >= 1) return `${phps.toFixed(1)} PH/s`;
    return `${(h / 1e12).toFixed(1)} TH/s`;
};

const formatDifficulty = (d: number): string => {
    if (d >= 1e12) return `${(d / 1e12).toFixed(2)}T`;
    if (d >= 1e9) return `${(d / 1e9).toFixed(2)}B`;
    if (d >= 1e6) return `${(d / 1e6).toFixed(2)}M`;
    return d.toLocaleString();
};

export const HashRateWidget = ({ initialData }: HashRateWidgetProps) => {
    const [data, setData] = useState<HashRateData | null>(initialData);

    useEffect(() => {
        let mounted = true;
        const refresh = async () => {
            try {
                const fresh = await getHashRateDifficulty();
                if (mounted && fresh) setData(fresh);
            } catch { /* keep last known */ }
        };
        refresh();
        const interval = setInterval(refresh, 60_000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    if (!data) return null;

    const isNegativeAdj = data.adjustmentPercent < 0;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <h4 className="font-semibold text-slate-800 dark:text-white mb-3 text-xs sm:text-sm flex items-center gap-1.5">
                <span className="text-amber-500">&#9874;</span>
                Hash Rate &amp; Difficulty
            </h4>

            <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Hashrate</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-white">{formatHashrate(data.hashrate)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Difficulty</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-white">{formatDifficulty(data.difficulty)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Next Adjustment</span>
                    <span className={`font-mono font-semibold ${isNegativeAdj ? 'text-green-500' : 'text-red-500'}`}>
                        {data.adjustmentPercent > 0 ? '+' : ''}{data.adjustmentPercent.toFixed(2)}%
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Blocks Until Retarget</span>
                    <span className="font-mono font-medium text-slate-800 dark:text-white">{data.blocksUntilAdjustment.toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
};

'use client';

import { useState, useEffect, useMemo } from 'react';
import { getBlockHeight } from '@/app/actions';

const NEXT_HALVING_BLOCK = 1_050_000;
const BLOCKS_PER_EPOCH = 210_000;
const AVG_BLOCK_TIME_MINUTES = 10;

interface HalvingCountdownWidgetProps {
    initialHeight: number | null;
}

export const HalvingCountdownWidget = ({ initialHeight }: HalvingCountdownWidgetProps) => {
    const [height, setHeight] = useState<number | null>(initialHeight);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        let mounted = true;
        const refresh = async () => {
            try {
                const fresh = await getBlockHeight();
                if (mounted && fresh !== null) {
                    setHeight(fresh);
                    setNow(Date.now());
                }
            } catch { /* keep last known */ }
        };
        refresh();
        const interval = setInterval(refresh, 60_000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    const stats = useMemo(() => {
        if (height === null) return null;
        const blocksRemaining = NEXT_HALVING_BLOCK - height;
        if (blocksRemaining <= 0) return null;
        const minutesRemaining = blocksRemaining * AVG_BLOCK_TIME_MINUTES;
        const estimatedDate = new Date(now + minutesRemaining * 60_000);
        const currentEpoch = Math.floor(height / BLOCKS_PER_EPOCH);
        const epochStart = currentEpoch * BLOCKS_PER_EPOCH;
        const epochProgress = ((height - epochStart) / BLOCKS_PER_EPOCH) * 100;
        return { blocksRemaining, estimatedDate, epochProgress, currentEpoch };
    }, [height, now]);

    if (!stats || height === null) return null;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <h4 className="font-semibold text-slate-800 dark:text-white mb-3 text-xs sm:text-sm flex items-center gap-1.5">
                <span className="text-amber-500">&#9201;</span>
                Halving Countdown
            </h4>

            <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Block Height</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-white">{height.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Blocks Remaining</span>
                    <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">{stats.blocksRemaining.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Est. Date</span>
                    <span className="font-medium text-slate-800 dark:text-white">
                        {stats.estimatedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                </div>

                <div className="pt-1">
                    <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-slate-400">Epoch {stats.currentEpoch + 1} Progress</span>
                        <span className="text-[10px] text-slate-400">{stats.epochProgress.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, stats.epochProgress)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

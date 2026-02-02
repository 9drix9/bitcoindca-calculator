'use client';

import { useState, useEffect, useMemo } from 'react';
import { getCirculatingSupply } from '@/app/actions';

const MAX_SUPPLY = 21_000_000;
const ESTIMATED_LOST = 3_700_000;
const BLOCKS_PER_EPOCH = 210_000;

interface SupplyScarcityWidgetProps {
    initialSupply: number | null;
    blockHeight: number | null;
}

export const SupplyScarcityWidget = ({ initialSupply, blockHeight }: SupplyScarcityWidgetProps) => {
    const [supply, setSupply] = useState<number | null>(initialSupply);

    useEffect(() => {
        let mounted = true;
        const refresh = async () => {
            try {
                const fresh = await getCirculatingSupply();
                if (mounted && fresh !== null) setSupply(fresh);
            } catch { /* keep last known */ }
        };
        refresh();
        const interval = setInterval(refresh, 5 * 60_000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    const stats = useMemo(() => {
        if (supply === null) return null;
        const circulatingBtc = supply / 100_000_000;
        const percentMined = (circulatingBtc / MAX_SUPPLY) * 100;
        const epoch = blockHeight !== null ? Math.floor(blockHeight / BLOCKS_PER_EPOCH) : 0;
        const blockReward = 50 / Math.pow(2, epoch);
        const availableBtc = circulatingBtc - ESTIMATED_LOST;
        return { circulatingBtc, percentMined, blockReward, availableBtc };
    }, [supply, blockHeight]);

    if (!stats) return null;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <h4 className="font-semibold text-slate-800 dark:text-white mb-3 text-xs sm:text-sm flex items-center gap-1.5">
                <span className="text-amber-500">&#9878;</span>
                Supply Scarcity
            </h4>

            <div className="space-y-2.5 text-xs sm:text-sm">
                <div>
                    <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">Mined</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{stats.percentMined.toFixed(2)}% of 21M</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, stats.percentMined)}%` }}
                        />
                    </div>
                </div>

                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Circulating</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-white">{stats.circulatingBtc.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Est. Available</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-white">{stats.availableBtc.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Est. Lost</span>
                    <span className="font-mono text-red-400">{ESTIMATED_LOST.toLocaleString()} BTC</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Block Reward</span>
                    <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">{stats.blockReward} BTC</span>
                </div>
            </div>
        </div>
    );
};

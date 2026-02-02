'use client';

import { useState, useEffect } from 'react';
import { getLightningStats } from '@/app/actions';

interface LightningData {
    nodeCount: number;
    channelCount: number;
    totalCapacityBtc: number;
}

interface LightningWidgetProps {
    initialData: LightningData | null;
}

export const LightningWidget = ({ initialData }: LightningWidgetProps) => {
    const [data, setData] = useState<LightningData | null>(initialData);

    useEffect(() => {
        let mounted = true;
        const refresh = async () => {
            try {
                const fresh = await getLightningStats();
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
                <span className="text-yellow-400">&#9889;</span>
                Lightning Network
            </h4>

            <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Nodes</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-white">{data.nodeCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Channels</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-white">{data.channelCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Capacity</span>
                    <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">{data.totalCapacityBtc.toLocaleString(undefined, { maximumFractionDigits: 1 })} BTC</span>
                </div>
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <a
                    href="https://mempool.space/lightning"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 hover:text-amber-500 transition-colors"
                >
                    Data from mempool.space
                </a>
            </div>
        </div>
    );
};

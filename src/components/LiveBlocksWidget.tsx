'use client';

import { useState, useEffect, useRef } from 'react';
import { Box } from 'lucide-react';
import { getRecentBlocks } from '@/app/actions';

interface BlockData {
    height: number;
    timestamp: number;
    txCount: number;
    size: number;
}

interface LiveBlocksWidgetProps {
    initialData: BlockData[] | null;
}

const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
};

const formatSize = (bytes: number) => {
    return (bytes / 1_000_000).toFixed(2);
};

export const LiveBlocksWidget = ({ initialData }: LiveBlocksWidgetProps) => {
    const [data, setData] = useState<BlockData[] | null>(initialData);
    const prevHeightsRef = useRef<Set<number>>(new Set(initialData?.map(b => b.height) ?? []));
    const [newHeights, setNewHeights] = useState<Set<number>>(new Set());

    useEffect(() => {
        let mounted = true;

        const refresh = async () => {
            try {
                const fresh = await getRecentBlocks();
                if (mounted && fresh) {
                    const prevHeights = prevHeightsRef.current;
                    const freshNewHeights = new Set<number>();
                    for (const block of fresh) {
                        if (!prevHeights.has(block.height)) {
                            freshNewHeights.add(block.height);
                        }
                    }
                    if (freshNewHeights.size > 0) {
                        setNewHeights(freshNewHeights);
                        setTimeout(() => {
                            if (mounted) setNewHeights(new Set());
                        }, 2000);
                    }
                    prevHeightsRef.current = new Set(fresh.map(b => b.height));
                    setData(fresh);
                }
            } catch {
                // keep showing last known data
            }
        };

        refresh();
        const interval = setInterval(refresh, 30_000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    // Update time-ago labels every 10 seconds
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 10_000);
        return () => clearInterval(timer);
    }, []);

    if (!data) return null;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-3">
                <Box className="w-4 h-4 text-amber-500" />
                <h4 className="font-semibold text-slate-800 dark:text-white text-xs sm:text-sm">Latest Blocks</h4>
            </div>
            <div className="space-y-2">
                {data.map((block) => (
                    <div
                        key={block.height}
                        className={`flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors duration-700 ${
                            newHeights.has(block.height)
                                ? 'bg-green-50 dark:bg-green-950/30'
                                : 'bg-slate-50 dark:bg-slate-800/50'
                        }`}
                    >
                        <div className="flex flex-col">
                            <span className="text-xs sm:text-sm font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                                {block.height.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                {formatTimeAgo(block.timestamp)}
                            </span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">
                                {block.txCount.toLocaleString()} txs
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                {formatSize(block.size)} MB
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <a
                    href="https://mempool.space"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] sm:text-xs text-slate-400 hover:text-amber-500 transition-colors"
                >
                    Data from mempool.space
                </a>
            </div>
        </div>
    );
};

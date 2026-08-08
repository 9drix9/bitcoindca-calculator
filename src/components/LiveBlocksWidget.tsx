'use client';

import { useState, useEffect, useRef } from 'react';
import { Box } from 'lucide-react';
import { getRecentBlocks } from '@/app/actions';
import { Card, CardHeader } from '@/components/ui/Card';

interface BlockData {
    height: number;
    timestamp: number;
    txCount: number;
    size: number;
}

interface LiveBlocksWidgetProps {
    initialData: BlockData[] | null;
}

const POLL_MS = 30_000;

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
    const hadInitialData = useRef(initialData !== null);

    useEffect(() => {
        let mounted = true;
        // SSR data is seconds old at hydration; only fetch immediately when it is missing.
        let lastFetched = hadInitialData.current ? Date.now() : 0;

        const refresh = async () => {
            lastFetched = Date.now();
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

        if (!hadInitialData.current) refresh();

        const interval = setInterval(() => {
            if (!document.hidden) refresh();
        }, POLL_MS);
        const onVisibilityChange = () => {
            if (!document.hidden && Date.now() - lastFetched >= POLL_MS) refresh();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            mounted = false;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, []);

    // Update time-ago labels every 10 seconds (skipped while the tab is hidden)
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => {
            if (!document.hidden) setTick(t => t + 1);
        }, 10_000);
        return () => clearInterval(timer);
    }, []);

    return (
        <Card className="p-4">
            <CardHeader icon={<Box className="w-4 h-4" />} title="Latest Blocks" className="mb-3" />

            {data ? (
                <div className="space-y-2">
                    {data.map((block) => (
                        <div
                            key={block.height}
                            className={`flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors duration-700 ${
                                newHeights.has(block.height)
                                    ? 'bg-emerald-50 dark:bg-emerald-950/30'
                                    : 'bg-slate-50 dark:bg-slate-800/50'
                            }`}
                        >
                            <div className="flex flex-col">
                                <span className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                                    {block.height.toLocaleString()}
                                </span>
                                {/* Relative time drifts between SSR and hydration — mismatch is expected */}
                                <span suppressHydrationWarning className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                    {formatTimeAgo(block.timestamp)}
                                </span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                                    {block.txCount.toLocaleString()} txs
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                    {formatSize(block.size)} MB
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Data unavailable</p>
            )}

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <a
                    href="https://mempool.space"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 hover:text-amber-500 transition-colors"
                >
                    Data from mempool.space
                </a>
            </div>
        </Card>
    );
};

'use client';

import { useState, useEffect } from 'react';
import { Box } from 'lucide-react';
import type { RecentBlock } from '@/app/api/live/contract';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { LONE_LINK_HIT_AREA, StaleNote } from '@/components/live/cardFooter';
import { useLiveFigure } from '@/components/live/liveSidebar';

interface LiveBlocksWidgetProps {
    initialData: RecentBlock[] | null;
    /** When the server fetched `initialData` (ms epoch). */
    fetchedAt?: number | null;
}

const formatTimeAgo = (timestamp: number, nowMs: number) => {
    const seconds = Math.max(0, Math.floor(nowMs / 1000 - timestamp));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
};

// What a row says before the visitor's clock is read: the block's own time of
// day. The server and the browser print the same text for it, where an age
// worked out on each side would differ and React would keep the server's.
const formatUtcClock = (timestamp: number) => {
    const minutes = Math.floor(timestamp / 60) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} UTC`;
};

// Blocks arrive every ~10 minutes; a newest block this old means the feed is
// down (the widget keeps last-known data on failed refreshes), not that no
// blocks were mined.
const STALE_AFTER_S = 2 * 3600;

const formatSize = (bytes: number) => {
    return (bytes / 1_000_000).toFixed(2);
};

const NO_HEIGHTS: ReadonlySet<number> = new Set();

export const LiveBlocksWidget = ({ initialData, fetchedAt }: LiveBlocksWidgetProps) => {
    const { data, fetchedAt: since, old, checkedAt } = useLiveFigure('recentBlocks', initialData, fetchedAt);

    // Blocks that were not in the list before this one, tinted for two seconds.
    const [listed, setListed] = useState(data);
    const [newHeights, setNewHeights] = useState(NO_HEIGHTS);
    if (data !== listed) {
        const before = new Set(listed?.map(b => b.height));
        const arrived = (data ?? []).filter(b => !before.has(b.height)).map(b => b.height);
        setListed(data);
        setNewHeights(arrived.length > 0 ? new Set(arrived) : NO_HEIGHTS);
    }
    useEffect(() => {
        if (newHeights.size === 0) return;
        const timer = setTimeout(() => setNewHeights(NO_HEIGHTS), 2000);
        return () => clearTimeout(timer);
    }, [newHeights]);

    // The visitor's clock, for the time-ago labels: read after hydration, then
    // every 10 seconds and whenever the tab is shown again (a hidden tab's
    // timer is skipped, so the labels would otherwise wait for the next tick).
    // 0 during SSR/hydration, where each row shows its UTC time instead.
    const [now, setNow] = useState(0);
    useEffect(() => {
        const sync = () => {
            if (!document.hidden) setNow(Date.now());
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client clock sync after hydration; SSR deterministically renders each block's UTC time
        setNow(Date.now());
        const timer = setInterval(sync, 10_000);
        document.addEventListener('visibilitychange', sync);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', sync);
        };
    }, []);

    // Judged against the server's clock once a refresh has finished. Before
    // that the blocks are the page's, and a page out of a cache is old without
    // the feed being down.
    const newestTs = data?.length ? Math.max(...data.map(b => b.timestamp)) : null;
    const isStale = checkedAt !== null && newestTs !== null && checkedAt / 1000 - newestTs > STALE_AFTER_S;

    return (
        <Card className="p-4">
            <CardHeader icon={<Box className="w-4 h-4" />} title="Latest Blocks" className="mb-3" />

            {data ? (
                <div className="space-y-2">
                    {isStale && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Feed may be out of date — showing the last blocks we saw.
                        </p>
                    )}
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
                                {/* 'en-US', as the server rendered it: a browser's own locale
                                    ("971.005") broke hydration for the whole sidebar. */}
                                <span className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                                    {block.height.toLocaleString('en-US')}
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                    {now === 0 ? formatUtcClock(block.timestamp) : formatTimeAgo(block.timestamp, now)}
                                </span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                                    {block.txCount.toLocaleString('en-US')} txs
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                    {formatSize(block.size)} MB
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState />
            )}

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {old && <StaleNote since={since} />}
                <a
                    href="https://mempool.space"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${LONE_LINK_HIT_AREA} text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors`}
                >
                    Data from mempool.space
                </a>
            </div>
        </Card>
    );
};

'use client';

import { useState, useEffect, useMemo } from 'react';
import { Timer } from 'lucide-react';
import { Card, CardHeader, StatRow, EmptyState } from '@/components/ui/Card';
import { StaleNote } from '@/components/live/cardFooter';
import { useLiveFigure } from '@/components/live/liveSidebar';
import { formatUtc } from '@/utils/dates';

const BLOCKS_PER_EPOCH = 210_000;
const AVG_BLOCK_TIME_MINUTES = 10;

interface HalvingCountdownWidgetProps {
    initialHeight: number | null;
    /** When the server fetched `initialHeight` (ms epoch). */
    fetchedAt?: number | null;
}

export const HalvingCountdownWidget = ({ initialHeight, fetchedAt }: HalvingCountdownWidgetProps) => {
    const { data: height, fetchedAt: since, old } = useLiveFigure('blockHeight', initialHeight, fetchedAt);
    const [now, setNow] = useState(0);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- client clock sync after hydration and with each new height; SSR deterministically renders the date placeholder
        setNow(Date.now());
    }, [height]);

    // Time-independent stats derive from block height alone, so the card can
    // render during SSR/hydration without a mismatch; the estimated date fills
    // in once the client clock is known.
    const stats = useMemo(() => {
        if (height === null) return null;
        const currentEpoch = Math.floor(height / BLOCKS_PER_EPOCH);
        const nextHalvingBlock = (currentEpoch + 1) * BLOCKS_PER_EPOCH;
        const blocksRemaining = nextHalvingBlock - height;
        if (blocksRemaining <= 0) return null;
        const epochStart = currentEpoch * BLOCKS_PER_EPOCH;
        const epochProgress = ((height - epochStart) / BLOCKS_PER_EPOCH) * 100;
        return { blocksRemaining, epochProgress, currentEpoch, nextHalvingBlock };
    }, [height]);

    const estimatedDate = stats && now > 0
        ? new Date(now + stats.blocksRemaining * AVG_BLOCK_TIME_MINUTES * 60_000)
        : null;

    return (
        <Card className="p-4">
            <CardHeader icon={<Timer className="w-4 h-4" />} title="Halving Countdown" className="mb-3" />

            {stats && height !== null ? (
                <div className="space-y-2.5">
                    {/* 'en-US' on every number: the server renders these, and a browser
                        left to its own locale ("971.005") no longer matched that HTML. */}
                    <StatRow label="Block Height" value={height.toLocaleString('en-US')} />
                    <StatRow
                        label="Blocks Remaining"
                        value={stats.blocksRemaining.toLocaleString('en-US')}
                        valueClassName="text-amber-700 dark:text-amber-400"
                    />
                    <StatRow
                        label="Est. Date"
                        value={estimatedDate ? formatUtc(estimatedDate.getTime(), 'full') : '—'}
                    />

                    <div className="pt-1">
                        <div className="flex justify-between mb-1">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">Epoch {stats.currentEpoch + 1} Progress</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{stats.epochProgress.toFixed(1)}%</span>
                        </div>
                        <div
                            className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
                            role="progressbar"
                            aria-label={`Epoch ${stats.currentEpoch + 1} progress`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(stats.epochProgress * 10) / 10}
                        >
                            <div
                                className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-colors duration-500"
                                style={{ width: `${Math.min(100, stats.epochProgress)}%` }}
                            />
                        </div>
                    </div>
                </div>
            ) : (
                <EmptyState />
            )}

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                {old && <StaleNote since={since} />}
                Est. date assumes 10-minute blocks.{' '}
                <a
                    href="https://mempool.space"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                >
                    Data from mempool.space
                </a>
            </div>
        </Card>
    );
};

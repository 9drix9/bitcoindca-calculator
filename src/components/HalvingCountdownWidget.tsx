'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Timer } from 'lucide-react';
import { getBlockHeight } from '@/app/actions';
import { Card, CardHeader, StatRow } from '@/components/ui/Card';

const BLOCKS_PER_EPOCH = 210_000;
const AVG_BLOCK_TIME_MINUTES = 10;
const POLL_MS = 60_000;

interface HalvingCountdownWidgetProps {
    initialHeight: number | null;
}

export const HalvingCountdownWidget = ({ initialHeight }: HalvingCountdownWidgetProps) => {
    const [height, setHeight] = useState<number | null>(initialHeight);
    const [now, setNow] = useState(0);
    const hadInitialData = useRef(initialHeight !== null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client clock sync after hydration; SSR deterministically renders the date placeholder
        setNow(Date.now());
    }, []);

    useEffect(() => {
        let mounted = true;
        // SSR data is seconds old at hydration; only fetch immediately when it is missing.
        let lastFetched = hadInitialData.current ? Date.now() : 0;

        const refresh = async () => {
            lastFetched = Date.now();
            try {
                const fresh = await getBlockHeight();
                if (mounted && fresh !== null) {
                    setHeight(fresh);
                    setNow(Date.now());
                }
            } catch { /* keep last known */ }
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
                    <StatRow label="Block Height" value={height.toLocaleString()} />
                    <StatRow
                        label="Blocks Remaining"
                        value={stats.blocksRemaining.toLocaleString()}
                        valueClassName="text-amber-600 dark:text-amber-400"
                    />
                    <StatRow
                        label="Est. Date"
                        value={estimatedDate
                            ? estimatedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                            : '—'}
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
                                className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, stats.epochProgress)}%` }}
                            />
                        </div>
                    </div>
                </div>
            ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Data unavailable</p>
            )}
        </Card>
    );
};

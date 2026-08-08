'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Scale } from 'lucide-react';
import { getCirculatingSupply } from '@/app/actions';
import { Card, CardHeader, StatRow } from '@/components/ui/Card';

const MAX_SUPPLY = 21_000_000;
const ESTIMATED_LOST = 3_700_000;
const BLOCKS_PER_EPOCH = 210_000;
const POLL_MS = 5 * 60_000;

interface SupplyScarcityWidgetProps {
    initialSupply: number | null;
    blockHeight: number | null;
}

export const SupplyScarcityWidget = ({ initialSupply, blockHeight }: SupplyScarcityWidgetProps) => {
    const [supply, setSupply] = useState<number | null>(initialSupply);
    const hadInitialData = useRef(initialSupply !== null);

    useEffect(() => {
        let mounted = true;
        // SSR data is seconds old at hydration; only fetch immediately when it is missing.
        let lastFetched = hadInitialData.current ? Date.now() : 0;

        const refresh = async () => {
            lastFetched = Date.now();
            try {
                const fresh = await getCirculatingSupply();
                if (mounted && fresh !== null) setSupply(fresh);
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

    const stats = useMemo(() => {
        if (supply === null) return null;
        const circulatingBtc = supply / 100_000_000;
        const percentMined = (circulatingBtc / MAX_SUPPLY) * 100;
        const epoch = blockHeight !== null ? Math.floor(blockHeight / BLOCKS_PER_EPOCH) : 0;
        const blockReward = 50 / Math.pow(2, epoch);
        const availableBtc = circulatingBtc - ESTIMATED_LOST;
        return { circulatingBtc, percentMined, blockReward, availableBtc };
    }, [supply, blockHeight]);

    return (
        <Card className="p-4">
            <CardHeader icon={<Scale className="w-4 h-4" />} title="Supply Scarcity" className="mb-3" />

            {stats ? (
                <div className="space-y-2.5">
                    <div>
                        <div className="flex justify-between mb-1">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">Mined</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{stats.percentMined.toFixed(2)}% of 21M</span>
                        </div>
                        <div
                            className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
                            role="meter"
                            aria-label="Share of the 21 million BTC supply already mined"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(stats.percentMined * 100) / 100}
                        >
                            <div
                                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, stats.percentMined)}%` }}
                            />
                        </div>
                    </div>

                    <StatRow label="Circulating" value={`${stats.circulatingBtc.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC`} />
                    <StatRow label="Est. Available" value={`${stats.availableBtc.toLocaleString(undefined, { maximumFractionDigits: 0 })} BTC`} />
                    <StatRow
                        label="Est. Lost"
                        value={`${ESTIMATED_LOST.toLocaleString()} BTC`}
                        valueClassName="font-normal text-loss"
                    />
                    <StatRow
                        label="Block Reward"
                        value={`${stats.blockReward} BTC`}
                        valueClassName="text-amber-700 dark:text-amber-400"
                    />
                </div>
            ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Data unavailable</p>
            )}
        </Card>
    );
};

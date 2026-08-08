'use client';

import { useState, useEffect, useRef } from 'react';
import { Cpu } from 'lucide-react';
import { getHashRateDifficulty } from '@/app/actions';
import { Card, CardHeader, StatRow } from '@/components/ui/Card';

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

const POLL_MS = 60_000;

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
    const hadInitialData = useRef(initialData !== null);

    useEffect(() => {
        let mounted = true;
        // SSR data is seconds old at hydration; only fetch immediately when it is missing.
        let lastFetched = hadInitialData.current ? Date.now() : 0;

        const refresh = async () => {
            lastFetched = Date.now();
            try {
                const fresh = await getHashRateDifficulty();
                if (mounted && fresh) setData(fresh);
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

    const isNegativeAdj = data !== null && data.adjustmentPercent < 0;

    return (
        <Card className="p-4">
            <CardHeader icon={<Cpu className="w-4 h-4" />} title="Hash Rate & Difficulty" className="mb-3" />

            {data ? (
                <div className="space-y-2">
                    <StatRow label="Hashrate" value={formatHashrate(data.hashrate)} />
                    <StatRow label="Difficulty" value={formatDifficulty(data.difficulty)} />
                    <StatRow
                        label="Next Adjustment"
                        value={`${data.adjustmentPercent > 0 ? '+' : ''}${data.adjustmentPercent.toFixed(2)}%`}
                        valueClassName={isNegativeAdj ? 'text-gain' : 'text-loss'}
                    />
                    <StatRow label="Blocks Until Retarget" value={data.blocksUntilAdjustment.toLocaleString()} />
                </div>
            ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Data unavailable</p>
            )}
        </Card>
    );
};

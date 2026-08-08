'use client';

import { useState, useEffect, useRef } from 'react';
import { Zap } from 'lucide-react';
import { getLightningStats } from '@/app/actions';
import { Card, CardHeader, StatRow } from '@/components/ui/Card';

interface LightningData {
    nodeCount: number;
    channelCount: number;
    totalCapacityBtc: number;
}

interface LightningWidgetProps {
    initialData: LightningData | null;
}

const POLL_MS = 5 * 60_000;

export const LightningWidget = ({ initialData }: LightningWidgetProps) => {
    const [data, setData] = useState<LightningData | null>(initialData);
    const hadInitialData = useRef(initialData !== null);

    useEffect(() => {
        let mounted = true;
        // SSR data is seconds old at hydration; only fetch immediately when it is missing.
        let lastFetched = hadInitialData.current ? Date.now() : 0;

        const refresh = async () => {
            lastFetched = Date.now();
            try {
                const fresh = await getLightningStats();
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

    return (
        <Card className="p-4">
            <CardHeader icon={<Zap className="w-4 h-4" />} title="Lightning Network" className="mb-3" />

            {data ? (
                <div className="space-y-2">
                    <StatRow label="Nodes" value={data.nodeCount.toLocaleString()} />
                    <StatRow label="Channels" value={data.channelCount.toLocaleString()} />
                    <StatRow
                        label="Capacity"
                        value={`${data.totalCapacityBtc.toLocaleString(undefined, { maximumFractionDigits: 1 })} BTC`}
                        valueClassName="text-amber-700 dark:text-amber-400"
                    />
                </div>
            ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Data unavailable</p>
            )}

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <a
                    href="https://mempool.space/lightning"
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

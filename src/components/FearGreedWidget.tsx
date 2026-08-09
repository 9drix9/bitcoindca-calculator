'use client';

import { useState, useEffect, useRef } from 'react';
import { Gauge } from 'lucide-react';
import { getFearGreedIndex } from '@/app/actions';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';

interface FearGreedData {
    value: number;
    classification: string;
}

interface FearGreedWidgetProps {
    initialData: FearGreedData | null;
}

const POLL_MS = 5 * 60_000; // this data changes slowly

const getValueColor = (value: number) => {
    if (value <= 25) return 'text-rose-700 dark:text-rose-400';
    if (value <= 45) return 'text-orange-700 dark:text-orange-400';
    if (value <= 55) return 'text-yellow-700 dark:text-yellow-400';
    if (value <= 75) return 'text-lime-700 dark:text-lime-400';
    return 'text-emerald-700 dark:text-emerald-400';
};

export const FearGreedWidget = ({ initialData }: FearGreedWidgetProps) => {
    const [data, setData] = useState<FearGreedData | null>(initialData);
    const hadInitialData = useRef(initialData !== null);

    useEffect(() => {
        let mounted = true;
        // SSR data is seconds old at hydration; only fetch immediately when it is missing.
        let lastFetched = hadInitialData.current ? Date.now() : 0;

        const refresh = async () => {
            lastFetched = Date.now();
            try {
                const fresh = await getFearGreedIndex();
                if (mounted && fresh) setData(fresh);
            } catch {
                // keep showing last known data
            }
        };

        if (!hadInitialData.current) refresh();

        // Visibility-gated polling: skip while hidden, catch up when the tab returns.
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

    const clampedValue = data ? Math.min(100, Math.max(0, data.value)) : 0;

    return (
        <Card className="p-4">
            <CardHeader icon={<Gauge className="w-4 h-4" />} title="Fear & Greed Index" className="mb-3" />

            {data ? (
                <>
                    <div className="text-center mb-3">
                        <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${getValueColor(data.value)}`}>
                            {data.value}
                        </span>
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 ml-0.5">/100</span>
                        <p className={`text-xs sm:text-sm font-medium mt-0.5 ${getValueColor(data.value)}`}>
                            {data.classification}
                        </p>
                    </div>

                    <div
                        className="relative h-2.5"
                        role="meter"
                        aria-label="Fear and Greed Index"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={clampedValue}
                        aria-valuetext={`${data.value} out of 100 — ${data.classification}`}
                    >
                        <div className="h-full rounded-full bg-gradient-to-r from-rose-500 via-yellow-500 to-emerald-500" />
                        {/* Marker sits on an unclipped track so it stays whole at 0 and 100 */}
                        <div
                            aria-hidden="true"
                            className="absolute top-0 w-1 h-full bg-white dark:bg-slate-950 border border-slate-400 rounded-full"
                            style={{ left: `${clampedValue}%`, transform: 'translateX(-50%)' }}
                        />
                    </div>
                    <div className="flex justify-between mt-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Extreme Fear</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Extreme Greed</span>
                    </div>
                </>
            ) : (
                <EmptyState />
            )}

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <a
                    href="https://alternative.me/crypto/fear-and-greed-index/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                >
                    Data from alternative.me
                </a>
            </div>
        </Card>
    );
};

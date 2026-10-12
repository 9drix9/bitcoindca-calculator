'use client';

import { Gauge } from 'lucide-react';
import type { FearGreed } from '@/app/api/live/contract';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { LONE_LINK_HIT_AREA, StaleNote } from '@/components/live/cardFooter';
import { useLiveFigure } from '@/components/live/liveSidebar';

interface FearGreedWidgetProps {
    initialData: FearGreed | null;
    /** When the server fetched `initialData` (ms epoch). */
    fetchedAt?: number | null;
}

const getValueColor = (value: number) => {
    if (value <= 25) return 'text-rose-700 dark:text-rose-400';
    if (value <= 45) return 'text-orange-700 dark:text-orange-400';
    if (value <= 55) return 'text-yellow-700 dark:text-yellow-400';
    if (value <= 75) return 'text-lime-700 dark:text-lime-400';
    return 'text-emerald-700 dark:text-emerald-400';
};

export const FearGreedWidget = ({ initialData, fetchedAt }: FearGreedWidgetProps) => {
    const { data, fetchedAt: since, old } = useLiveFigure('fearGreed', initialData, fetchedAt);

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
                {old && <StaleNote since={since} />}
                <a
                    href="https://alternative.me/crypto/fear-and-greed-index/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${LONE_LINK_HIT_AREA} text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors`}
                >
                    Data from alternative.me
                </a>
            </div>
        </Card>
    );
};

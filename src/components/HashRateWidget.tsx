'use client';

import { Cpu } from 'lucide-react';
import type { HashRateDifficulty } from '@/app/api/live/contract';
import { Card, CardHeader, StatRow, EmptyState } from '@/components/ui/Card';
import { LONE_LINK_HIT_AREA, StaleNote } from '@/components/live/cardFooter';
import { useLiveFigure } from '@/components/live/liveSidebar';
import { formatUtc } from '@/utils/dates';

interface HashRateWidgetProps {
    initialData: HashRateDifficulty | null;
    /** When the server fetched `initialData` (ms epoch). */
    fetchedAt?: number | null;
}

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
    return d.toLocaleString('en-US');
};

export const HashRateWidget = ({ initialData, fetchedAt }: HashRateWidgetProps) => {
    const { data, fetchedAt: since, old } = useLiveFigure('hashRate', initialData, fetchedAt);

    const isNegativeAdj = data !== null && data.adjustmentPercent < 0;
    // An ISO timestamp, or '' when the provider sent no date.
    const retargetTs = data?.estimatedRetargetDate ? Date.parse(data.estimatedRetargetDate) : NaN;

    return (
        <Card className="p-4">
            <CardHeader icon={<Cpu className="w-4 h-4" />} title="Hash Rate & Difficulty" className="mb-3" />

            {data ? (
                <div className="space-y-2">
                    <StatRow label="Hashrate" value={formatHashrate(data.hashrate)} />
                    {/* The server nulls the whole payload on shape drift, so any value
                        that reaches here is real — including 0 blocks at a retarget boundary. */}
                    <StatRow label="Difficulty" value={data.difficulty > 0 ? formatDifficulty(data.difficulty) : '—'} />
                    {/* Rising difficulty means hashrate growth — network strength, green like everywhere else. */}
                    <StatRow
                        label="Next Adjustment"
                        value={`${data.adjustmentPercent > 0 ? '+' : ''}${data.adjustmentPercent.toFixed(2)}%`}
                        valueClassName={isNegativeAdj ? 'text-loss' : 'text-gain'}
                    />
                    <StatRow
                        label="Blocks Until Retarget"
                        value={data.blocksUntilAdjustment >= 0 ? data.blocksUntilAdjustment.toLocaleString('en-US') : '—'}
                    />
                    {/* A UTC date in 'en-US', like every other date on the site: the
                        server and any browser now print the same text, where the
                        visitor's locale and time zone used to decide it. */}
                    <StatRow
                        label="Est. Retarget"
                        value={Number.isFinite(retargetTs) ? formatUtc(retargetTs, 'monthDay') : '—'}
                    />
                </div>
            ) : (
                <EmptyState />
            )}

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {old && <StaleNote since={since} />}
                <a
                    href="https://mempool.space/mining"
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

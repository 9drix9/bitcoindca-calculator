'use client';

import { Zap } from 'lucide-react';
import type { LightningStats } from '@/app/api/live/contract';
import { Card, CardHeader, StatRow, EmptyState } from '@/components/ui/Card';
import { LONE_LINK_HIT_AREA, StaleNote } from '@/components/live/cardFooter';
import { useLiveFigure } from '@/components/live/liveSidebar';
import { DAY_MS, formatUtc } from '@/utils/dates';

interface LightningWidgetProps {
    initialData: LightningStats | null;
    /** When the server fetched `initialData` (ms epoch). */
    fetchedAt?: number | null;
}

// mempool.space publishes one row a day, dated 00:00 UTC, and some of its
// servers answer with a row weeks old. A healthy row is under a day old, so
// three days leaves room for a late one without passing off an old one.
const ROW_STALE_MS = 3 * DAY_MS;

export const LightningWidget = ({ initialData, fetchedAt }: LightningWidgetProps) => {
    const live = useLiveFigure('lightning', initialData, fetchedAt);
    // A refresh can come from a server holding an earlier row than the page
    // was built with. The newer day's counts stay.
    const data = initialData && live.data && initialData.asOf > live.data.asOf ? initialData : live.data;
    // Against the server's clock, and only once a refresh has finished: the
    // server's HTML and the render that hydrates it never carry the note.
    const rowIsOld = data !== null && live.checkedAt !== null && live.checkedAt - data.asOf > ROW_STALE_MS;

    return (
        <Card className="p-4">
            <CardHeader icon={<Zap className="w-4 h-4" />} title="Lightning Network" className="mb-3" />

            {data ? (
                <div className="space-y-2">
                    {/* 'en-US' throughout: these render on the server, and the browser's
                        own locale ("16.017") would not match that HTML at hydration. */}
                    <StatRow label="Nodes" value={data.nodeCount.toLocaleString('en-US')} />
                    <StatRow label="Channels" value={data.channelCount.toLocaleString('en-US')} />
                    <StatRow
                        label="Capacity"
                        value={`${data.totalCapacityBtc.toLocaleString('en-US', { maximumFractionDigits: 1 })} BTC`}
                        valueClassName="text-amber-700 dark:text-amber-400"
                    />
                </div>
            ) : (
                <EmptyState />
            )}

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                {live.old && <StaleNote since={live.fetchedAt} />}
                {data && rowIsOld && (
                    <p>
                        mempool.space last updated these figures on {formatUtc(data.asOf, 'full')}. They may be out of date.
                    </p>
                )}
                <a
                    href="https://mempool.space/lightning"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${LONE_LINK_HIT_AREA} hover:text-amber-700 dark:hover:text-amber-400 transition-colors`}
                >
                    Data from mempool.space
                </a>
                {/* The row's own day, always: it can be weeks behind the day it was fetched. */}
                {data && <>, as of {formatUtc(data.asOf, 'full')}</>}
            </div>
        </Card>
    );
};

'use client';

import { useMemo } from 'react';
import { Scale } from 'lucide-react';
import { Card, CardHeader, StatRow, EmptyState } from '@/components/ui/Card';
import { StaleNote } from '@/components/live/cardFooter';
import { useLiveFigure } from '@/components/live/liveSidebar';
import { SATS_PER_BTC } from '@/utils/units';

const MAX_SUPPLY = 21_000_000;
// What the issuance schedule adds up to: 20,999,999.9769 BTC, a little under
// the 21 million it is quoted as (src/app/mining/halvings.ts works it out).
const FINAL_SUPPLY_SATS = 2_099_999_997_690_000;
// Lost coins cannot be counted, only estimated: on the blockchain a lost coin
// looks exactly like one that is being held. This is the low and high estimate
// from a Chainalysis study as reported by Fortune on 25 November 2017
// (fortune.com/2017/11/25/lost-bitcoins, read 2026-10-12). The card used to
// print one exact figure with no source ("3,700,000 BTC") and subtract it from
// the supply to the coin; a range with its year is all the source supports.
// Later estimates differ.
const LOST_ESTIMATE = { lowBtc: 2_780_000, highBtc: 3_790_000, year: 2017 };
const BLOCKS_PER_EPOCH = 210_000;

interface SupplyScarcityWidgetProps {
    initialSupply: number | null;
    blockHeight: number | null;
    /** When the server fetched `initialSupply` (ms epoch). */
    fetchedAt?: number | null;
    /** When the server fetched `blockHeight` (ms epoch). */
    blockHeightFetchedAt?: number | null;
}

export const SupplyScarcityWidget = ({ initialSupply, blockHeight, fetchedAt, blockHeightFetchedAt }: SupplyScarcityWidgetProps) => {
    // Two providers, refreshed separately: either can fail without costing the
    // card the other, and a height the server render missed arrives with the
    // first refresh instead of hiding the reward all session.
    const liveSupply = useLiveFigure('supplySats', initialSupply, fetchedAt);
    const liveHeight = useLiveFigure('blockHeight', blockHeight, blockHeightFetchedAt);
    const supply = liveSupply.data;
    const height = liveHeight.data;
    // One note for the card, dated by the older figure when both are old.
    const oldFigures = [liveSupply, liveHeight].filter(figure => figure.old);
    const oldSince = oldFigures.some(figure => figure.fetchedAt === null)
        ? null
        : Math.min(...oldFigures.map(figure => figure.fetchedAt ?? Infinity));

    const stats = useMemo(() => {
        if (supply === null) return null;
        const circulatingBtc = supply / SATS_PER_BTC;
        const percentMined = (circulatingBtc / MAX_SUPPLY) * 100;
        // No height means no honest reward figure — epoch 0 would claim 50 BTC.
        const blockReward = height !== null
            ? 50 / Math.pow(2, Math.floor(height / BLOCKS_PER_EPOCH))
            : null;
        const leftToMineBtc = Math.max(0, FINAL_SUPPLY_SATS - supply) / SATS_PER_BTC;
        return { circulatingBtc, percentMined, leftToMineBtc, blockReward };
    }, [supply, height]);

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
                                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-colors duration-500"
                                style={{ width: `${Math.min(100, stats.percentMined)}%` }}
                            />
                        </div>
                    </div>

                    {/* 'en-US': rendered on the server, so the browser's own locale
                        ("20.096.834") would not match that HTML at hydration. */}
                    <StatRow label="Circulating" value={`${stats.circulatingBtc.toLocaleString('en-US', { maximumFractionDigits: 0 })} BTC`} />
                    <StatRow label="Left to Mine" value={`${stats.leftToMineBtc.toLocaleString('en-US', { maximumFractionDigits: 0 })} BTC`} />
                    <StatRow
                        label={`Est. Lost (${LOST_ESTIMATE.year} study)`}
                        value={`${(LOST_ESTIMATE.lowBtc / 1e6).toFixed(2)}M–${(LOST_ESTIMATE.highBtc / 1e6).toFixed(2)}M BTC`}
                        valueClassName="font-normal text-loss whitespace-nowrap"
                    />
                    {stats.blockReward !== null && (
                        <StatRow
                            label="Block Reward"
                            value={`${stats.blockReward} BTC`}
                            valueClassName="text-amber-700 dark:text-amber-400"
                        />
                    )}
                </div>
            ) : (
                <EmptyState />
            )}

            {stats && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {oldFigures.length > 0 && <StaleNote since={oldSince} />}
                    <p>
                        Lost coins cannot be counted, only estimated. The range is from a Chainalysis study{' '}
                        <a
                            href="https://fortune.com/2017/11/25/lost-bitcoins/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                        >
                            reported by Fortune in {LOST_ESTIMATE.year}
                        </a>
                        ; later estimates differ. Supply from{' '}
                        <a
                            href="https://www.blockchain.com/explorer/charts/total-bitcoins"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                        >
                            blockchain.info
                        </a>
                        , block height from{' '}
                        <a
                            href="https://mempool.space"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                        >
                            mempool.space
                        </a>
                        .
                    </p>
                </div>
            )}
        </Card>
    );
};

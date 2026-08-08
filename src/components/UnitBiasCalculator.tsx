'use client';

import { useMemo } from 'react';
import { Scale } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';

/**
 * Fixed assumptions, not live data.
 *
 * WORLD_POPULATION is a round stand-in for the world population around 2025-2026. It
 * is hardcoded and will drift; it is labelled as an assumption in the copy below
 * rather than presented as a measurement.
 *
 * MAX_SUPPLY_SATS is the 21,000,000 BTC issuance cap. Note the deliberate date
 * mismatch this stat contains: the cap is not reached until roughly 2140, while the
 * population is today's. The number below is therefore "an equal split of every coin
 * that will ever exist, among everyone alive now" — the copy says so, because
 * comparing a 2140 supply against a 2026 headcount is only meaningful if the reader
 * knows that is what is being done.
 */
const WORLD_POPULATION = 8_100_000_000;
const MAX_SUPPLY_SATS = 21_000_000 * 100_000_000;
const FAIR_SHARE_SATS = Math.floor(MAX_SUPPLY_SATS / WORLD_POPULATION); // ~259,259 sats

const formatMultiple = (multiple: number): string => {
    if (multiple >= 10) return multiple.toFixed(0);
    if (multiple >= 0.1) return multiple.toFixed(1);
    // Below 0.005 a 2-decimal render says "0.00×", which reads as "you own nothing"
    // for a stack that is real. Show the smallest honest statement instead.
    if (multiple < 0.005) return '<0.01';
    return multiple.toFixed(2);
};

interface UnitBiasCalculatorProps {
    btcAccumulated: number;
}

export const UnitBiasCalculator = ({ btcAccumulated }: UnitBiasCalculatorProps) => {
    const stats = useMemo(() => {
        if (btcAccumulated <= 0) return null;
        const totalSats = Math.floor(btcAccumulated * 100_000_000);
        const multiplesOfFairShare = totalSats / FAIR_SHARE_SATS;
        return { totalSats, multiplesOfFairShare };
    }, [btcAccumulated]);

    if (!stats || stats.totalSats <= 0) return null;

    const shareLabel = `${formatMultiple(stats.multiplesOfFairShare)}×`;

    return (
        <Card celebrated className="p-4 sm:p-6">
            <CardHeader
                icon={<Scale className="w-4 h-4" />}
                title="Unit Bias Calculator"
                className="mb-3"
            />

            <div className="text-center space-y-3">
                <div>
                    <div className="text-2xl sm:text-4xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
                        {stats.totalSats.toLocaleString()}
                    </div>
                    <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">sats accumulated</div>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 sm:p-4 space-y-2">
                    <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300">
                        Your stack of <span className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">{stats.totalSats.toLocaleString()} sats</span> is{' '}
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{shareLabel}</span> an equal split.
                        Divide every bitcoin that will ever exist among everyone alive today and each person gets about{' '}
                        <span className="font-bold text-slate-800 dark:text-white tabular-nums">{FAIR_SHARE_SATS.toLocaleString()} sats</span>.
                    </p>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="text-center">
                            <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white tabular-nums">{shareLabel}</div>
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Multiple of an equal split</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white tabular-nums">{FAIR_SHARE_SATS.toLocaleString()}</div>
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Sats per person, split equally</div>
                        </div>
                    </div>
                </div>

                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-left">
                    How this is worked out: 21,000,000 BTC (the issuance cap, which is not fully mined until around 2140)
                    divided by an assumed world population of 8.1 billion people alive now — a fixed number in this tool,
                    not a live figure — giving {FAIR_SHARE_SATS.toLocaleString()} sats each. So it deliberately compares a
                    future supply against a present headcount. An unknown but substantial number of coins are also lost for
                    good, which would raise the real per-person share. This is an arithmetic curiosity about a fixed supply,
                    not a claim about what anyone is owed or what a sat will be worth.
                </p>
            </div>
        </Card>
    );
};

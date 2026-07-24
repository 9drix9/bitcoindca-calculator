'use client';

import { useMemo } from 'react';
import { Scale } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';

const WORLD_POPULATION = 8_100_000_000;
const MAX_SUPPLY_SATS = 21_000_000 * 100_000_000;
const FAIR_SHARE_SATS = Math.floor(MAX_SUPPLY_SATS / WORLD_POPULATION); // ~259,259 sats

const formatMultiple = (multiple: number): string => {
    if (multiple >= 10) return multiple.toFixed(0);
    if (multiple >= 0.1) return multiple.toFixed(1);
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

    return (
        <Card celebrated className="p-4 sm:p-6">
            <CardHeader
                icon={<Scale className="w-4 h-4" />}
                title="Unit Bias Calculator"
                className="mb-3"
            />

            <div className="text-center space-y-3">
                <div>
                    <div className="text-2xl sm:text-4xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                        {stats.totalSats.toLocaleString()}
                    </div>
                    <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">sats accumulated</div>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 sm:p-4 space-y-2">
                    <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300">
                        Your <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{stats.totalSats.toLocaleString()} sats</span> are{' '}
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatMultiple(stats.multiplesOfFairShare)}&times;</span> the global fair share
                        &mdash; if all 21M BTC were split equally, each person on Earth could own about{' '}
                        <span className="font-bold text-slate-800 dark:text-white tabular-nums">{FAIR_SHARE_SATS.toLocaleString()} sats</span>.
                    </p>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="text-center">
                            <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white tabular-nums">{formatMultiple(stats.multiplesOfFairShare)}&times;</div>
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Fair share multiple</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white tabular-nums">{FAIR_SHARE_SATS.toLocaleString()}</div>
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">Sats per person (fair share)</div>
                        </div>
                    </div>
                </div>

                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    Based on the 21M BTC max supply split across ~8.1B people ({FAIR_SHARE_SATS.toLocaleString()} sats per person)
                </p>
            </div>
        </Card>
    );
};

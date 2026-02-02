'use client';

import { useMemo } from 'react';

const WORLD_POPULATION = 8_000_000_000;
const MAX_SUPPLY_SATS = 21_000_000 * 100_000_000;
const FAIR_SHARE_SATS = Math.floor(MAX_SUPPLY_SATS / WORLD_POPULATION); // ~262,500 sats

interface UnitBiasCalculatorProps {
    btcAccumulated: number;
}

export const UnitBiasCalculator = ({ btcAccumulated }: UnitBiasCalculatorProps) => {
    const stats = useMemo(() => {
        if (btcAccumulated <= 0) return null;
        const totalSats = Math.floor(btcAccumulated * 100_000_000);
        const multiplesOfFairShare = totalSats / FAIR_SHARE_SATS;
        const percentMoreThanFairShare = ((totalSats - FAIR_SHARE_SATS) / FAIR_SHARE_SATS) * 100;
        // What percentage of world population could own this many sats?
        // If everyone had equal share: 21M BTC / 8B = 262,500 sats
        // If you have X sats, you own more than (1 - FAIR_SHARE/X) * 100% of people could ever own
        const percentBetter = Math.max(0, (1 - (1 / multiplesOfFairShare)) * 100);
        return { totalSats, multiplesOfFairShare, percentMoreThanFairShare, percentBetter };
    }, [btcAccumulated]);

    if (!stats || stats.totalSats <= 0) return null;

    return (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 p-4 sm:p-6 rounded-2xl border border-amber-200 dark:border-amber-800/50">
            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                <span className="text-amber-500 text-xl">&#8383;</span>
                Unit Bias Calculator
            </h3>

            <div className="text-center space-y-3">
                <div>
                    <div className="text-2xl sm:text-4xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        {stats.totalSats.toLocaleString()}
                    </div>
                    <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">sats accumulated</div>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3 sm:p-4 space-y-2">
                    <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300">
                        Your <span className="font-bold text-amber-600 dark:text-amber-400">{stats.totalSats.toLocaleString()} sats</span> is more than{' '}
                        <span className="font-bold text-green-600 dark:text-green-400">{stats.percentBetter.toFixed(1)}%</span> of the world could ever own.
                    </p>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="text-center">
                            <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">{stats.multiplesOfFairShare.toFixed(1)}x</div>
                            <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Fair share multiple</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">{FAIR_SHARE_SATS.toLocaleString()}</div>
                            <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Sats per person (fair share)</div>
                        </div>
                    </div>
                </div>

                <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                    Based on 21M BTC max supply and ~8B world population ({FAIR_SHARE_SATS.toLocaleString()} sats per person)
                </p>
            </div>
        </div>
    );
};

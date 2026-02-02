'use client';

import { useState, useEffect } from 'react';
import { getPurchasingPowerData } from '@/app/actions';

interface PurchasingPowerData {
    cpiStart: number;
    cpiNow: number;
    btcPriceStart: number;
    btcPriceNow: number;
}

interface PurchasingPowerWidgetProps {
    initialData: PurchasingPowerData | null;
}

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

export const PurchasingPowerWidget = ({ initialData }: PurchasingPowerWidgetProps) => {
    const [data, setData] = useState<PurchasingPowerData | null>(initialData);

    useEffect(() => {
        let mounted = true;

        const refresh = async () => {
            try {
                const fresh = await getPurchasingPowerData();
                if (mounted && fresh) setData(fresh);
            } catch {
                // keep showing last known data
            }
        };

        refresh();
        const interval = setInterval(refresh, 5 * 60_000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    if (!data) return null;

    const inflationFactor = data.cpiNow / data.cpiStart;
    const fiatNeeded = Math.round(100 * inflationFactor);
    const purchasingPowerLoss = Math.round((1 - 1 / inflationFactor) * 100);
    const btcValue = Math.round(100 * (data.btcPriceNow / data.btcPriceStart));
    const btcGainPct = Math.round(((data.btcPriceNow / data.btcPriceStart) - 1) * 100);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <h4 className="font-semibold text-slate-800 dark:text-white mb-3 text-xs sm:text-sm">
                $100 in 2015
            </h4>

            <div className="grid grid-cols-2 gap-2">
                {/* Fiat side */}
                <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 p-2.5 text-center">
                    <div className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 font-medium mb-0.5">
                        US Dollar
                    </div>
                    <div className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white">
                        ${fiatNeeded}
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                        needed today
                    </div>
                    <div className="text-[10px] sm:text-xs font-medium text-red-500 mt-1">
                        &minus;{purchasingPowerLoss}% purchasing power
                    </div>
                </div>

                {/* BTC side */}
                <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/50 p-2.5 text-center">
                    <div className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 font-medium mb-0.5">
                        Bitcoin
                    </div>
                    <div className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white">
                        ${fmt(btcValue)}
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                        value today
                    </div>
                    <div className="text-[10px] sm:text-xs font-medium text-green-500 mt-1">
                        +{fmt(btcGainPct)}%
                    </div>
                </div>
            </div>

            <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 mt-2.5 leading-relaxed">
                $100 of fiat lost purchasing power to inflation, while $100 of Bitcoin appreciated significantly.
            </p>

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] sm:text-xs text-slate-400">
                    CPI data from FRED
                </span>
            </div>
        </div>
    );
};

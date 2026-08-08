'use client';

import { useState, useEffect, useRef } from 'react';
import { Banknote } from 'lucide-react';
import { getPurchasingPowerData } from '@/app/actions';
import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader } from '@/components/ui/Card';

interface PurchasingPowerData {
    cpiStart: number;
    cpiNow: number;
    btcPriceStart: number;
    btcPriceNow: number;
}

interface PurchasingPowerWidgetProps {
    initialData: PurchasingPowerData | null;
}

const POLL_MS = 5 * 60_000;
const BASE_USD = 100;

export const PurchasingPowerWidget = ({ initialData }: PurchasingPowerWidgetProps) => {
    const { currencyConfig, formatCurrency } = useCurrency();
    const [data, setData] = useState<PurchasingPowerData | null>(initialData);
    const hadInitialData = useRef(initialData !== null);

    useEffect(() => {
        let mounted = true;
        // SSR data is seconds old at hydration; only fetch immediately when it is missing.
        let lastFetched = hadInitialData.current ? Date.now() : 0;

        const refresh = async () => {
            lastFetched = Date.now();
            try {
                const fresh = await getPurchasingPowerData();
                if (mounted && fresh) setData(fresh);
            } catch {
                // keep showing last known data
            }
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

    const inflationFactor = data ? data.cpiNow / data.cpiStart : 0;
    const purchasingPowerLoss = data ? Math.round((1 - 1 / inflationFactor) * 100) : 0;
    const btcGainPct = data ? Math.round(((data.btcPriceNow / data.btcPriceStart) - 1) * 100) : 0;
    const baseDisplay = formatCurrency(BASE_USD);

    return (
        <Card className="p-4">
            <CardHeader
                icon={<Banknote className="w-4 h-4" />}
                title={`${baseDisplay} in 2015`}
                className="mb-3"
            />

            {data ? (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        {/* Fiat side */}
                        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 p-2.5 text-center">
                            <div className="text-[11px] sm:text-xs text-loss font-medium mb-0.5">
                                {currencyConfig.code}
                            </div>
                            <div className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                                {formatCurrency(BASE_USD * inflationFactor)}
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                needed today
                            </div>
                            <div className="text-[11px] sm:text-xs font-medium text-loss mt-1 tabular-nums">
                                &minus;{purchasingPowerLoss}% purchasing power (US CPI)
                            </div>
                        </div>

                        {/* BTC side */}
                        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 p-2.5 text-center">
                            <div className="text-[11px] sm:text-xs text-gain font-medium mb-0.5">
                                Bitcoin
                            </div>
                            <div className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                                {formatCurrency(BASE_USD * (data.btcPriceNow / data.btcPriceStart))}
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                value today
                            </div>
                            <div className="text-[11px] sm:text-xs font-medium text-gain mt-1 tabular-nums">
                                +{btcGainPct.toLocaleString()}%
                            </div>
                        </div>
                    </div>

                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-2.5 leading-relaxed">
                        {baseDisplay} of fiat lost purchasing power to inflation, while {baseDisplay} of Bitcoin appreciated significantly.
                    </p>
                </>
            ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Data unavailable</p>
            )}

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    Inflation based on US CPI (FRED), regardless of display currency
                </span>
            </div>
        </Card>
    );
};

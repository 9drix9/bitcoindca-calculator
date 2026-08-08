'use client';

import { useState, useEffect, useRef } from 'react';
import { PieChart } from 'lucide-react';
import { getBitcoinDominance } from '@/app/actions';
import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader, StatRow, EmptyState } from '@/components/ui/Card';

interface DominanceData {
    dominancePercent: number;
    btcMarketCap: number;
    totalMarketCap: number;
}

interface DominanceWidgetProps {
    initialData: DominanceData | null;
}

const POLL_MS = 5 * 60_000;

export const DominanceWidget = ({ initialData }: DominanceWidgetProps) => {
    const { currencyConfig, convertFromUsd } = useCurrency();
    const [data, setData] = useState<DominanceData | null>(initialData);
    const hadInitialData = useRef(initialData !== null);

    // Market caps arrive in USD; convert before attaching the selected currency's
    // symbol. (Local tiers because context formatCompact has no trillions tier.)
    const formatMarketCap = (usdValue: number): string => {
        const sym = currencyConfig.symbol;
        const value = convertFromUsd(usdValue);
        if (value >= 1e12) return `${sym}${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `${sym}${(value / 1e9).toFixed(1)}B`;
        if (value >= 1e6) return `${sym}${(value / 1e6).toFixed(1)}M`;
        return `${sym}${Math.round(value).toLocaleString()}`;
    };

    useEffect(() => {
        let mounted = true;
        // SSR data is seconds old at hydration; only fetch immediately when it is missing.
        let lastFetched = hadInitialData.current ? Date.now() : 0;

        const refresh = async () => {
            lastFetched = Date.now();
            try {
                const fresh = await getBitcoinDominance();
                if (mounted && fresh) setData(fresh);
            } catch { /* keep last known */ }
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

    return (
        <Card className="p-4">
            <CardHeader icon={<PieChart className="w-4 h-4" />} title="Bitcoin Dominance" className="mb-3" />

            {data ? (
                <>
                    <div className="text-center mb-3">
                        <span className="text-2xl sm:text-3xl font-bold tabular-nums text-amber-500">
                            {data.dominancePercent.toFixed(1)}%
                        </span>
                    </div>

                    <div className="mb-3">
                        <div
                            className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
                            role="meter"
                            aria-label="Bitcoin share of total crypto market capitalization"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(data.dominancePercent * 10) / 10}
                        >
                            <div
                                className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-colors duration-500"
                                style={{ width: `${Math.min(100, data.dominancePercent)}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">0%</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">100%</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <StatRow label="BTC Market Cap" value={formatMarketCap(data.btcMarketCap)} />
                        <StatRow label="Total Crypto" value={formatMarketCap(data.totalMarketCap)} />
                    </div>
                </>
            ) : (
                <EmptyState />
            )}
        </Card>
    );
};

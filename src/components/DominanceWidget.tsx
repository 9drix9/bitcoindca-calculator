'use client';

import { PieChart } from 'lucide-react';
import type { BitcoinDominance } from '@/app/api/live/contract';
import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader, StatRow, EmptyState } from '@/components/ui/Card';
import { LONE_LINK_HIT_AREA, StaleNote } from '@/components/live/cardFooter';
import { useLiveFigure } from '@/components/live/liveSidebar';

interface DominanceWidgetProps {
    initialData: BitcoinDominance | null;
    /** When the server fetched `initialData` (ms epoch). */
    fetchedAt?: number | null;
}

export const DominanceWidget = ({ initialData, fetchedAt }: DominanceWidgetProps) => {
    const { currencyConfig, convertFromUsd, rateNote } = useCurrency();
    const { data, fetchedAt: since, old } = useLiveFigure('dominance', initialData, fetchedAt);

    // Market caps arrive in USD; convert before attaching the selected currency's
    // symbol. Its own tiers, not the context's formatCompact: a market cap wants
    // two decimals on trillions. Each tier starts where the one below would
    // round up into it.
    const formatMarketCap = (usdValue: number): string => {
        const sym = currencyConfig.symbol;
        const value = convertFromUsd(usdValue);
        if (value >= 999.95e9) return `${sym}${(value / 1e12).toFixed(2)}T`;
        if (value >= 999.95e6) return `${sym}${(value / 1e9).toFixed(1)}B`;
        if (value >= 1e6) return `${sym}${(value / 1e6).toFixed(1)}M`;
        return `${sym}${Math.round(value).toLocaleString('en-US')}`;
    };

    return (
        <Card className="p-4">
            <CardHeader icon={<PieChart className="w-4 h-4" />} title="Bitcoin Dominance" className="mb-3" />

            {data ? (
                <>
                    <div className="text-center mb-3">
                        <span className="text-2xl sm:text-3xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                            {data.dominancePercent.toFixed(1)}%
                        </span>
                    </div>

                    <div className="mb-3">
                        <div
                            className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
                            role="meter"
                            aria-label="Bitcoin's share of the total value of all crypto"
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

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                {/* Market caps arrive in USD: say so when the conversion is not at today's rate. */}
                {data && rateNote && <p className="mb-1 leading-relaxed">{rateNote}</p>}
                {old && <StaleNote since={since} />}
                <a
                    href="https://www.coingecko.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${LONE_LINK_HIT_AREA} hover:text-amber-700 dark:hover:text-amber-400 transition-colors`}
                >
                    Data from CoinGecko
                </a>
            </div>
        </Card>
    );
};

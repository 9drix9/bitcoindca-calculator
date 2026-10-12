'use client';

import { Banknote } from 'lucide-react';
import type { PurchasingPower } from '@/app/api/live/contract';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { StaleNote } from '@/components/live/cardFooter';
import { useLiveFigure } from '@/components/live/liveSidebar';

interface PurchasingPowerWidgetProps {
    initialData: PurchasingPower | null;
    /** When the server fetched the bitcoin price in `initialData` (ms epoch). */
    fetchedAt?: number | null;
}

const BASE_USD = 100;

// US dollars whatever the display currency. The inflation figure is US CPI,
// which describes dollars and nothing else, and both baselines are 2015 dollar
// amounts. Converted at today's exchange rate the card said things like
// "€89 in 2015", an amount that was not worth $100 in 2015.
const usd = (value: number, maximumFractionDigits = 0): string =>
    `$${value.toLocaleString('en-US', { maximumFractionDigits })}`;

export const PurchasingPowerWidget = ({ initialData, fetchedAt }: PurchasingPowerWidgetProps) => {
    const { data, fetchedAt: since, old } = useLiveFigure('purchasingPower', initialData, fetchedAt);

    const inflationFactor = data ? data.cpiNow / data.cpiStart : 0;
    const purchasingPowerLoss = data ? Math.round((1 - 1 / inflationFactor) * 100) : 0;
    const btcGainPct = data ? Math.round(((data.btcPriceNow / data.btcPriceStart) - 1) * 100) : 0;
    const baseDisplay = usd(BASE_USD);

    return (
        <Card className="p-4">
            <CardHeader
                icon={<Banknote className="w-4 h-4" />}
                title={`${baseDisplay} since January 2015`}
                className="mb-3"
            />

            {data ? (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        {/* Fiat side */}
                        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 p-2.5 text-center">
                            <div className="text-[11px] sm:text-xs text-loss font-medium mb-0.5">
                                US dollars
                            </div>
                            <div className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                                {usd(BASE_USD * inflationFactor)}
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">
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
                                {usd(BASE_USD * (data.btcPriceNow / data.btcPriceStart))}
                            </div>
                            <div className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">
                                value today
                            </div>
                            <div className="text-[11px] sm:text-xs font-medium text-gain mt-1 tabular-nums">
                                {btcGainPct >= 0 ? '+' : ''}{btcGainPct.toLocaleString('en-US')}%
                            </div>
                        </div>
                    </div>

                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-2.5 leading-relaxed">
                        {baseDisplay} in cash buys less than it used to, because of inflation. The same {baseDisplay} held in Bitcoin went the other way.
                        Both figures depend on the start date, which is fixed at January 2015 here.
                    </p>

                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {old && <StaleNote since={since} />}
                        <p>
                            Inflation: US CPI (FRED series CPIAUCSL), January 2015 to the latest monthly reading.
                            Bitcoin: {usd(data.btcPriceStart, 2)} on Jan 1, 2015 (blockchain.info average market price) to {old ? 'the last price fetched' : 'the live price'}.
                            Always in US dollars, because US inflation says nothing about other currencies.
                        </p>
                    </div>
                </>
            ) : (
                <EmptyState />
            )}
        </Card>
    );
};

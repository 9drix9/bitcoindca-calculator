'use client';

import { useRef, useCallback, useState } from 'react';
import { Download } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { parseUtcDate, formatUtc } from '@/utils/dates';

interface ShareMyStackProps {
    totalInvested: number;
    currentValue: number;
    roi: number;
    btcAccumulated: number;
    unit: 'BTC' | 'SATS';
    startDate: string;
    endDate: string;
}

const formatCardDate = (value: string): string => {
    const ts = parseUtcDate(value);
    return Number.isFinite(ts) ? formatUtc(ts, 'full') : value;
};

export const ShareMyStack = ({
    totalInvested,
    currentValue,
    roi,
    btcAccumulated,
    unit,
    startDate,
    endDate,
}: ShareMyStackProps) => {
    const { formatCurrency, formatBtc, formatSats } = useCurrency();
    const cardRef = useRef<HTMLDivElement>(null);
    const [downloading, setDownloading] = useState(false);

    const profit = currentValue - totalInvested;
    const isProfit = profit >= 0;

    const formattedBtc = unit === 'SATS' ? formatSats(btcAccumulated) : formatBtc(btcAccumulated);

    const handleDownload = useCallback(async () => {
        if (!cardRef.current || downloading) return;
        setDownloading(true);
        try {
            const { toPng } = await import('html-to-image');
            const isDark = document.documentElement.classList.contains('dark');
            const dataUrl = await toPng(cardRef.current, {
                pixelRatio: 2,
                skipFonts: true,
                // Fill the rounded corners with the page surface so pasted PNGs
                // never show transparent/black notches; follows the active theme.
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
            });
            const link = document.createElement('a');
            link.download = `my-btc-stack-${new Date().toISOString().split('T')[0]}.png`;
            link.href = dataUrl;
            link.click();
        } catch {
            // Share card export failed silently
        } finally {
            setDownloading(false);
        }
    }, [downloading]);

    if (totalInvested <= 0) return null;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100">Share My Stack</h3>
                <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors"
                >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    {downloading ? 'Generating...' : 'Download PNG'}
                </button>
            </div>

            {/* Scrollable wrapper for mobile */}
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div
                    ref={cardRef}
                    className="rounded-2xl border border-amber-500/30 dark:border-amber-500/25 bg-gradient-to-br from-amber-50 to-white dark:from-amber-500/[0.07] dark:to-slate-900 text-slate-900 dark:text-white font-sans"
                    style={{ width: 440, minWidth: 440, padding: 28 }}
                >
                    {/* Header */}
                    <div className="flex items-center gap-2.5 mb-6">
                        <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-lg font-bold text-white" aria-hidden="true">
                            &#8383;
                        </div>
                        <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                            My Bitcoin Stack
                        </span>
                    </div>

                    {/* Hero stat */}
                    <div className="mb-5">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Current Value</div>
                        <div className="flex items-baseline gap-2.5">
                            <span className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                                {formatCurrency(currentValue)}
                            </span>
                            <span className={`text-sm font-semibold px-2 py-0.5 rounded-full tabular-nums ${
                                isProfit
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            }`}>
                                {isProfit ? '+' : ''}{roi.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    {/* Supporting rows */}
                    <div className="space-y-2 mb-5">
                        <div className="flex items-baseline justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Total Invested</span>
                            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(totalInvested)}</span>
                        </div>
                        <div className="flex items-baseline justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">{isProfit ? 'Profit' : 'Loss'}</span>
                            <span className={`font-semibold tabular-nums ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {isProfit ? '+' : ''}{formatCurrency(profit)}
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Accumulated</span>
                            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formattedBtc}</span>
                        </div>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3.5 tabular-nums">
                        {formatCardDate(startDate)} &mdash; {formatCardDate(endDate)}
                    </div>

                    <div className="border-t border-amber-500/20 dark:border-slate-700 pt-2.5 flex justify-between items-center">
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">btcdollarcostaverage.com</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">@9drix9</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

'use client';

import { useRef, useCallback, useState } from 'react';
import { Download } from 'lucide-react';

interface ShareMyStackProps {
    totalInvested: number;
    currentValue: number;
    roi: number;
    btcAccumulated: number;
    unit: 'BTC' | 'SATS';
    startDate: string;
    endDate: string;
}

export const ShareMyStack = ({
    totalInvested,
    currentValue,
    roi,
    btcAccumulated,
    unit,
    startDate,
    endDate,
}: ShareMyStackProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [downloading, setDownloading] = useState(false);

    const profit = currentValue - totalInvested;
    const isProfit = profit >= 0;

    const formattedBtc = unit === 'SATS'
        ? `${Math.floor(btcAccumulated * 100_000_000).toLocaleString()} sats`
        : `${btcAccumulated.toFixed(8)} BTC`;

    const handleDownload = useCallback(async () => {
        if (!cardRef.current || downloading) return;
        setDownloading(true);
        try {
            const { toPng } = await import('html-to-image');
            const dataUrl = await toPng(cardRef.current, {
                pixelRatio: 2,
                skipFonts: true,
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
                    <Download className="w-3.5 h-3.5" />
                    {downloading ? 'Generating...' : 'Download PNG'}
                </button>
            </div>

            {/* Scrollable wrapper for mobile */}
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div
                    ref={cardRef}
                    className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-slate-50 rounded-2xl font-sans border border-slate-200 dark:border-slate-700"
                    style={{ width: 440, minWidth: 440, padding: 28 }}
                >
                    <div className="flex items-center gap-2.5 mb-5">
                        <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-lg font-bold text-white">
                            ₿
                        </div>
                        <span className="text-base font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
                            My Bitcoin Stack
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5 mb-4">
                        <div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 uppercase tracking-wide">Total Invested</div>
                            <div className="text-lg font-bold">${totalInvested.toLocaleString()}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 uppercase tracking-wide">Current Value</div>
                            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">${currentValue.toLocaleString()}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 uppercase tracking-wide">ROI</div>
                            <div className={`text-lg font-bold ${isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                {isProfit ? '+' : ''}{roi.toFixed(1)}%
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 uppercase tracking-wide">Accumulated</div>
                            <div className="text-sm font-bold">{formattedBtc}</div>
                        </div>
                    </div>

                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-3.5">
                        {startDate} &mdash; {endDate}
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5 flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">btcdollarcostaverage.com</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">@9drix9</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

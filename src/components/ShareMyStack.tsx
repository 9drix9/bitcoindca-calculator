'use client';

import { useRef, useCallback, useState } from 'react';
import { Download } from 'lucide-react';
import { toPng } from 'html-to-image';

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
            const dataUrl = await toPng(cardRef.current, {
                pixelRatio: 2,
                skipFonts: true,
            });
            const link = document.createElement('a');
            link.download = `my-btc-stack-${new Date().toISOString().split('T')[0]}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Share card export failed:', err);
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
                    style={{
                        width: 440,
                        minWidth: 440,
                        padding: 28,
                        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                        borderRadius: 16,
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        color: '#f8fafc',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: '#f59e0b',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, fontWeight: 'bold', color: 'white',
                        }}>
                            ₿
                        </div>
                        <span style={{ fontSize: 16, fontWeight: 700, background: 'linear-gradient(90deg, #f59e0b, #ea580c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            My Bitcoin Stack
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                        <div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Invested</div>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>${totalInvested.toLocaleString()}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Value</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>${currentValue.toLocaleString()}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ROI</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: isProfit ? '#22c55e' : '#ef4444' }}>
                                {isProfit ? '+' : ''}{roi.toFixed(1)}%
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Accumulated</div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{formattedBtc}</div>
                        </div>
                    </div>

                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 14 }}>
                        {startDate} &mdash; {endDate}
                    </div>

                    <div style={{ borderTop: '1px solid #334155', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#64748b' }}>btcdollarcostaverage.com</span>
                        <span style={{ fontSize: 10, color: '#64748b' }}>@9drix9</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

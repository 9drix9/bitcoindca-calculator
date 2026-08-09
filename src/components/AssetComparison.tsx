'use client';

import { useMemo } from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import { AssetDcaResult } from '@/types';
import { useCurrency } from '@/context/CurrencyContext';
import { formatUtc } from '@/utils/dates';
import { Card, EmptyState } from '@/components/ui/Card';
import { useIsDark } from '@/hooks/useIsDark';
import clsx from 'clsx';

interface AssetComparisonProps {
    btcResult: AssetDcaResult;
    sp500Result: AssetDcaResult | null;
    goldResult: AssetDcaResult | null;
    loading: boolean;
}

type SeriesKey = 'btc' | 'sp500' | 'gold';

// Series colors validated (CVD-safe, ≥3:1 on the dark surface; light-mode gold
// carries a legend + the summary cards as relief).
const SERIES: Record<SeriesKey, { label: string; light: string; dark: string }> = {
    btc: { label: 'Bitcoin', light: '#d97706', dark: '#d97706' },
    sp500: { label: 'S&P 500', light: '#2a78d6', dark: '#3987e5' },
    gold: { label: 'Gold', light: '#eda100', dark: '#c98500' },
};

const MAX_POINTS_PER_SERIES = 200;

interface ChartRow {
    ts: number;
    btc?: number;
    sp500?: number;
    gold?: number;
}

const cardStyles = {
    btc: {
        bg: 'bg-amber-50 dark:bg-amber-950/20',
        border: 'border-amber-200 dark:border-amber-800/50',
        label: 'text-amber-700 dark:text-amber-400',
    },
    sp500: {
        bg: 'bg-blue-50 dark:bg-blue-950/20',
        border: 'border-blue-200 dark:border-blue-800/50',
        label: 'text-blue-700 dark:text-blue-400',
    },
    gold: {
        bg: 'bg-yellow-50 dark:bg-yellow-950/20',
        border: 'border-yellow-200 dark:border-yellow-800/50',
        label: 'text-yellow-700 dark:text-yellow-400',
    },
};

const AssetCard = ({
    result,
    style,
    unavailable,
    formatCurrency,
    formatCompact,
}: {
    result: AssetDcaResult | null;
    style: typeof cardStyles.btc;
    unavailable?: boolean;
    formatCurrency: (value: number) => string;
    formatCompact: (value: number) => string;
}) => {
    if (unavailable || !result) {
        return (
            <div className={clsx('p-3 sm:p-4 rounded-xl border', style.bg, style.border, 'opacity-50')}>
                <div className={clsx('text-xs sm:text-sm font-medium mb-1', style.label)}>
                    {result?.label ?? 'Asset'}
                </div>
                <EmptyState />
            </div>
        );
    }

    const isProfit = result.profit >= 0;

    return (
        <div className={clsx('p-3 sm:p-4 rounded-xl border', style.bg, style.border)}>
            <div className={clsx('text-xs sm:text-sm font-medium mb-1', style.label)}>{result.label}</div>
            {/* Mobile: compact format, Desktop: full format */}
            <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
                <span className="sm:hidden">{formatCompact(result.currentValue)}</span>
                <span className="hidden sm:inline">{formatCurrency(result.currentValue)}</span>
            </div>
            <div className={clsx('text-xs sm:text-sm mt-0.5 tabular-nums', isProfit ? 'text-gain' : 'text-loss')}>
                {/* Mobile: just ROI %, Desktop: profit amount + ROI % */}
                <span className="sm:hidden">{isProfit ? '+' : ''}{result.roi.toFixed(1)}%</span>
                <span className="hidden sm:inline">{isProfit ? '+' : '-'}{formatCurrency(Math.abs(result.profit))} ({result.roi.toFixed(1)}%)</span>
            </div>
        </div>
    );
};

interface TooltipPayloadEntry {
    dataKey?: string | number;
    name?: string | number;
    value?: number | string;
    color?: string;
}

function GrowthTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
    label?: string | number;
}) {
    const { formatCurrency } = useCurrency();
    if (!active || !payload || payload.length === 0) return null;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-1.5 font-semibold text-slate-800 dark:text-slate-100">
                {typeof label === 'number' ? formatUtc(label, 'full') : label}
            </p>
            <div className="space-y-1">
                {payload.map((entry) => (
                    typeof entry.value === 'number' && (
                        <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                <span
                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: entry.color }}
                                    aria-hidden="true"
                                />
                                {entry.name}
                            </span>
                            <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                {formatCurrency(entry.value)}
                            </span>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
}

export const AssetComparison = ({ btcResult, sp500Result, goldResult, loading }: AssetComparisonProps) => {
    const { formatCurrency, formatCompact, convertFromUsd, currencyConfig } = useCurrency();
    const isDark = useIsDark();

    // Merge the per-asset breakdown series onto a shared time axis, downsampled
    // to ≤200 points. A single-series chart adds nothing over the main chart, so
    // the comparison chart only renders when at least two series are present.
    const chartData = useMemo(() => {
        const active: { key: SeriesKey; result: AssetDcaResult }[] = [];
        if (btcResult?.breakdown?.length) active.push({ key: 'btc', result: btcResult });
        if (sp500Result?.breakdown?.length) active.push({ key: 'sp500', result: sp500Result });
        if (goldResult?.breakdown?.length) active.push({ key: 'gold', result: goldResult });
        if (active.length < 2) return null;

        const byTs = new Map<number, ChartRow>();
        for (const { key, result } of active) {
            for (const point of result.breakdown) {
                const ts = new Date(point.date).getTime();
                if (!Number.isFinite(ts)) continue;
                const row = byTs.get(ts) ?? { ts };
                row[key] = point.portfolioValue;
                byTs.set(ts, row);
            }
        }

        const sorted = [...byTs.values()].sort((a, b) => a.ts - b.ts);
        if (sorted.length < 2) return null;

        const step = Math.ceil(sorted.length / MAX_POINTS_PER_SERIES);
        const rows = step > 1
            ? sorted.filter((_, i) => i % step === 0 || i === sorted.length - 1)
            : sorted;

        const spanDays = (rows[rows.length - 1].ts - rows[0].ts) / 86_400_000;
        return { rows, keys: active.map(s => s.key), spanDays };
    }, [btcResult, sp500Result, goldResult]);

    if (loading) {
        return (
            <Card className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-800 dark:text-slate-100">BTC vs Other Assets (DCA)</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="h-20 sm:h-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                </div>
            </Card>
        );
    }

    const gridStroke = isDark ? '#1e293b' : '#f1f5f9';
    // Theme-flipped: #64748b is 4.76:1 on the light card but only 3.75:1 on the
    // dark one, so a single fixed value cannot clear AA in both.
    const axisText = isDark ? '#94a3b8' : '#64748b';
    const xTickStyle = chartData && chartData.spanDays > 550 ? 'shortMonthYear' : 'monthDay';

    const formatAxisValue = (usd: number) => {
        const v = convertFromUsd(usd);
        const sym = currencyConfig.symbol;
        const abs = Math.abs(v);
        if (abs >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1)}M`;
        if (abs >= 1_000) return `${sym}${(v / 1_000).toFixed(0)}k`;
        return `${sym}${Math.round(v)}`;
    };

    return (
        <Card className="p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-800 dark:text-slate-100">BTC vs Other Assets (DCA)</h3>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <AssetCard result={btcResult} style={cardStyles.btc} formatCurrency={formatCurrency} formatCompact={formatCompact} />
                <AssetCard result={sp500Result} style={cardStyles.sp500} unavailable={!sp500Result} formatCurrency={formatCurrency} formatCompact={formatCompact} />
                <AssetCard result={goldResult} style={cardStyles.gold} unavailable={!goldResult} formatCurrency={formatCurrency} formatCompact={formatCompact} />
            </div>

            {chartData && (
                <div className="mt-4 sm:mt-5">
                    <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                        Portfolio value over time
                    </div>
                    <div className="h-[180px] tabular-nums">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData.rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke={gridStroke} />
                                <XAxis
                                    dataKey="ts"
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                    tickFormatter={(ts: number) => formatUtc(ts, xTickStyle)}
                                    tick={{ fontSize: 11, fill: axisText }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={48}
                                />
                                <YAxis
                                    width={56}
                                    tickFormatter={formatAxisValue}
                                    tick={{ fontSize: 11, fill: axisText }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip content={<GrowthTooltip />} />
                                <Legend
                                    verticalAlign="top"
                                    height={26}
                                    iconType="plainline"
                                    iconSize={12}
                                    wrapperStyle={{ fontSize: 11 }}
                                    formatter={(value: string) => (
                                        <span className="text-slate-500 dark:text-slate-400">{value}</span>
                                    )}
                                />
                                {chartData.keys.map((key) => (
                                    <Line
                                        key={key}
                                        dataKey={key}
                                        name={SERIES[key].label}
                                        stroke={isDark ? SERIES[key].dark : SERIES[key].light}
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={false}
                                        connectNulls
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </Card>
    );
};

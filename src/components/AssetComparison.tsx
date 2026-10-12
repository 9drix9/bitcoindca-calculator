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
    /** True when the user set a starting stack the BTC row deliberately omits. */
    excludesStartingStack?: boolean;
    /**
     * True when the plan's end date is in the future and the three results were
     * cut off at today. This panel compares what happened; buys that have not
     * been made yet would only be the last known price repeated for each asset.
     */
    stopsAtToday?: boolean;
}

type SeriesKey = 'btc' | 'sp500' | 'gold';

// Line colours, with what was measured (Machado 2009 colour-vision simulation,
// CIE76 difference in Lab) so the next change can be checked against it:
//
//  - Dark gold is pale (#fcd34d) on purpose. It separates from Bitcoin's
//    #d97706 by lightness: 24.5 under deuteranopia, 31.7 under protanopia,
//    41.0 with typical vision, and 12.4:1 on the dark card. An amber gold
//    (#c98500 measured 0.6) is the same colour as Bitcoin's line to a reader
//    who cannot tell red from green.
//  - Light gold (#eda100) is 14.2 from Bitcoin under deuteranopia and only
//    2.2:1 against the white card. A darker gold would clear 3:1 there but sit
//    closer to Bitcoin's amber, so the legend, the tooltip and the three cards
//    above the chart name each asset in words.
//  - Blue is at least 111 from either amber under every simulation.
//
// No dashes: on this site a dashed line means a reference or a model (total
// invested, average cost, the power law), and gold here is an observed series.
const SERIES: Record<SeriesKey, { label: string; light: string; dark: string }> = {
    btc: { label: 'Bitcoin', light: '#d97706', dark: '#d97706' },
    sp500: { label: 'S&P 500', light: '#2a78d6', dark: '#3987e5' },
    gold: { label: 'Gold', light: '#eda100', dark: '#fcd34d' },
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
    name,
    style,
    unavailable,
    formatCurrency,
    formatCompact,
}: {
    result: AssetDcaResult | null;
    /** What the card is for, shown when there is no result to take the name from. */
    name: string;
    style: typeof cardStyles.btc;
    unavailable?: boolean;
    formatCurrency: (value: number) => string;
    formatCompact: (value: number) => string;
}) => {
    if (unavailable || !result) {
        return (
            // No opacity on the card: the name and "Data unavailable" are the
            // only words in it, and at half strength neither met contrast.
            <div className={clsx('p-3 sm:p-4 rounded-xl border', style.bg, style.border)}>
                <div className={clsx('text-xs sm:text-sm font-medium mb-1', style.label)}>
                    {result?.label ?? name}
                </div>
                <EmptyState />
            </div>
        );
    }

    const isProfit = result.profit >= 0;

    return (
        <div className={clsx('@container p-3 sm:p-4 rounded-xl border', style.bg, style.border)}>
            <div className={clsx('text-xs sm:text-sm font-medium mb-1', style.label)}>{result.label}</div>
            {/* Mobile: compact format, Desktop: full format. A money figure is never
                cut off, so it does not wrap and is sized from the card's own width:
                in Inter bold "A$888.8K" is 5.0em wide and "A$12,597,490" 6.8em. A
                wider figure runs into the card's padding instead of losing digits. */}
            <div className="text-[clamp(0.75rem,20cqw,1.125rem)] sm:text-[clamp(1rem,14cqw,1.5rem)] font-bold text-slate-900 dark:text-white whitespace-nowrap">
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

export const AssetComparison = ({ btcResult, sp500Result, goldResult, loading, excludesStartingStack, stopsAtToday }: AssetComparisonProps) => {
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
                <h3 className="text-base sm:text-lg font-semibold mb-1 text-slate-800 dark:text-slate-100">BTC vs Other Assets (DCA)</h3>
                {/* Sized like the loaded card (two lines of note on a phone, the
                    three tiles, the chart). This state comes back on every change
                    of dates, and a shorter placeholder would move everything under
                    it twice per edit. */}
                <p className="mb-3 sm:mb-4 min-h-8 sm:min-h-0 text-xs text-slate-500 dark:text-slate-400" role="status">
                    Loading the S&amp;P 500 and gold prices for these dates…
                </p>
                <div className="grid grid-cols-3 gap-2 sm:gap-4" aria-hidden="true">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="h-[108px] rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                </div>
                <div className="mt-4 sm:mt-5 h-[204px] rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" aria-hidden="true" />
            </Card>
        );
    }

    const gridStroke = isDark ? '#1e293b' : '#f1f5f9';
    // Theme-flipped: #64748b is 4.76:1 on the light card but only 3.75:1 on the
    // dark one, so a single fixed value cannot clear AA in both.
    const axisText = isDark ? '#94a3b8' : '#64748b';
    const xTickStyle = chartData && chartData.spanDays > 550 ? 'shortMonthYear' : 'monthDay';

    // The chart is one image to a screen reader; this says what it ends on.
    const chartAriaLabel = `Portfolio value over time. At the end: ${[btcResult, sp500Result, goldResult]
        .filter((result): result is AssetDcaResult => !!result?.breakdown?.length)
        .map((result) => `${result.label} ${formatCurrency(result.currentValue)}`)
        .join(', ')}.`;

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
            <h3 className="text-base sm:text-lg font-semibold mb-1 text-slate-800 dark:text-slate-100">BTC vs Other Assets (DCA)</h3>
            {/* One valuation instant for every asset: the headline card values BTC
                at today's spot, but the comparators end at the window's last close —
                mixing the two let post-window appreciation decide the comparison. */}
            <p className="mb-3 sm:mb-4 text-xs text-slate-500 dark:text-slate-400">
                Same plan, same dates, each asset valued at its last price in the range.
                {stopsAtToday ? ' Your plan runs past today, so this counts the purchases made so far.' : ''}
                {excludesStartingStack ? ' Your starting stack is left out — this compares the buying schedule only.' : ''}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <AssetCard result={btcResult} name={SERIES.btc.label} style={cardStyles.btc} formatCurrency={formatCurrency} formatCompact={formatCompact} />
                <AssetCard result={sp500Result} name={SERIES.sp500.label} style={cardStyles.sp500} unavailable={!sp500Result} formatCurrency={formatCurrency} formatCompact={formatCompact} />
                <AssetCard result={goldResult} name={SERIES.gold.label} style={cardStyles.gold} unavailable={!goldResult} formatCurrency={formatCurrency} formatCompact={formatCompact} />
            </div>

            {chartData && (
                <div className="mt-4 sm:mt-5">
                    <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                        Portfolio value over time
                    </div>
                    {/* role="img" and no accessibilityLayer, like the main chart: Recharts'
                        own keyboard layer is an unnamed focus stop. The legend text is
                        coloured here because a formatter that returns an element ends up
                        in the icon's label as "[object Object]". */}
                    <div
                        className="h-[180px] tabular-nums [&_.recharts-legend-item-text]:text-slate-500! dark:[&_.recharts-legend-item-text]:text-slate-400!"
                        role="img"
                        aria-label={chartAriaLabel}
                    >
                        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 358, height: 220 }}>
                            <LineChart data={chartData.rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
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
                                <Legend verticalAlign="top" height={26} iconType="plainline" iconSize={12} wrapperStyle={{ fontSize: 11 }} />
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

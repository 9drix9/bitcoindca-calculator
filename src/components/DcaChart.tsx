'use client';

import { useMemo, useRef, useCallback, useEffect, useId, useState, useSyncExternalStore, memo } from 'react';
import {
    ResponsiveContainer,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    Line,
    ComposedChart,
    Brush,
} from 'recharts';
import { DcaBreakdownItem, HistoricalEvent } from '@/types';
import { Camera } from 'lucide-react';
import clsx from 'clsx';
import { useCurrency, Denomination } from '@/context/CurrencyContext';
import { formatUtc } from '@/utils/dates';
import { Card } from '@/components/ui/Card';
import { useIsDark } from '@/hooks/useIsDark';

type ChartTab = 'portfolio' | 'price';

interface DcaChartProps {
    data: DcaBreakdownItem[];
    /** Overrides the site-wide denomination preference when supplied. */
    unit?: Denomination;
    /**
     * Accepted for backward compatibility with the parent call site but intentionally
     * unused: the old M2 overlay min-max-normalized money supply onto the portfolio's
     * scale, which invented a visual correlation that is not in the data (removed per
     * design spec §2).
     */
    m2Data?: [number, number][] | null;
}

const HALVING_DATES: { date: string; label: string }[] = [
    { date: '2012-11-28', label: 'Halving 1' },
    { date: '2016-07-09', label: 'Halving 2' },
    { date: '2020-05-11', label: 'Halving 3' },
    { date: '2024-04-19', label: 'Halving 4' },
    { date: '2028-04-17', label: 'Halving 5 (est.)' },
];

const HISTORICAL_EVENTS: HistoricalEvent[] = [
    { date: '2014-02-24', label: 'Mt. Gox', color: '#ef4444' },
    { date: '2017-09-04', label: 'China Ban', color: '#f97316' },
    { date: '2020-03-12', label: 'COVID', color: '#ef4444' },
    { date: '2021-05-19', label: 'China 2', color: '#f97316' },
    { date: '2021-09-07', label: 'El Salv.', color: '#22c55e' },
    { date: '2024-01-10', label: 'ETF', color: '#3b82f6' },
    { date: '2024-12-05', label: '$100k', color: '#f59e0b' },
];

const GENESIS_DATE = new Date('2009-01-03T00:00:00Z');

const computePowerLawPrice = (dateStr: string): number | null => {
    const date = new Date(dateStr);
    const daysSinceGenesis = (date.getTime() - GENESIS_DATE.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceGenesis <= 0) return null;
    const logDays = Math.log10(daysSinceGenesis);
    return Math.pow(10, 5.82 * logDays - 17.01);
};

// Minimum gap in days between visible events to avoid overlap
const MIN_EVENT_GAP_DAYS = 365;

// Downsampling: applied at all viewport sizes above this length (min/max per bucket
// keeps every peak and trough, unlike naive nth-point sampling).
const DOWNSAMPLE_THRESHOLD = 500;
const DOWNSAMPLE_TARGET = 400;
const BRUSH_MIN_POINTS = 90;
const BUY_DOT_MAX_POINTS = 60;

/**
 * Min-max-per-bucket downsampling. For each bucket keep the min and max points of
 * BOTH portfolioValue and price (in time order), so peaks survive on either tab.
 * Up to 4 kept indices per bucket → ~DOWNSAMPLE_TARGET points out.
 */
function downsampleMinMax(data: DcaBreakdownItem[]): DcaBreakdownItem[] {
    if (data.length <= DOWNSAMPLE_THRESHOLD) return data;
    const buckets = Math.max(1, Math.floor(DOWNSAMPLE_TARGET / 4));
    const bucketSize = data.length / buckets;
    const keep = new Set<number>([0, data.length - 1]);
    for (let b = 0; b < buckets; b++) {
        const start = Math.floor(b * bucketSize);
        const end = Math.min(data.length, Math.max(start + 1, Math.floor((b + 1) * bucketSize)));
        let minPvIdx = start;
        let maxPvIdx = start;
        let minPrIdx = start;
        let maxPrIdx = start;
        for (let i = start; i < end; i++) {
            const d = data[i];
            if (d.portfolioValue < data[minPvIdx].portfolioValue) minPvIdx = i;
            if (d.portfolioValue > data[maxPvIdx].portfolioValue) maxPvIdx = i;
            if (d.price < data[minPrIdx].price) minPrIdx = i;
            if (d.price > data[maxPrIdx].price) maxPrIdx = i;
        }
        keep.add(minPvIdx);
        keep.add(maxPvIdx);
        keep.add(minPrIdx);
        keep.add(maxPrIdx);
    }
    return [...keep].sort((a, b) => a - b).map((i) => data[i]);
}

interface ChartPoint {
    date: string;
    invested: number;
    accumulated: number;
    totalAccumulated: number;
    // Nullable: values ≤ 0 are clamped out in log mode (log(0) is undefined).
    price: number | null;
    totalInvested: number | null;
    portfolioValue: number | null;
    powerLaw: number | null;
}

function snapToChartDate(points: ChartPoint[], targetTs: number): string {
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(new Date(points[i].date).getTime() - targetTs);
        if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
        }
    }
    return points[closestIdx].date;
}

// ── Viewport: the brush is sized for fingers below 640px, for pixels above ────
const resizeSubscribe = (onChange: () => void) => {
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
};
const getIsWide = () => window.innerWidth >= 640;
const getIsWideServer = () => false;
const useIsWideViewport = () => useSyncExternalStore(resizeSubscribe, getIsWide, getIsWideServer);

// ── Text alternative ──────────────────────────────────────────────────────────

/** Rows in the screen-reader table. One row per day would be unnavigable. */
const TEXT_TABLE_ROWS = 18;

/** Evenly spaced sample that always keeps the first and last element. */
function sampleEvenly<T>(rows: readonly T[], target: number): T[] {
    if (rows.length <= target) return [...rows];
    const step = (rows.length - 1) / (target - 1);
    const out: T[] = [];
    for (let i = 0; i < target; i++) out.push(rows[Math.round(i * step)]);
    return out;
}

/**
 * Largest peak-to-trough decline in a series, as a positive percentage.
 * Returns null when there is nothing meaningful to measure.
 */
function maxDrawdownPct(values: readonly number[]): number | null {
    let peak = 0;
    let worst = 0;
    let seen = false;
    for (const v of values) {
        if (!Number.isFinite(v) || v <= 0) continue;
        seen = true;
        if (v > peak) peak = v;
        else if (peak > 0) worst = Math.max(worst, (peak - v) / peak);
    }
    return seen ? worst * 100 : null;
}

const signedPct = (pct: number): string => `${pct >= 0 ? 'up ' : 'down '}${Math.abs(pct).toFixed(1)}%`;

// ── Custom tooltip (styled like the site cards, theme-aware via dark: classes) ─
interface SeriesColors {
    portfolio: string;
    price: string;
    powerLaw: string;
    neutral: string;
}

interface TooltipPayloadEntry {
    dataKey?: string | number;
    value?: number | string;
    payload?: ChartPoint;
}

function TooltipRow({
    color,
    label,
    value,
    valueClassName,
}: {
    color?: string;
    label: string;
    value: string;
    valueClassName?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                {color && (
                    <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                    />
                )}
                {label}
            </span>
            <span className={clsx('font-medium tabular-nums text-slate-800 dark:text-slate-100', valueClassName)}>
                {value}
            </span>
        </div>
    );
}

function ChartTooltip({
    active,
    payload,
    label,
    tab,
    unit,
    colors,
}: {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
    label?: string | number;
    tab: ChartTab;
    unit: Denomination;
    colors: SeriesColors;
}) {
    const { formatCurrency, formatBtc, formatSats } = useCurrency();
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0]?.payload;
    if (!point) return null;

    const pv = point.portfolioValue;
    const ti = point.totalInvested;
    const pl = typeof pv === 'number' && typeof ti === 'number' ? pv - ti : null;
    const plPct = pl !== null && typeof ti === 'number' && ti > 0 ? (pl / ti) * 100 : null;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-1.5 font-semibold text-slate-800 dark:text-slate-100">
                {formatUtc(String(label ?? point.date), 'full')}
            </p>
            <div className="space-y-1">
                {tab === 'portfolio' ? (
                    <>
                        {typeof pv === 'number' && (
                            <TooltipRow color={colors.portfolio} label="Portfolio Value" value={formatCurrency(pv)} />
                        )}
                        {typeof ti === 'number' && (
                            <TooltipRow color={colors.neutral} label="Total Invested" value={formatCurrency(ti)} />
                        )}
                        {pl !== null && (
                            <TooltipRow
                                label="Profit / Loss"
                                value={`${pl >= 0 ? '+' : ''}${formatCurrency(pl)}${
                                    plPct !== null ? ` (${plPct >= 0 ? '+' : ''}${plPct.toFixed(1)}%)` : ''
                                }`}
                                valueClassName={
                                    pl >= 0
                                        ? 'text-gain'
                                        : 'text-loss'
                                }
                            />
                        )}
                    </>
                ) : (
                    <>
                        {typeof point.price === 'number' && (
                            <TooltipRow color={colors.price} label="BTC Price" value={formatCurrency(point.price)} />
                        )}
                        {typeof point.powerLaw === 'number' && (
                            <TooltipRow color={colors.powerLaw} label="Power Law" value={formatCurrency(point.powerLaw)} />
                        )}
                        <TooltipRow
                            label={unit === 'SATS' ? 'Sats Held' : 'BTC Held'}
                            value={unit === 'SATS' ? formatSats(point.totalAccumulated) : formatBtc(point.totalAccumulated)}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

// min-h-8 + padding: the checkbox alone is a 16px target, so the label carries the
// tap area (clicking a label toggles its input) and clears the 24px minimum on touch.
const toggleLabelClass =
    'flex min-h-8 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap py-1 pr-1 text-[11px] text-slate-500 dark:text-slate-400';

export const DcaChart = memo(function DcaChart({ data, unit }: DcaChartProps) {
    const { currencyConfig, convertFromUsd, denomination, formatCurrency, formatBtc, formatSats } = useCurrency();
    // Falls back to the site-wide preference when the call site doesn't pin a unit.
    const activeUnit: Denomination = unit ?? denomination;
    const chartRef = useRef<HTMLDivElement>(null);
    const plotRef = useRef<HTMLDivElement>(null);
    // This component renders more than once per page, so the wiring ids must be unique.
    const uid = useId();
    const captionId = `${uid}-caption`;
    const summaryId = `${uid}-summary`;
    const [tab, setTab] = useState<ChartTab>('portfolio');
    const [showPowerLaw, setShowPowerLaw] = useState(false);
    const [showEvents, setShowEvents] = useState(false);
    const [isLog, setIsLog] = useState(false);
    const isDark = useIsDark();
    const isWide = useIsWideViewport();

    const colors: SeriesColors & { grid: string; axis: string; halving: string; cursor: string } = {
        portfolio: '#d97706',
        price: '#059669',
        powerLaw: isDark ? '#8b5cf6' : '#7c3aed',
        neutral: isDark ? '#64748b' : '#94a3b8',
        grid: isDark ? '#1e293b' : '#f1f5f9',
        axis: '#64748b',
        halving: '#a855f7',
        cursor: isDark ? '#334155' : '#cbd5e1',
    };

    // Compact currency axis ticks — always converted from USD before formatting.
    const formatAxisTick = useCallback(
        (usd: number): string => {
            const v = convertFromUsd(usd);
            const sym = currencyConfig.symbol;
            const sign = v < 0 ? '-' : '';
            const abs = Math.abs(v);
            if (abs >= 1_000_000_000) return `${sign}${sym}${(abs / 1_000_000_000).toFixed(1)}B`;
            if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
            if (abs >= 10_000) return `${sign}${sym}${(abs / 1_000).toFixed(0)}k`;
            if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}k`;
            if (abs >= 1) return `${sign}${sym}${abs.toFixed(0)}`;
            return `${sign}${sym}${abs.toFixed(2)}`;
        },
        [convertFromUsd, currencyConfig.symbol],
    );

    const sampled = useMemo(() => {
        if (!data || data.length === 0) return [];
        return downsampleMinMax(data);
    }, [data]);

    const chartData = useMemo<ChartPoint[]>(() => {
        const clamp = (v: number): number | null => (isLog && v <= 0 ? null : v);
        return sampled.map((item) => {
            const pl = showPowerLaw ? computePowerLawPrice(item.date) : null;
            return {
                date: item.date,
                invested: item.invested,
                accumulated: item.accumulated,
                totalAccumulated: item.totalAccumulated,
                price: clamp(item.price),
                totalInvested: clamp(item.totalInvested),
                portfolioValue: clamp(item.portfolioValue),
                powerLaw: pl === null ? null : clamp(pl),
            };
        });
    }, [sampled, showPowerLaw, isLog]);

    // Average cost basis = last cumulative invested / last cumulative accumulated.
    const avgCostUsd = useMemo(() => {
        if (!data || data.length === 0) return null;
        const last = data[data.length - 1];
        return last.totalAccumulated > 0 ? last.totalInvested / last.totalAccumulated : null;
    }, [data]);

    // Snap halving/event lines to dates that exist in the (downsampled) chart data.
    const halvingLines = useMemo(() => {
        if (chartData.length < 2) return [];
        const firstTs = new Date(chartData[0].date).getTime();
        const lastTs = new Date(chartData[chartData.length - 1].date).getTime();
        return HALVING_DATES.filter((h) => {
            const t = new Date(h.date).getTime();
            return t >= firstTs && t <= lastTs;
        }).map((h) => ({ ...h, snappedDate: snapToChartDate(chartData, new Date(h.date).getTime()) }));
    }, [chartData]);

    const eventLines = useMemo(() => {
        if (!showEvents || chartData.length < 2) return [];
        const firstTs = new Date(chartData[0].date).getTime();
        const lastTs = new Date(chartData[chartData.length - 1].date).getTime();

        const candidates = HISTORICAL_EVENTS.filter((e) => {
            const t = new Date(e.date).getTime();
            return t >= firstTs && t <= lastTs;
        }).map((e) => {
            const ts = new Date(e.date).getTime();
            return { ...e, ts, snappedDate: snapToChartDate(chartData, ts) };
        });

        // Filter out events too close together to be readable on long ranges
        const rangeYears = (lastTs - firstTs) / (365.25 * 24 * 60 * 60 * 1000);
        if (rangeYears > 5 && candidates.length > 3) {
            const gapMs = MIN_EVENT_GAP_DAYS * 24 * 60 * 60 * 1000;
            const filtered: typeof candidates = [];
            let lastKept = -Infinity;
            for (const ev of candidates) {
                if (ev.ts - lastKept >= gapMs) {
                    filtered.push(ev);
                    lastKept = ev.ts;
                }
            }
            return filtered;
        }
        return candidates;
    }, [chartData, showEvents]);

    // ── Text alternative: caption, prose summary, and a downsampled data table ──
    // A Recharts SVG carries nothing an assistive technology can read, so the
    // figure is labelled and described in text and the series is repeated as a
    // small table. The chart itself is collapsed to a single node (see role="img"
    // below) so the axis ticks are not read out on top of the table.

    const textRows = useMemo(() => sampleEvenly(data ?? [], TEXT_TABLE_ROWS), [data]);

    const chartCaption = useMemo(() => {
        if (!data || data.length === 0) return 'DCA performance chart';
        const start = formatUtc(data[0].date, 'full');
        const end = formatUtc(data[data.length - 1].date, 'full');
        return tab === 'portfolio'
            ? `Portfolio value versus total invested, ${start} to ${end}`
            : `Bitcoin price versus average cost, ${start} to ${end}`;
    }, [data, tab]);

    const chartSummary = useMemo(() => {
        if (!data || data.length === 0) return '';
        const first = data[0];
        const last = data[data.length - 1];
        const startLabel = formatUtc(first.date, 'full');
        const endLabel = formatUtc(last.date, 'full');
        const parts: string[] = [];

        if (tab === 'portfolio') {
            const drawdown = maxDrawdownPct(data.map((d) => d.portfolioValue));
            const pl = last.portfolioValue - last.totalInvested;
            const plPct = last.totalInvested > 0 ? (pl / last.totalInvested) * 100 : null;
            parts.push(
                `Portfolio value moves from ${formatCurrency(first.portfolioValue)} on ${startLabel} to ` +
                    `${formatCurrency(last.portfolioValue)} on ${endLabel}, against ` +
                    `${formatCurrency(last.totalInvested)} invested.`,
            );
            parts.push(
                plPct === null
                    ? `That is a difference of ${formatCurrency(pl)}.`
                    : `That is ${formatCurrency(Math.abs(pl))} ${pl >= 0 ? 'above' : 'below'} the amount invested, ` +
                      `${signedPct(plPct)}.`,
            );
            if (drawdown !== null && drawdown > 0) {
                parts.push(`Largest peak-to-trough fall in portfolio value over the period: ${drawdown.toFixed(1)}%.`);
            }
        } else {
            const drawdown = maxDrawdownPct(data.map((d) => d.price));
            const pct = first.price > 0 ? ((last.price - first.price) / first.price) * 100 : null;
            parts.push(
                `Bitcoin price moves from ${formatCurrency(first.price)} on ${startLabel} to ` +
                    `${formatCurrency(last.price)} on ${endLabel}${pct === null ? '' : `, ${signedPct(pct)}`}.`,
            );
            if (avgCostUsd !== null) parts.push(`Average cost paid: ${formatCurrency(avgCostUsd)}.`);
            if (drawdown !== null && drawdown > 0) {
                parts.push(`Largest peak-to-trough fall in price over the period: ${drawdown.toFixed(1)}%.`);
            }
        }

        parts.push(`A table of ${textRows.length} evenly spaced sample points follows the chart.`);
        return parts.join(' ');
    }, [data, tab, formatCurrency, avgCostUsd, textRows.length]);

    // Short label for the SVG itself — the detail lives in the caption, summary
    // and table, so repeating it here would make every reader hear it twice.
    const chartAriaLabel =
        tab === 'portfolio'
            ? 'Portfolio value chart. The underlying figures are in the data table that follows.'
            : 'Bitcoin price chart. The underlying figures are in the data table that follows.';

    const handleExport = useCallback(async () => {
        if (!chartRef.current) return;
        try {
            const { toPng } = await import('html-to-image');
            const dark = document.documentElement.classList.contains('dark');
            const dataUrl = await toPng(chartRef.current, {
                pixelRatio: 2,
                backgroundColor: dark ? '#0f172a' : '#ffffff',
                skipFonts: true,
            });
            const link = document.createElement('a');
            link.download = `bitcoin-dca-chart-${formatUtc(Date.now(), 'isoDay')}.png`;
            link.href = dataUrl;
            link.click();
        } catch {
            // Chart export failed silently
        }
    }, []);

    // The brush now renders at every width. Below 640px it has to fight the global
    // chart touch rules in globals.css (`.recharts-wrapper *` gets
    // `touch-action: manipulation`, `.recharts-surface` gets `pan-x pan-y`), which
    // let the browser claim a drag for scrolling and fire touchcancel mid-gesture.
    // React attaches touchstart/touchmove passively at the root, so Recharts' own
    // handlers cannot preventDefault. This non-passive listener does it for them,
    // and only while a traveller or the slide is actually being dragged — a drag
    // anywhere else on the chart still scrolls the page normally.
    const showBrush = (data?.length ?? 0) > BRUSH_MIN_POINTS;

    useEffect(() => {
        const el = plotRef.current;
        if (!el || !showBrush) return;
        let dragging = false;
        const onStart = (e: TouchEvent) => {
            const target = e.target;
            dragging =
                target instanceof Element &&
                target.closest('.recharts-brush-traveller, .recharts-brush-slide') !== null;
        };
        const onMove = (e: TouchEvent) => {
            if (dragging && e.cancelable) e.preventDefault();
        };
        const onEnd = () => {
            dragging = false;
        };
        el.addEventListener('touchstart', onStart, { passive: true });
        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onEnd, { passive: true });
        el.addEventListener('touchcancel', onEnd, { passive: true });
        return () => {
            el.removeEventListener('touchstart', onStart);
            el.removeEventListener('touchmove', onMove);
            el.removeEventListener('touchend', onEnd);
            el.removeEventListener('touchcancel', onEnd);
        };
    }, [showBrush]);

    if (!data || data.length === 0) return null;

    const showBuyDots = chartData.length <= BUY_DOT_MAX_POINTS;
    // Legend only when the active tab draws ≥ 2 series
    const showLegend = tab === 'portfolio' || showPowerLaw;

    const tabButtonClass = (active: boolean) =>
        clsx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            active
                ? 'bg-white text-amber-700 shadow-sm dark:bg-slate-700 dark:text-amber-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
        );

    return (
        <div ref={chartRef}>
            <Card className="relative flex h-[340px] w-full flex-col overflow-hidden p-3 select-none touch-manipulation contain-layout-paint sm:h-[460px] sm:p-4">
                {/* Header: title + tab switcher */}
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                    {/* "Performance Over Time" does not fit beside the Portfolio /
                        BTC Price switcher at 390px and was rendering as
                        "Performance Over Ti…". Shortened on small screens rather
                        than truncated mid-word. */}
                    <h3 className="min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 sm:text-base">
                        <span className="sm:hidden">Performance</span>
                        <span className="hidden sm:inline">Performance Over Time</span>
                    </h3>
                    <div
                        role="group"
                        aria-label="Chart view"
                        className="inline-flex shrink-0 items-center rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
                    >
                        <button
                            type="button"
                            aria-pressed={tab === 'portfolio'}
                            onClick={() => setTab('portfolio')}
                            className={tabButtonClass(tab === 'portfolio')}
                        >
                            Portfolio
                        </button>
                        <button
                            type="button"
                            aria-pressed={tab === 'price'}
                            onClick={() => setTab('price')}
                            className={tabButtonClass(tab === 'price')}
                        >
                            BTC Price
                        </button>
                    </div>
                </div>

                {/* Toggles + export */}
                <div className="mb-1 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 sm:mb-2">
                    <label className={toggleLabelClass}>
                        <input
                            type="checkbox"
                            checked={isLog}
                            onChange={(e) => setIsLog(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-amber-700 dark:text-amber-400 focus:ring-amber-500 dark:border-slate-600"
                        />
                        Log
                    </label>
                    {tab === 'price' && (
                        <label className={toggleLabelClass}>
                            <input
                                type="checkbox"
                                checked={showPowerLaw}
                                onChange={(e) => setShowPowerLaw(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600"
                            />
                            Power Law
                        </label>
                    )}
                    <label className={toggleLabelClass}>
                        <input
                            type="checkbox"
                            checked={showEvents}
                            onChange={(e) => setShowEvents(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                        />
                        Events
                    </label>
                    <span className="flex-1" aria-hidden="true" />
                    <button
                        type="button"
                        onClick={handleExport}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300 sm:p-2"
                        aria-label="Export chart as image"
                        title="Export chart as PNG"
                    >
                        <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                </div>

                <div
                    className="flex min-h-0 flex-1 flex-col tabular-nums"
                    role="figure"
                    aria-labelledby={captionId}
                    aria-describedby={summaryId}
                >
                    {/* sr-only: the visible caption is the card heading above. */}
                    <p id={captionId} className="sr-only">
                        {chartCaption}
                    </p>
                    <p id={summaryId} className="sr-only">
                        {chartSummary}
                    </p>
                    {/* role="img" collapses the whole SVG — axis ticks, legend, reference-line
                        labels, brush ticks — into one node, so none of it is read out a second
                        time next to the table below. */}
                    <div ref={plotRef} className="min-h-0 flex-1" role="img" aria-label={chartAriaLabel}>
                        <ResponsiveContainer width="100%" height="100%" debounce={150}>
                            {/* accessibilityLayer off: Recharts' own keyboard layer would fight the
                                role="img" collapse above. The text alternative is the caption,
                                summary and sr-only table in this same figure. */}
                            <ComposedChart
                                data={chartData}
                                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                                accessibilityLayer={false}
                            >
                                <defs>
                                    <linearGradient id="dcaPortfolioFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#d97706" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                {/* Horizontal-only SOLID hairlines */}
                                <CartesianGrid vertical={false} stroke={colors.grid} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(d: string) => formatUtc(d, 'shortMonthYear')}
                                    minTickGap={40}
                                    tick={{ fontSize: 11, fill: colors.axis }}
                                    tickLine={false}
                                    axisLine={{ stroke: colors.grid }}
                                />
                                <YAxis
                                    scale={isLog ? 'log' : 'auto'}
                                    domain={isLog ? ['auto', 'auto'] : [0, 'auto']}
                                    allowDataOverflow={isLog}
                                    width={48}
                                    tickFormatter={formatAxisTick}
                                    tick={{ fontSize: 11, fill: colors.axis }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    content={<ChartTooltip tab={tab} unit={activeUnit} colors={colors} />}
                                    cursor={{ stroke: colors.cursor, strokeWidth: 1 }}
                                />
                                {showLegend && (
                                    <Legend
                                        verticalAlign="top"
                                        height={24}
                                        iconSize={8}
                                        wrapperStyle={{ fontSize: 11 }}
                                        formatter={(value) => <span style={{ color: colors.axis }}>{value}</span>}
                                    />
                                )}
                                {halvingLines.map((h) => (
                                    <ReferenceLine
                                        key={h.date}
                                        x={h.snappedDate}
                                        stroke={colors.halving}
                                        strokeDasharray="4 4"
                                        strokeWidth={1.5}
                                        label={{ value: h.label, position: 'insideTop', fill: colors.halving, fontSize: 10 }}
                                    />
                                ))}
                                {eventLines.map((e, i) => (
                                    <ReferenceLine
                                        key={e.date}
                                        x={e.snappedDate}
                                        stroke={e.color}
                                        strokeDasharray="3 3"
                                        strokeWidth={1}
                                        label={{
                                            value: e.label,
                                            position: i % 2 === 0 ? 'insideTopRight' : 'insideBottomRight',
                                            fill: e.color,
                                            fontSize: 10,
                                        }}
                                    />
                                ))}
                                {tab === 'price' && avgCostUsd !== null && (
                                    <ReferenceLine
                                        y={avgCostUsd}
                                        stroke={colors.neutral}
                                        strokeDasharray="4 4"
                                        strokeWidth={1.5}
                                        ifOverflow="extendDomain"
                                        label={{
                                            value: `Avg cost ${formatAxisTick(avgCostUsd)}`,
                                            position: 'insideBottomLeft',
                                            fill: colors.axis,
                                            fontSize: 10,
                                        }}
                                    />
                                )}
                                {tab === 'portfolio' && !isLog && (
                                    <Area
                                        type="monotone"
                                        dataKey="portfolioValue"
                                        name="Portfolio Value"
                                        stroke={colors.portfolio}
                                        strokeWidth={2}
                                        fill="url(#dcaPortfolioFill)"
                                        fillOpacity={1}
                                        isAnimationActive={false}
                                    />
                                )}
                                {tab === 'portfolio' && isLog && (
                                    // Log scale: area baselines to zero are undefined, draw a line instead
                                    <Line
                                        type="monotone"
                                        dataKey="portfolioValue"
                                        name="Portfolio Value"
                                        stroke={colors.portfolio}
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                )}
                                {tab === 'portfolio' && (
                                    <Line
                                        type="monotone"
                                        dataKey="totalInvested"
                                        name="Total Invested"
                                        stroke={colors.neutral}
                                        strokeWidth={1.5}
                                        strokeDasharray="4 4"
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                )}
                                {tab === 'price' && (
                                    <Line
                                        type="monotone"
                                        dataKey="price"
                                        name="BTC Price"
                                        stroke={colors.price}
                                        strokeWidth={2}
                                        dot={showBuyDots ? { r: 2.5, fill: colors.portfolio, stroke: 'none' } : false}
                                        activeDot={{ r: 4, strokeWidth: 0 }}
                                        isAnimationActive={false}
                                    />
                                )}
                                {tab === 'price' && showPowerLaw && (
                                    <Line
                                        type="monotone"
                                        dataKey="powerLaw"
                                        name="Power Law"
                                        stroke={colors.powerLaw}
                                        strokeWidth={1.5}
                                        strokeDasharray="4 4"
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                )}
                                {showBrush && (
                                    // Touch sizing below sm: a 24px-wide, 30px-tall traveller clears
                                    // the 24x24 CSS-pixel minimum target size for a finger.
                                    <Brush
                                        dataKey="date"
                                        // Recharts' default traveller label reads `data[i].name`,
                                        // which our rows do not have — it would announce
                                        // "Min value: undefined". Override it.
                                        ariaLabel="Zoom the chart to a date range"
                                        height={isWide ? 24 : 30}
                                        travellerWidth={isWide ? 8 : 24}
                                        stroke={colors.portfolio}
                                        fill={isDark ? 'rgba(217, 119, 6, 0.08)' : 'rgba(217, 119, 6, 0.06)'}
                                        tickFormatter={(d: string) => formatUtc(d, 'shortMonthYear')}
                                    />
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Text alternative for the series. Downsampled to TEXT_TABLE_ROWS
                        evenly spaced points (first and last always included) so it can
                        actually be walked through row by row. */}
                    <table className="sr-only">
                        <caption>
                            {tab === 'portfolio'
                                ? `Portfolio value and total invested at ${textRows.length} sample dates`
                                : `Bitcoin price and holdings at ${textRows.length} sample dates`}
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col">Date</th>
                                {tab === 'portfolio' ? (
                                    <>
                                        <th scope="col">Total invested</th>
                                        <th scope="col">Portfolio value</th>
                                        <th scope="col">Difference</th>
                                    </>
                                ) : (
                                    <>
                                        <th scope="col">Bitcoin price</th>
                                        <th scope="col">{activeUnit === 'SATS' ? 'Sats held' : 'Bitcoin held'}</th>
                                        <th scope="col">Portfolio value</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {textRows.map((row) => (
                                <tr key={row.date}>
                                    <th scope="row">{formatUtc(row.date, 'full')}</th>
                                    {tab === 'portfolio' ? (
                                        <>
                                            <td>{formatCurrency(row.totalInvested)}</td>
                                            <td>{formatCurrency(row.portfolioValue)}</td>
                                            <td>
                                                {row.portfolioValue >= row.totalInvested ? 'up ' : 'down '}
                                                {formatCurrency(Math.abs(row.portfolioValue - row.totalInvested))}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td>{formatCurrency(row.price)}</td>
                                            <td>
                                                {activeUnit === 'SATS'
                                                    ? formatSats(row.totalAccumulated)
                                                    : formatBtc(row.totalAccumulated)}
                                            </td>
                                            <td>{formatCurrency(row.portfolioValue)}</td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="pointer-events-none absolute bottom-0.5 right-2 select-none text-[9px] text-slate-400/40 dark:text-slate-600/40">
                    btcdollarcostaverage.com
                </div>
            </Card>
        </div>
    );
});

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
    useXAxisDomain,
} from 'recharts';
import { DcaBreakdownItem, HistoricalEvent } from '@/types';
import { Camera } from 'lucide-react';
import clsx from 'clsx';
import { useCurrency, Denomination } from '@/context/CurrencyContext';
import { DAY_MS, formatUtc } from '@/utils/dates';
import { Card } from '@/components/ui/Card';
import { useIsDark } from '@/hooks/useIsDark';

type ChartTab = 'portfolio' | 'price';

/** What the reader has switched on in the chart. */
export interface DcaChartView {
    tab: ChartTab;
    isLog: boolean;
    showPowerLaw: boolean;
    showEvents: boolean;
}

const DEFAULT_CHART_VIEW: DcaChartView = { tab: 'portfolio', isLog: false, showPowerLaw: false, showEvents: false };

interface DcaChartProps {
    data: DcaBreakdownItem[];
    /** Overrides the site-wide denomination preference when supplied. */
    unit?: Denomination;
    /**
     * The chart's switches, when the parent keeps them. The calculator does:
     * it unmounts its results while a first set of prices loads, and the
     * switches have to outlive that. Left out, the chart keeps them itself.
     */
    view?: DcaChartView;
    onViewChange?: (view: DcaChartView) => void;
    /**
     * Largest fall in portfolio value, in percent, from the engine's daily
     * walk: the figure the stats strip shows. Pass null when it cannot be
     * measured (a fixed manual price). Leave it out when the series is not the
     * one the figure describes: the text summary then measures purchase days
     * only, and says so.
     */
    maxDrawdownPercent?: number | null;
    /**
     * UTC midnight (ms) of today, from the calculator. When the series runs past
     * it (a plan with a future end date), the chart marks where today falls and
     * says in words that everything to the right is a projection.
     */
    todayUtcTs?: number;
    /**
     * What the purchases still to come are priced at, in words that fit after
     * "at". Left out, "the last known price". A calculator running on a typed
     * price passes that instead.
     */
    plannedPriceWords?: string;
    /**
     * Where the stack stands on the day the headline values it, when that is
     * after the last purchase: UTC midnight (ms), the BTC price used and the
     * stack's value, both in USD. Drawn as a closing point, so the right edge
     * and the text summary end on the headline's figure. Ignored unless it is
     * dated after the last row.
     */
    valuation?: { ts: number; price: number; value: number };
}

// Past entries are the UTC date of the halving block, like every date on the
// site: block 840,000 was mined at 00:09 UTC on 20 April 2024. Halving 5 is
// that time plus 210,000 ten-minute blocks, to be replaced by the block's own
// date once block 1,050,000 is mined.
const HALVING_DATES: { date: string; label: string }[] = [
    { date: '2012-11-28', label: 'Halving 1' },
    { date: '2016-07-09', label: 'Halving 2' },
    { date: '2020-05-11', label: 'Halving 3' },
    { date: '2024-04-20', label: 'Halving 4' },
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

const computePowerLawPrice = (ts: number): number | null => {
    const daysSinceGenesis = (ts - GENESIS_DATE.getTime()) / DAY_MS;
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
// Up to this many days on the axis, ticks are labelled with the day ("Jul 8").
// Beyond it, with month and year ("Jul 26"), which on a short span repeats.
const DAY_LABEL_MAX_DAYS = 550;

/** Index of the last row dated on or before `ts`, or -1. Rows are in date order. */
function lastIndexThrough(rows: readonly { date: string }[], ts: number): number {
    let i = rows.length - 1;
    while (i >= 0 && Date.parse(rows[i].date) > ts) i--;
    return i;
}

/**
 * Min-max-per-bucket downsampling. For each bucket keep the min and max points of
 * BOTH portfolioValue and price (in time order), so peaks survive on either tab.
 * Up to 4 kept indices per bucket → ~DOWNSAMPLE_TARGET points out.
 *
 * The last purchase made by `todayUtcTs` is always kept: it is where history
 * ends, and the line to its left must not stop a bucket short of it.
 */
function downsampleMinMax(data: DcaBreakdownItem[], todayUtcTs?: number): DcaBreakdownItem[] {
    if (data.length <= DOWNSAMPLE_THRESHOLD) return data;
    const buckets = Math.max(1, Math.floor(DOWNSAMPLE_TARGET / 4));
    const bucketSize = data.length / buckets;
    const keep = new Set<number>([0, data.length - 1]);
    if (todayUtcTs !== undefined) {
        const lastMade = lastIndexThrough(data, todayUtcTs);
        if (lastMade >= 0) keep.add(lastMade);
    }
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
    /** UTC ms of `date`: the X position, so the axis is linear in time. */
    ts: number;
    date: string;
    /** True on the point a `valuation` adds: a valuation, not a purchase. */
    closing: boolean;
    invested: number;
    accumulated: number;
    totalAccumulated: number;
    // Nullable: values ≤ 0 are clamped out in log mode (log(0) is undefined).
    price: number | null;
    totalInvested: number | null;
    portfolioValue: number | null;
    powerLaw: number | null;
}

/**
 * Which side of a vertical line its label goes. A label centred on a line near
 * either end of the series runs off the plot, so there it sits on the inner side.
 */
function labelSideFor(
    ts: number,
    firstTs: number,
    lastTs: number,
    preferred: 'insideTop' | 'insideTopLeft',
): 'insideTop' | 'insideTopLeft' | 'insideTopRight' {
    const along = lastTs > firstTs ? (ts - firstTs) / (lastTs - firstTs) : 0;
    if (along > 0.85) return 'insideTopRight';
    if (along < 0.1) return 'insideTopLeft';
    return preferred;
}

// ── Brush ─────────────────────────────────────────────────────────────────────
// Sized for a finger on a narrow screen or a coarse pointer, for a mouse
// otherwise: the same test as the 44px floor in globals.css.
const FINGER_QUERY = '(max-width: 640px), (pointer: coarse)';
const fingerSubscribe = (onChange: () => void) => {
    const query = window.matchMedia(FINGER_QUERY);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
};
const getIsFinger = () => window.matchMedia(FINGER_QUERY).matches;
const getIsFingerServer = () => true;
const useFingerBrush = () => useSyncExternalStore(fingerSubscribe, getIsFinger, getIsFingerServer);

const FINGER_BRUSH_HEIGHT = 30;
const FINGER_HANDLE_WIDTH = 24;
const TOUCH_TARGET = 44;

/**
 * The finger-sized brush handle: drawn 24px wide, with an unpainted 44px
 * square around it to land on. The square reaches up into the band of axis
 * labels and never below the brush, where the chart ends.
 */
function renderFingerHandle({ x, y, width, height, stroke }: { x: number; y: number; width: number; height: number; stroke?: string }) {
    const gripY = Math.floor(y + height / 2) - 1;
    return (
        <>
            <rect
                x={x - (TOUCH_TARGET - width) / 2}
                y={y + height - TOUCH_TARGET}
                width={TOUCH_TARGET}
                height={TOUCH_TARGET}
                fill="transparent"
                stroke="none"
            />
            <rect x={x} y={y} width={width} height={height} fill={stroke} stroke="none" />
            <line x1={x + 1} y1={gripY} x2={x + width - 1} y2={gripY} fill="none" stroke="#fff" />
            <line x1={x + 1} y1={gripY + 2} x2={x + width - 1} y2={gripY + 2} fill="none" stroke="#fff" />
        </>
    );
}

/**
 * Reports whether the X axis, as drawn, covers a short span. Read from the
 * chart's own axis so that a brush zoom counts: a five-year plan zoomed to
 * three months needs day labels as much as a three-month plan does.
 */
function AxisSpanProbe({ onShortSpan }: { onShortSpan: (short: boolean) => void }) {
    const domain = useXAxisDomain();
    const from = domain?.[0];
    const to = domain?.[domain.length - 1];
    const short = typeof from === 'number' && typeof to === 'number' ? (to - from) / DAY_MS <= DAY_LABEL_MAX_DAYS : null;
    useEffect(() => {
        if (short !== null) onShortSpan(short);
    }, [short, onShortSpan]);
    return null;
}

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

/** Shown above the plot whenever the series runs past today. */
const PROJECTION_NOTE = 'Right of the Today line the purchases have not happened yet.';
/** The same, for a plan whose first purchase is still to come. */
const ALL_PROJECTED_NOTE = 'None of these purchases has happened yet.';

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
    tab,
    unit,
    colors,
}: {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
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
                {formatUtc(point.date, 'full')}
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

// The checkbox alone is a 16px target, so the label carries the tap area
// (clicking a label toggles its input): 44px on a narrow screen or a coarse
// pointer, the tighter 32px row for a mouse.
const toggleLabelClass =
    'flex min-h-11 sm:min-h-8 pointer-coarse:min-h-11 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap py-1 pr-1 text-[11px] text-slate-500 dark:text-slate-400';

export const DcaChart = memo(function DcaChart({
    data,
    unit,
    todayUtcTs,
    view,
    onViewChange,
    maxDrawdownPercent,
    plannedPriceWords = 'the last known price',
    valuation,
}: DcaChartProps) {
    const { currencyConfig, convertFromUsd, denomination, formatCurrency, formatBtc, formatSats } = useCurrency();
    // Falls back to the site-wide preference when the call site doesn't pin a unit.
    const activeUnit: Denomination = unit ?? denomination;
    const chartRef = useRef<HTMLDivElement>(null);
    const plotRef = useRef<HTMLDivElement>(null);
    // This component renders more than once per page, so the wiring ids must be unique.
    const uid = useId();
    const captionId = `${uid}-caption`;
    const summaryId = `${uid}-summary`;
    const [ownView, setOwnView] = useState<DcaChartView>(DEFAULT_CHART_VIEW);
    const chartView = view ?? ownView;
    const { tab, isLog, showPowerLaw, showEvents } = chartView;
    const changeView = (patch: Partial<DcaChartView>) => {
        const next = { ...chartView, ...patch };
        if (onViewChange) onViewChange(next);
        else setOwnView(next);
    };
    const [exportError, setExportError] = useState<string | null>(null);
    const exportErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDark = useIsDark();
    const fingerBrush = useFingerBrush();
    const [zoomedShort, setZoomedShort] = useState<boolean | null>(null);

    const colors: SeriesColors & { grid: string; axis: string; halving: string; halvingLabel: string; cursor: string } = {
        portfolio: '#d97706',
        price: '#059669',
        powerLaw: isDark ? '#8b5cf6' : '#7c3aed',
        neutral: isDark ? '#64748b' : '#94a3b8',
        grid: isDark ? '#1e293b' : '#f1f5f9',
        // Theme-flipped: #64748b is 4.76:1 on the light card but only 3.75:1 on
        // the dark one, so a single fixed value cannot clear AA in both.
        axis: isDark ? '#94a3b8' : '#64748b',
        halving: '#a855f7',
        // 10px text needs 4.5:1. The line's purple is 3.96:1 on the light card.
        halvingLabel: isDark ? '#a855f7' : '#7e22ce',
        cursor: isDark ? '#334155' : '#cbd5e1',
    };

    // Compact currency axis ticks — always converted from USD before formatting.
    const formatAxisTick = useCallback(
        (usd: number): string => {
            const v = convertFromUsd(usd);
            const sym = currencyConfig.symbol;
            const sign = v < 0 ? '-' : '';
            const abs = Math.abs(v);
            // One decimal below 100: "$100.0M" is wider than the axis.
            const short = (n: number): string => n.toFixed(n >= 100 ? 0 : 1);
            if (abs >= 1_000_000_000) return `${sign}${sym}${short(abs / 1_000_000_000)}B`;
            if (abs >= 1_000_000) return `${sign}${sym}${short(abs / 1_000_000)}M`;
            if (abs >= 10_000) return `${sign}${sym}${(abs / 1_000).toFixed(0)}k`;
            if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}k`;
            if (abs >= 1) return `${sign}${sym}${abs.toFixed(0)}`;
            // "$0.00" next to "$8.5k" read as a different unit; zero is just $0.
            if (abs === 0) return `${sym}0`;
            return `${sign}${sym}${abs.toFixed(2)}`;
        },
        [convertFromUsd, currencyConfig.symbol],
    );

    // The rows the chart draws: one per day, and the closing valuation when the
    // parent supplies one dated after the last of them.
    const closingTs = valuation?.ts;
    const closingPrice = valuation?.price;
    const closingValue = valuation?.value;
    const { series, hasClosing } = useMemo<{ series: DcaBreakdownItem[]; hasClosing: boolean }>(() => {
        if (!data || data.length === 0) return { series: [], hasClosing: false };
        // A starting stack shares the start date with the first purchase, whose
        // running totals already include it. Two points at one X would also
        // stop the axis thinning its ticks.
        const rows = data.length > 1 && data[0].isStartingStack && data[0].date === data[1].date ? data.slice(1) : data;
        const last = rows[rows.length - 1];
        if (
            closingTs === undefined || closingPrice === undefined || closingValue === undefined ||
            !(closingTs > Date.parse(last.date)) || !(closingPrice > 0) || !Number.isFinite(closingValue)
        ) {
            return { series: rows, hasClosing: false };
        }
        const closing: DcaBreakdownItem = {
            date: new Date(closingTs).toISOString(),
            price: closingPrice,
            invested: 0,
            accumulated: 0,
            fee: 0,
            totalInvested: last.totalInvested,
            totalAccumulated: last.totalAccumulated,
            portfolioValue: closingValue,
        };
        return { series: [...rows, closing], hasClosing: true };
    }, [data, closingTs, closingPrice, closingValue]);

    const sampled = useMemo(() => downsampleMinMax(series, todayUtcTs), [series, todayUtcTs]);

    const chartData = useMemo<ChartPoint[]>(() => {
        const clamp = (v: number): number | null => (isLog && v <= 0 ? null : v);
        return sampled.map((item, i) => {
            const ts = Date.parse(item.date);
            // The power law is a fit to history. Past today it would be a model
            // price for a date that has not happened, so the curve stops there.
            const isFuture = todayUtcTs !== undefined && ts > todayUtcTs;
            const pl = showPowerLaw && !isFuture ? computePowerLawPrice(ts) : null;
            return {
                ts,
                date: item.date,
                closing: hasClosing && i === sampled.length - 1,
                invested: item.invested,
                accumulated: item.accumulated,
                totalAccumulated: item.totalAccumulated,
                price: clamp(item.price),
                totalInvested: clamp(item.totalInvested),
                portfolioValue: clamp(item.portfolioValue),
                powerLaw: pl === null ? null : clamp(pl),
            };
        });
    }, [sampled, showPowerLaw, isLog, todayUtcTs, hasClosing]);

    // Average cost basis = last cumulative invested / last cumulative accumulated.
    const avgCostUsd = useMemo(() => {
        if (!data || data.length === 0) return null;
        const last = data[data.length - 1];
        return last.totalAccumulated > 0 ? last.totalInvested / last.totalAccumulated : null;
    }, [data]);

    // Halving and event lines that fall inside the series, at their own dates.
    const halvingLines = useMemo(() => {
        if (chartData.length < 2) return [];
        const firstTs = chartData[0].ts;
        const lastTs = chartData[chartData.length - 1].ts;
        return HALVING_DATES.map((h) => ({ ...h, ts: new Date(h.date).getTime() }))
            .filter((h) => h.ts >= firstTs && h.ts <= lastTs)
            .map((h) => ({ ...h, labelPosition: labelSideFor(h.ts, firstTs, lastTs, 'insideTop') }));
    }, [chartData]);

    const eventLines = useMemo(() => {
        if (!showEvents || chartData.length < 2) return [];
        const firstTs = chartData[0].ts;
        const lastTs = chartData[chartData.length - 1].ts;

        const candidates = HISTORICAL_EVENTS.map((e) => ({ ...e, ts: new Date(e.date).getTime() })).filter(
            (e) => e.ts >= firstTs && e.ts <= lastTs,
        );

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

    // Set when the series continues past today. `todayOnAxis` is false when
    // the whole series lies after today: there is no "today" on the axis to
    // mark, and every point is a projection.
    const projection = useMemo(() => {
        if (todayUtcTs === undefined || chartData.length === 0) return null;
        const firstTs = chartData[0].ts;
        const lastTs = chartData[chartData.length - 1].ts;
        if (!(lastTs > todayUtcTs)) return null;
        const todayOnAxis = firstTs <= todayUtcTs;
        return {
            todayOnAxis,
            labelPosition: labelSideFor(todayUtcTs, firstTs, lastTs, 'insideTopLeft'),
            note: `${todayOnAxis ? PROJECTION_NOTE : ALL_PROJECTED_NOTE} They are drawn at ${plannedPriceWords}: a projection, not history.`,
        };
    }, [chartData, todayUtcTs, plannedPriceWords]);

    // ── Text alternative: caption, prose summary, and a downsampled data table ──
    // A Recharts SVG carries nothing an assistive technology can read, so the
    // figure is labelled and described in text and the series is repeated as a
    // small table. The chart itself is collapsed to a single node (see role="img"
    // below) so the axis ticks are not read out on top of the table.

    const textRows = useMemo(() => sampleEvenly(series, TEXT_TABLE_ROWS), [series]);

    const chartCaption = useMemo(() => {
        if (series.length === 0) return 'DCA performance chart';
        const start = formatUtc(series[0].date, 'full');
        const end = formatUtc(series[series.length - 1].date, 'full');
        return tab === 'portfolio'
            ? `Portfolio value versus total invested, ${start} to ${end}`
            : `Bitcoin price versus average cost, ${start} to ${end}`;
    }, [series, tab]);

    const chartSummary = useMemo(() => {
        if (series.length === 0) return '';
        const first = series[0];
        const last = series[series.length - 1];
        const startLabel = formatUtc(first.date, 'full');
        const endLabel = formatUtc(last.date, 'full');
        const parts: string[] = [];

        if (tab === 'portfolio') {
            // The engine's figure when the parent has one. The fallback only
            // sees purchase days, and says so.
            const measured = maxDrawdownPercent !== undefined;
            const drawdown = measured ? maxDrawdownPercent : maxDrawdownPct(data.map((d) => d.portfolioValue));
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
                parts.push(
                    measured
                        ? `Largest peak-to-trough fall in portfolio value over the period: ${drawdown.toFixed(1)}%.`
                        : `Largest peak-to-trough fall in portfolio value between purchase dates: ${drawdown.toFixed(1)}%.`,
                );
            }
        } else {
            const drawdown = maxDrawdownPct(data.map((d) => d.price));
            const pct = first.price > 0 ? ((last.price - first.price) / first.price) * 100 : null;
            parts.push(
                `Bitcoin price moves from ${formatCurrency(first.price)} on ${startLabel} to ` +
                    `${formatCurrency(last.price)} on ${endLabel}${pct === null ? '' : `, ${signedPct(pct)}`}.`,
            );
            if (avgCostUsd !== null) parts.push(`Average cost paid: ${formatCurrency(avgCostUsd)}.`);
            // Purchase-day prices only: a low between two buys is not in this
            // series, so the sentence does not claim the whole period.
            if (drawdown !== null && drawdown > 0) {
                parts.push(`Largest peak-to-trough fall in price between purchase dates: ${drawdown.toFixed(1)}%.`);
            }
        }

        if (todayUtcTs !== undefined && new Date(last.date).getTime() > todayUtcTs) {
            parts.push(
                `Dates after ${formatUtc(todayUtcTs, 'full')} are purchases still to come, priced at ${plannedPriceWords}: a projection, not history.`,
            );
        }
        parts.push(`A table of ${textRows.length} evenly spaced sample points follows the chart.`);
        return parts.join(' ');
    }, [data, series, tab, formatCurrency, avgCostUsd, textRows.length, todayUtcTs, maxDrawdownPercent, plannedPriceWords]);

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
            // A silent failure reads as a dead button — say so, briefly.
            setExportError("Couldn't create the image. Try again.");
            if (exportErrorTimer.current) clearTimeout(exportErrorTimer.current);
            exportErrorTimer.current = setTimeout(() => setExportError(null), 4000);
        }
    }, []);

    const showBrush = (data?.length ?? 0) > BRUSH_MIN_POINTS;

    useEffect(() => () => {
        if (exportErrorTimer.current) clearTimeout(exportErrorTimer.current);
    }, []);

    // Recharts makes the brush travellers focusable sliders, but they sit
    // inside the role=img subtree: a keyboard user tabs into two stops that
    // announce raw pixel coordinates. The sr-only table is the accessible
    // path, so the travellers leave the tab order and the accessibility tree.
    // The tabindex is removed, not set to -1, which would still count as
    // focusable content inside an image. Re-applied via observer because
    // Recharts recreates them on every data change.
    useEffect(() => {
        const el = plotRef.current;
        if (!el || !showBrush) return;
        const detune = () => {
            el.querySelectorAll<SVGElement>('.recharts-brush-traveller:not([aria-hidden])').forEach((t) => {
                t.removeAttribute('tabindex');
                t.setAttribute('aria-hidden', 'true');
            });
        };
        detune();
        const observer = new MutationObserver(detune);
        observer.observe(el, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [showBrush]);

    // The global chart touch rules in globals.css (`.recharts-wrapper *` gets
    // `touch-action: manipulation`, `.recharts-surface` gets `pan-x pan-y`) let
    // the browser claim a drag for scrolling and fire touchcancel mid-gesture.
    // React attaches touchstart/touchmove passively at the root, so Recharts' own
    // handlers cannot preventDefault. This non-passive listener does it for them,
    // and only while a traveller or the slide is actually being dragged — a drag
    // anywhere else on the chart still scrolls the page normally.
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
    // Legend only when the active tab draws ≥ 2 series. The power law draws
    // nothing for a plan that lies wholly after today.
    const showLegend = tab === 'portfolio' || (showPowerLaw && chartData.some((p) => p.powerLaw !== null));
    // Until the axis has reported what it shows, the whole series is the span.
    const wholeSpanShort = (chartData[chartData.length - 1].ts - chartData[0].ts) / DAY_MS <= DAY_LABEL_MAX_DAYS;
    const xTickStyle = (zoomedShort ?? wholeSpanShort) ? 'monthDay' : 'shortMonthYear';

    const tabButtonClass = (active: boolean) =>
        clsx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            active
                ? 'bg-white text-amber-700 shadow-sm dark:bg-slate-700 dark:text-amber-400'
                // slate-600, like the calculator's Live / Manual switch: the
                // unselected option sits on the slate-100 track, the darkest
                // surface muted text lands on.
                : 'text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
        );

    return (
        <div ref={chartRef}>
            {/* Below sm the plot keeps a fixed height and the card grows with
                the notes above it. From sm up the card is fixed and has the room. */}
            <Card className="relative flex min-h-[340px] w-full flex-col overflow-hidden p-3 select-none touch-manipulation contain-layout-paint sm:h-[460px] sm:p-4">
                {/* Header: title + tab switcher */}
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                    {/* "Performance Over Time" does not fit beside the Portfolio /
                        BTC Price switcher at 390px, so small screens get a shorter
                        title rather than one cut mid-word. */}
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
                            onClick={() => changeView({ tab: 'portfolio' })}
                            className={tabButtonClass(tab === 'portfolio')}
                        >
                            Portfolio
                        </button>
                        <button
                            type="button"
                            aria-pressed={tab === 'price'}
                            onClick={() => changeView({ tab: 'price' })}
                            className={tabButtonClass(tab === 'price')}
                        >
                            BTC Price
                        </button>
                    </div>
                </div>

                {/* Toggles + export */}
                <div className="mb-1 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 sm:mb-2">
                    {/* title attrs stay as hover garnish; the real explanation is the
                        visible caption below — hover doesn't exist for the touch
                        majority and titles are silent to screen readers. */}
                    <label className={toggleLabelClass} title="Log scale: the same percentage move takes up the same space, whatever the price.">
                        <input
                            type="checkbox"
                            checked={isLog}
                            onChange={(e) => changeView({ isLog: e.target.checked })}
                            aria-describedby={isLog ? `${uid}-log-hint` : undefined}
                            className="h-4 w-4 rounded border-slate-300 text-amber-700 dark:text-amber-400 focus:ring-amber-500 dark:border-slate-600"
                        />
                        Log
                    </label>
                    {tab === 'price' && (
                        <label className={toggleLabelClass} title="A trend line fitted to Bitcoin’s whole price history. It is a curve fit, not a forecast.">
                            <input
                                type="checkbox"
                                checked={showPowerLaw}
                                onChange={(e) => changeView({ showPowerLaw: e.target.checked })}
                                aria-describedby={showPowerLaw ? `${uid}-pl-hint` : undefined}
                                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-slate-600"
                            />
                            Power Law
                        </label>
                    )}
                    <label className={toggleLabelClass}>
                        <input
                            type="checkbox"
                            checked={showEvents}
                            onChange={(e) => changeView({ showEvents: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                        />
                        Events
                    </label>
                    <span className="flex-1" aria-hidden="true" />
                    <button
                        type="button"
                        onClick={handleExport}
                        className="flex items-center justify-center rounded-lg p-1.5 max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300 sm:p-2"
                        aria-label="Save the chart as a PNG image"
                        title="Save the chart as a PNG image"
                    >
                        <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                </div>

                {(isLog || (tab === 'price' && showPowerLaw) || projection !== null) && (
                    <div className="mb-1 shrink-0 space-y-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                        {projection !== null && <p>{projection.note}</p>}
                        {isLog && (
                            <p id={`${uid}-log-hint`}>Log scale: equal percentage moves take equal space.</p>
                        )}
                        {tab === 'price' && showPowerLaw && (
                            <p id={`${uid}-pl-hint`}>
                                Power law: a curve fitted to Bitcoin’s whole history{projection !== null ? ', drawn up to today only' : ''} — a fit, not a forecast.
                            </p>
                        )}
                    </div>
                )}
                {/* Always mounted: a live region inserted together with its message
                    is often not announced at all. */}
                <div
                    role="status"
                    aria-live="polite"
                    className={exportError ? 'mb-1 shrink-0 text-[11px] leading-snug text-loss' : 'sr-only'}
                >
                    {exportError}
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
                        {tab === 'price' && showPowerLaw
                            ? ` A power-law trend line fitted to Bitcoin’s full price history is also drawn${projection !== null ? ', up to today only' : ''} — a curve fit, not a forecast.`
                            : ''}
                    </p>
                    {/* role="img" collapses the whole SVG — axis ticks, legend, reference-line
                        labels, brush ticks — into one node, so none of it is read out a second
                        time next to the table below.
                        The legend text is coloured here: Recharts gives it the series colour
                        inline, and a formatter that returns an element to recolour it ends up
                        in the icon's label as "[object Object]".
                        Axis labels take no pointer events: they are painted over the top of
                        the brush handles' touch area and would swallow a drag that starts on one. */}
                    <div
                        ref={plotRef}
                        className="h-[210px] flex-none sm:h-auto sm:min-h-0 sm:flex-1 [&_.recharts-legend-item-text]:text-slate-500! dark:[&_.recharts-legend-item-text]:text-slate-400! [&_.recharts-cartesian-axis-tick-value]:pointer-events-none"
                        role="img"
                        aria-label={chartAriaLabel}
                    >
                        {/* initialDimension: without it the first render measures -1×-1,
                            spamming a console warning and flashing an empty chart. */}
                        <ResponsiveContainer width="100%" height="100%" debounce={150} initialDimension={{ width: 358, height: 260 }}>
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
                                <AxisSpanProbe onShortSpan={setZoomedShort} />
                                <XAxis
                                    dataKey="ts"
                                    type="number"
                                    scale="time"
                                    domain={['dataMin', 'dataMax']}
                                    tickFormatter={(ts: number) => formatUtc(ts, xTickStyle)}
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
                                    <Legend verticalAlign="top" height={24} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                )}
                                {halvingLines.map((h) => (
                                    <ReferenceLine
                                        key={h.date}
                                        x={h.ts}
                                        stroke={colors.halving}
                                        strokeDasharray="4 4"
                                        strokeWidth={1.5}
                                        label={{ value: h.label, position: h.labelPosition, fill: colors.halvingLabel, fontSize: 10 }}
                                    />
                                ))}
                                {projection !== null && projection.todayOnAxis && (
                                    <ReferenceLine
                                        x={todayUtcTs}
                                        stroke={colors.axis}
                                        strokeWidth={1.5}
                                        // One row down, clear of a halving label beside it.
                                        label={{ value: 'Today', position: projection.labelPosition, dy: 12, fill: colors.axis, fontSize: 10 }}
                                    />
                                )}
                                {eventLines.map((e, i) => (
                                    <ReferenceLine
                                        key={e.date}
                                        x={e.ts}
                                        stroke={e.color}
                                        strokeDasharray="3 3"
                                        strokeWidth={1}
                                        // Top labels sit two rows down, under the halving
                                        // and Today labels.
                                        label={{
                                            value: e.label,
                                            position: i % 2 === 0 ? 'insideTopRight' : 'insideBottomRight',
                                            dy: i % 2 === 0 ? 24 : 0,
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
                                        // One dot per purchase. The closing valuation is not one.
                                        dot={
                                            showBuyDots
                                                ? ({ cx, cy, payload }) =>
                                                      (payload as ChartPoint).closing || cx == null || cy == null ? null : (
                                                          <circle cx={cx} cy={cy} r={2.5} fill={colors.portfolio} stroke="none" />
                                                      )
                                                : false
                                        }
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
                                    <Brush
                                        dataKey="date"
                                        // Recharts' default traveller label reads `data[i].name`,
                                        // which our rows do not have — it would announce
                                        // "Min value: undefined". Override it.
                                        ariaLabel="Zoom the chart to a date range"
                                        height={fingerBrush ? FINGER_BRUSH_HEIGHT : 24}
                                        travellerWidth={fingerBrush ? FINGER_HANDLE_WIDTH : 8}
                                        traveller={fingerBrush ? renderFingerHandle : undefined}
                                        stroke={colors.portfolio}
                                        fill={isDark ? 'rgba(217, 119, 6, 0.08)' : 'rgba(217, 119, 6, 0.06)'}
                                        // No date labels on the brush itself: they are clipped by the
                                        // card at both ends of the track, and the axis above shows the
                                        // window as it moves.
                                        tickFormatter={() => ''}
                                    />
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Text alternative for the series. Downsampled to TEXT_TABLE_ROWS
                        evenly spaced points (first and last always included) so it can
                        actually be walked through row by row.

                        The `sr-only` class MUST sit on a wrapping <div>, never on the
                        <table> itself. A table sizes to its content and ignores the
                        class's `width:1px; height:1px`, which leaves `clip-path` as the
                        only property hiding it, and clip-path on `display:table` is
                        unreliable in WebKit. A <div> honours width/height/overflow, so
                        the table is clipped by a real box. */}
                    <div className="sr-only">
                    <table>
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
                </div>
                <div aria-hidden="true" className="pointer-events-none absolute bottom-0.5 right-2 select-none text-[9px] text-slate-400/40 dark:text-slate-600/40">
                    btcdollarcostaverage.com
                </div>
            </Card>
        </div>
    );
});

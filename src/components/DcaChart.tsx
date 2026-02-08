'use client';

import { useEffect, useRef, useMemo, useState, useCallback, memo } from 'react';
import {
    createChart,
    createSeriesMarkers,
    AreaSeries,
    LineSeries,
    ColorType,
    CrosshairMode,
    LineStyle,
    LineType,
    type IChartApi,
    type ISeriesApi,
    type UTCTimestamp,
    type SeriesMarker,
    type Time,
    type MouseEventParams,
} from 'lightweight-charts';
import { DcaBreakdownItem, HistoricalEvent } from '@/types';
import { format } from 'date-fns';
import { Camera } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';

// ── Props ──────────────────────────────────────────────────────────────
interface DcaChartProps {
    data: DcaBreakdownItem[];
    unit?: 'BTC' | 'SATS';
    m2Data?: [number, number][] | null;
}

// ── Constants ──────────────────────────────────────────────────────────
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
    { date: '2020-03-12', label: 'COVID Crash', color: '#ef4444' },
    { date: '2021-05-19', label: 'China Ban 2', color: '#f97316' },
    { date: '2021-09-07', label: 'El Salvador', color: '#22c55e' },
    { date: '2024-01-10', label: 'ETF Approval', color: '#3b82f6' },
    { date: '2024-12-05', label: '$100k', color: '#f59e0b' },
];

const GENESIS_DATE = new Date('2009-01-03T00:00:00Z');

// ── Helpers ────────────────────────────────────────────────────────────
/** Single source of truth: date-string → lightweight-charts UTCTimestamp (seconds) */
function toTimestamp(dateStr: string): UTCTimestamp {
    return (new Date(dateStr).getTime() / 1000) as UTCTimestamp;
}

function computePowerLawPrice(dateStr: string): number | null {
    const date = new Date(dateStr);
    const daysSinceGenesis = (date.getTime() - GENESIS_DATE.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceGenesis <= 0) return null;
    const logDays = Math.log10(daysSinceGenesis);
    return Math.pow(10, 5.82 * logDays - 17.01);
}

function formatCompact(value: number, sym: string): string {
    if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(0)}k`;
    return `${sym}${value.toFixed(0)}`;
}

function isDark(): boolean {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
}

// ── Scale IDs ──────────────────────────────────────────────────────────
const SCALE_LEFT = 'left';
const SCALE_RIGHT = 'right';
const SCALE_OVERLAY = 'overlay'; // hidden scale for power-law / M2

// ── Component ──────────────────────────────────────────────────────────
export const DcaChart = memo(function DcaChart({ data, unit = 'BTC', m2Data }: DcaChartProps) {
    const { currencyConfig } = useCurrency();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartApiRef = useRef<IChartApi | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const [showPowerLaw, setShowPowerLaw] = useState(false);
    const [showM2, setShowM2] = useState(false);
    const [showEvents, setShowEvents] = useState(false);

    const sym = currencyConfig.symbol;

    // ── Build series data ──────────────────────────────────────────────
    const m2Sorted = useMemo(() => {
        if (!m2Data || m2Data.length === 0) return null;
        return [...m2Data].sort((a, b) => a[0] - b[0]);
    }, [m2Data]);

    const {
        portfolioData,
        investedData,
        priceData,
        powerLawData,
        m2NormData,
        dateRange,
    } = useMemo(() => {
        if (!data || data.length === 0)
            return { portfolioData: [], investedData: [], priceData: [], powerLawData: [], m2NormData: [], dateRange: null };

        const portfolio: { time: UTCTimestamp; value: number }[] = [];
        const invested: { time: UTCTimestamp; value: number }[] = [];
        const price: { time: UTCTimestamp; value: number }[] = [];
        const powerLaw: { time: UTCTimestamp; value: number }[] = [];
        const m2Norm: { time: UTCTimestamp; value: number }[] = [];

        // M2 normalization: scale to BTC price range
        let minM2 = Infinity, maxM2 = 0;
        let minPrice = Infinity, maxPrice = 0;
        if (m2Sorted) {
            for (const [, val] of m2Sorted) {
                if (val < minM2) minM2 = val;
                if (val > maxM2) maxM2 = val;
            }
            for (const item of data) {
                if (item.price < minPrice) minPrice = item.price;
                if (item.price > maxPrice) maxPrice = item.price;
            }
        }

        let m2Idx = 0;

        for (const item of data) {
            const t = toTimestamp(item.date);
            portfolio.push({ time: t, value: item.portfolioValue });
            invested.push({ time: t, value: item.totalInvested });
            price.push({ time: t, value: item.price });

            const pl = computePowerLawPrice(item.date);
            if (pl !== null) {
                powerLaw.push({ time: t, value: pl });
            }

            if (m2Sorted && m2Sorted.length > 0 && maxM2 > minM2 && maxPrice > minPrice) {
                const dateTs = new Date(item.date).getTime();
                while (m2Idx < m2Sorted.length - 1 && m2Sorted[m2Idx + 1][0] <= dateTs) m2Idx++;
                let closestVal = m2Sorted[m2Idx][1];
                if (m2Idx < m2Sorted.length - 1) {
                    const dC = Math.abs(m2Sorted[m2Idx][0] - dateTs);
                    const dN = Math.abs(m2Sorted[m2Idx + 1][0] - dateTs);
                    if (dN < dC) closestVal = m2Sorted[m2Idx + 1][1];
                }
                // Normalize M2 into BTC price range so it rides the right scale
                const normalized = minPrice + ((closestVal - minM2) / (maxM2 - minM2)) * (maxPrice - minPrice);
                m2Norm.push({ time: t, value: normalized });
            }
        }

        return {
            portfolioData: portfolio,
            investedData: invested,
            priceData: price,
            powerLawData: powerLaw,
            m2NormData: m2Norm,
            dateRange: data.length >= 2
                ? { first: new Date(data[0].date).getTime(), last: new Date(data[data.length - 1].date).getTime() }
                : null,
        };
    }, [data, m2Sorted]);

    // ── Build markers ──────────────────────────────────────────────────
    const markers = useMemo(() => {
        if (!dateRange) return [];
        const result: SeriesMarker<Time>[] = [];

        for (const h of HALVING_DATES) {
            const ts = new Date(h.date).getTime();
            if (ts >= dateRange.first && ts <= dateRange.last) {
                result.push({
                    time: toTimestamp(h.date),
                    position: 'aboveBar',
                    color: '#a855f7',
                    shape: 'arrowDown',
                    text: h.label,
                });
            }
        }

        if (showEvents) {
            for (const e of HISTORICAL_EVENTS) {
                const ts = new Date(e.date).getTime();
                if (ts >= dateRange.first && ts <= dateRange.last) {
                    result.push({
                        time: toTimestamp(e.date),
                        position: 'aboveBar',
                        color: e.color,
                        shape: 'circle',
                        text: e.label,
                    });
                }
            }
        }

        result.sort((a, b) => (a.time as number) - (b.time as number));
        return result;
    }, [dateRange, showEvents]);

    // ── Chart lifecycle ────────────────────────────────────────────────
    useEffect(() => {
        const container = chartContainerRef.current;
        const tooltip = tooltipRef.current;
        if (!container || !tooltip || portfolioData.length === 0) return;

        const dark = isDark();

        const chart = createChart(container, {
            width: container.clientWidth,
            height: container.clientHeight,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: dark ? '#94a3b8' : '#64748b',
                fontSize: 11,
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { color: dark ? '#1e293b' : '#f1f5f9', style: LineStyle.Solid },
            },
            crosshair: {
                mode: CrosshairMode.Magnet,
                vertLine: { labelVisible: false },
                horzLine: { visible: false, labelVisible: false },
            },
            rightPriceScale: {
                visible: true,
                borderVisible: false,
                scaleMargins: { top: 0.15, bottom: 0.05 },
            },
            leftPriceScale: {
                visible: true,
                borderVisible: false,
                scaleMargins: { top: 0.15, bottom: 0.05 },
            },
            timeScale: {
                borderVisible: false,
                timeVisible: false,
                fixLeftEdge: true,
                fixRightEdge: true,
            },
            handleScale: { axisPressedMouseMove: { time: true, price: false } },
            handleScroll: { vertTouchDrag: false },
        });

        chartApiRef.current = chart;

        // ── Portfolio Value (area, left scale) ─────────────────────────
        const portfolioSeries = chart.addSeries(AreaSeries, {
            priceScaleId: SCALE_LEFT,
            lineColor: '#f59e0b',
            topColor: 'rgba(245,158,11,0.4)',
            bottomColor: 'rgba(245,158,11,0.0)',
            lineWidth: 2,
            lineType: LineType.Curved,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        portfolioSeries.setData(portfolioData);

        // ── Total Invested (line, left scale) ──────────────────────────
        const investedSeries = chart.addSeries(LineSeries, {
            priceScaleId: SCALE_LEFT,
            color: '#64748b',
            lineWidth: 1,
            lineType: LineType.Curved,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        investedSeries.setData(investedData);

        // ── BTC Price (line, right scale) ──────────────────────────────
        const priceSeries = chart.addSeries(LineSeries, {
            priceScaleId: SCALE_RIGHT,
            color: '#10b981',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            lineType: LineType.Curved,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        priceSeries.setData(priceData);

        // ── Power Law (line, right scale, hidden label) ────────────────
        let powerLawSeries: ISeriesApi<'Line'> | null = null;
        if (showPowerLaw && powerLawData.length > 0) {
            powerLawSeries = chart.addSeries(LineSeries, {
                priceScaleId: SCALE_OVERLAY,
                color: '#8b5cf6',
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                lineType: LineType.Curved,
                crosshairMarkerVisible: false,
                priceLineVisible: false,
                lastValueVisible: false,
            });
            powerLawSeries.setData(powerLawData);
            // Hide the overlay price scale
            chart.priceScale(SCALE_OVERLAY).applyOptions({ visible: false });
        }

        // ── M2 Supply (line, right scale, normalized to BTC price range)
        let m2Series: ISeriesApi<'Line'> | null = null;
        if (showM2 && m2NormData.length > 0) {
            m2Series = chart.addSeries(LineSeries, {
                priceScaleId: SCALE_RIGHT,
                color: '#22c55e',
                lineWidth: 1,
                lineStyle: LineStyle.LargeDashed,
                lineType: LineType.Curved,
                crosshairMarkerVisible: false,
                priceLineVisible: false,
                lastValueVisible: false,
            });
            m2Series.setData(m2NormData);
        }

        // ── Markers (halvings + events) on portfolio series ────────────
        let markersHandle: { detach: () => void } | null = null;
        if (markers.length > 0) {
            markersHandle = createSeriesMarkers(portfolioSeries, markers);
        }

        // ── Tooltip via crosshair ──────────────────────────────────────
        const handleCrosshair = (param: MouseEventParams<Time>) => {
            if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
                tooltip.style.display = 'none';
                return;
            }

            const pv = param.seriesData.get(portfolioSeries);
            const iv = param.seriesData.get(investedSeries);
            const pr = param.seriesData.get(priceSeries);

            if (!pv || !('value' in pv)) {
                tooltip.style.display = 'none';
                return;
            }

            const dateMs = (param.time as number) * 1000;
            const dateStr = format(new Date(dateMs), 'MMM d, yyyy');

            let html = `<div class="lw-tooltip-date">${dateStr}</div>`;
            html += `<div class="lw-tooltip-row"><span style="color:#f59e0b">●</span> Portfolio: <b>${sym}${(pv as { value: number }).value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>`;
            if (iv && 'value' in iv) {
                html += `<div class="lw-tooltip-row"><span style="color:#64748b">●</span> Invested: <b>${sym}${(iv as { value: number }).value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>`;
            }
            if (pr && 'value' in pr) {
                html += `<div class="lw-tooltip-row"><span style="color:#10b981">●</span> BTC: <b>${sym}${(pr as { value: number }).value.toLocaleString()}</b></div>`;
            }

            if (showPowerLaw && powerLawSeries) {
                const plv = param.seriesData.get(powerLawSeries);
                if (plv && 'value' in plv) {
                    html += `<div class="lw-tooltip-row"><span style="color:#8b5cf6">●</span> Power Law: <b>${sym}${(plv as { value: number }).value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>`;
                }
            }

            tooltip.innerHTML = html;
            tooltip.style.display = 'block';

            // Position tooltip
            const chartRect = container.getBoundingClientRect();
            const tooltipW = tooltip.offsetWidth;
            const tooltipH = tooltip.offsetHeight;
            let left = param.point.x + 12;
            let top = param.point.y - tooltipH / 2;

            // Flip to left side if overflowing right
            if (left + tooltipW > chartRect.width) left = param.point.x - tooltipW - 12;
            // Clamp vertical
            if (top < 0) top = 0;
            if (top + tooltipH > chartRect.height) top = chartRect.height - tooltipH;

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        };

        chart.subscribeCrosshairMove(handleCrosshair);

        // ── Resize observer ────────────────────────────────────────────
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                chart.resize(width, height);
            }
        });
        ro.observe(container);

        // Fit content on first render
        chart.timeScale().fitContent();

        // ── Cleanup ────────────────────────────────────────────────────
        return () => {
            ro.disconnect();
            chart.unsubscribeCrosshairMove(handleCrosshair);
            if (markersHandle) markersHandle.detach();
            chart.remove();
            chartApiRef.current = null;
        };
    }, [portfolioData, investedData, priceData, powerLawData, m2NormData, showPowerLaw, showM2, markers, sym]);

    // ── Export ──────────────────────────────────────────────────────────
    const handleExport = useCallback(async () => {
        if (!wrapperRef.current) return;
        try {
            const { toPng } = await import('html-to-image');
            const dataUrl = await toPng(wrapperRef.current, {
                pixelRatio: 2,
                backgroundColor: '#0f172a',
                skipFonts: true,
            });
            const link = document.createElement('a');
            link.download = `bitcoin-dca-chart-${format(new Date(), 'yyyy-MM-dd')}.png`;
            link.href = dataUrl;
            link.click();
        } catch {
            // Chart export failed silently
        }
    }, []);

    if (!data || data.length === 0) return null;

    return (
        <div
            ref={wrapperRef}
            className="chart-shell w-full h-[300px] sm:h-[420px] bg-white dark:bg-slate-900 rounded-xl p-3 sm:p-4 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden relative flex flex-col"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2 shrink-0">
                <h3 className="text-sm sm:text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">Performance Over Time</h3>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-wrap justify-end">
                    <label className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={showPowerLaw}
                            onChange={(e) => setShowPowerLaw(e.target.checked)}
                            className="rounded border-slate-300 dark:border-slate-600 text-violet-500 focus:ring-violet-500 w-3 h-3 sm:w-3.5 sm:h-3.5"
                        />
                        Power Law
                    </label>
                    {m2Data && m2Data.length > 0 && (
                        <label className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none whitespace-nowrap">
                            <input
                                type="checkbox"
                                checked={showM2}
                                onChange={(e) => setShowM2(e.target.checked)}
                                className="rounded border-slate-300 dark:border-slate-600 text-green-500 focus:ring-green-500 w-3 h-3 sm:w-3.5 sm:h-3.5"
                            />
                            M2 Supply
                        </label>
                    )}
                    <label className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={showEvents}
                            onChange={(e) => setShowEvents(e.target.checked)}
                            className="rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500 w-3 h-3 sm:w-3.5 sm:h-3.5"
                        />
                        Events
                    </label>
                    <button
                        onClick={handleExport}
                        className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        aria-label="Export chart as image"
                        title="Export chart as PNG"
                    >
                        <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 mb-1 shrink-0 flex-wrap text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-500 inline-block rounded" /> Portfolio</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-slate-500 inline-block rounded" /> Invested</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-emerald-500 inline-block rounded border-dashed" /> BTC Price</span>
                {showPowerLaw && <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-violet-500 inline-block rounded" /> Power Law</span>}
                {showM2 && <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-green-500 inline-block rounded" /> M2 Supply</span>}
            </div>

            {/* Chart container */}
            <div ref={chartContainerRef} className="flex-1 min-h-0 relative">
                {/* Tooltip overlay */}
                <div
                    ref={tooltipRef}
                    className="lw-tooltip"
                    style={{ display: 'none' }}
                />
            </div>

            <div className="absolute bottom-0.5 right-2 text-[9px] text-slate-400/40 dark:text-slate-600/40 select-none pointer-events-none">
                btcdollarcostaverage.com
            </div>
        </div>
    );
});

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

function isDark(): boolean {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
}

function getIsMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches
        || window.matchMedia('(pointer: coarse)').matches;
}

// ── Scale IDs ──────────────────────────────────────────────────────────
const SCALE_LEFT = 'left';
const SCALE_RIGHT = 'right';
const SCALE_OVERLAY = 'overlay';

// ── Component ──────────────────────────────────────────────────────────
export const DcaChart = memo(function DcaChart({ data, unit = 'BTC', m2Data }: DcaChartProps) {
    const { currencyConfig } = useCurrency();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const chartAreaRef = useRef<HTMLDivElement>(null);   // layout sizing div (flex-1)
    const chartContainerRef = useRef<HTMLDivElement>(null); // clean div passed to createChart
    const chartApiRef = useRef<IChartApi | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const [showPowerLaw, setShowPowerLaw] = useState(false);
    const [showM2, setShowM2] = useState(false);
    const [showEvents, setShowEvents] = useState(false);
    const [showBtcPrice, setShowBtcPrice] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const hintShownRef = useRef(false);

    const sym = currencyConfig.symbol;

    // Detect mobile on mount
    useEffect(() => {
        setIsMobile(getIsMobile());
    }, []);

    // On mobile: BTC Price off by default; on desktop: on by default
    const isMobileInitialized = useRef(false);
    useEffect(() => {
        if (isMobileInitialized.current) return;
        isMobileInitialized.current = true;
        setShowBtcPrice(!getIsMobile());
    }, []);

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
        const mobile = getIsMobile();

        for (const h of HALVING_DATES) {
            const ts = new Date(h.date).getTime();
            if (ts >= dateRange.first && ts <= dateRange.last) {
                result.push({
                    time: toTimestamp(h.date),
                    position: 'aboveBar',
                    color: '#a855f7',
                    shape: 'arrowDown',
                    text: mobile ? '' : h.label,
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
                        text: mobile ? '' : e.label,
                    });
                }
            }
        }

        result.sort((a, b) => (a.time as number) - (b.time as number));
        return result;
    }, [dateRange, showEvents]);

    // ── Chart lifecycle ────────────────────────────────────────────────
    useEffect(() => {
        const area = chartAreaRef.current;
        const container = chartContainerRef.current;
        const tooltip = tooltipRef.current;
        if (!area || !container || !tooltip || portfolioData.length === 0) return;

        const dark = isDark();
        const mobile = getIsMobile();

        const chart = createChart(container, {
            width: area.clientWidth,
            height: area.clientHeight,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: dark ? '#94a3b8' : '#64748b',
                fontSize: mobile ? 10 : 11,
            },
            grid: {
                vertLines: { visible: false },
                horzLines: {
                    color: dark ? '#1e293b' : '#f1f5f9',
                    style: LineStyle.Solid,
                    visible: !mobile || false,
                },
            },
            crosshair: {
                mode: CrosshairMode.Magnet,
                vertLine: { labelVisible: false },
                horzLine: { visible: false, labelVisible: false },
            },
            rightPriceScale: {
                visible: mobile ? false : true,
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
            handleScale: {
                axisPressedMouseMove: { time: true, price: false },
                pinch: true,
                mouseWheel: true,
            },
            handleScroll: {
                horzTouchDrag: true,
                vertTouchDrag: false,
                pressedMouseMove: true,
                mouseWheel: true,
            },
            kineticScroll: {
                touch: true,
                mouse: false,
            },
        });

        chartApiRef.current = chart;

        // ── Portfolio Value (area, left scale) ─────────────────────────
        const portfolioSeries = chart.addSeries(AreaSeries, {
            priceScaleId: SCALE_LEFT,
            lineColor: '#f59e0b',
            topColor: mobile ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.4)',
            bottomColor: 'rgba(245,158,11,0.0)',
            lineWidth: mobile ? 1 : 2,
            lineType: LineType.Curved,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: mobile ? 3 : 4,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        portfolioSeries.setData(portfolioData);

        // ── Total Invested (line, left scale) — hidden on mobile ─────
        let investedSeries: ISeriesApi<'Line'> | null = null;
        if (!mobile) {
            investedSeries = chart.addSeries(LineSeries, {
                priceScaleId: SCALE_LEFT,
                color: '#64748b',
                lineWidth: 1,
                lineType: LineType.Curved,
                crosshairMarkerVisible: false,
                priceLineVisible: false,
                lastValueVisible: false,
            });
            investedSeries.setData(investedData);
        }

        // ── BTC Price (line, right on desktop / left on mobile) ──────
        let priceSeries: ISeriesApi<'Line'> | null = null;
        if (showBtcPrice) {
            priceSeries = chart.addSeries(LineSeries, {
                priceScaleId: mobile ? SCALE_OVERLAY : SCALE_RIGHT,
                color: '#10b981',
                lineWidth: mobile ? 1 : 2,
                lineStyle: LineStyle.Dashed,
                lineType: LineType.Curved,
                crosshairMarkerVisible: false,
                priceLineVisible: false,
                lastValueVisible: false,
            });
            priceSeries.setData(priceData);
            if (mobile) {
                chart.priceScale(SCALE_OVERLAY).applyOptions({ visible: false });
            }
        }

        // ── Power Law (overlay hidden scale) — desktop only ──────────
        let powerLawSeries: ISeriesApi<'Line'> | null = null;
        if (!mobile && showPowerLaw && powerLawData.length > 0) {
            const plScaleId = showBtcPrice ? 'overlay-pl' : SCALE_OVERLAY;
            powerLawSeries = chart.addSeries(LineSeries, {
                priceScaleId: plScaleId,
                color: '#8b5cf6',
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                lineType: LineType.Curved,
                crosshairMarkerVisible: false,
                priceLineVisible: false,
                lastValueVisible: false,
            });
            powerLawSeries.setData(powerLawData);
            chart.priceScale(plScaleId).applyOptions({ visible: false });
        }

        // ── M2 Supply (right scale, normalized) — desktop only ───────
        let m2Series: ISeriesApi<'Line'> | null = null;
        if (!mobile && showM2 && m2NormData.length > 0) {
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

        // ── Markers (halvings + events) on portfolio series ──────────
        let markersHandle: { detach: () => void } | null = null;
        if (markers.length > 0) {
            markersHandle = createSeriesMarkers(portfolioSeries, markers);
        }

        // ── Tooltip via crosshair ────────────────────────────────────
        const handleCrosshair = (param: MouseEventParams<Time>) => {
            if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
                tooltip.style.display = 'none';
                return;
            }

            const pv = param.seriesData.get(portfolioSeries);

            if (!pv || !('value' in pv)) {
                tooltip.style.display = 'none';
                return;
            }

            const dateMs = (param.time as number) * 1000;
            const dateStr = format(new Date(dateMs), 'MMM d, yyyy');

            let html = `<div class="lw-tooltip-date">${dateStr}</div>`;
            html += `<div class="lw-tooltip-row"><span style="color:#f59e0b">\u25cf</span> Portfolio: <b>${sym}${(pv as { value: number }).value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>`;

            if (investedSeries) {
                const iv = param.seriesData.get(investedSeries);
                if (iv && 'value' in iv) {
                    html += `<div class="lw-tooltip-row"><span style="color:#64748b">\u25cf</span> Invested: <b>${sym}${(iv as { value: number }).value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>`;
                }
            }
            if (priceSeries) {
                const pr = param.seriesData.get(priceSeries);
                if (pr && 'value' in pr) {
                    html += `<div class="lw-tooltip-row"><span style="color:#10b981">\u25cf</span> BTC: <b>${sym}${(pr as { value: number }).value.toLocaleString()}</b></div>`;
                }
            }
            if (!mobile && showPowerLaw && powerLawSeries) {
                const plv = param.seriesData.get(powerLawSeries);
                if (plv && 'value' in plv) {
                    html += `<div class="lw-tooltip-row"><span style="color:#8b5cf6">\u25cf</span> Power Law: <b>${sym}${(plv as { value: number }).value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b></div>`;
                }
            }

            tooltip.innerHTML = html;
            tooltip.style.display = 'block';

            const areaRect = area.getBoundingClientRect();
            const tooltipW = tooltip.offsetWidth;
            const tooltipH = tooltip.offsetHeight;
            let left = param.point.x + 12;
            let top = param.point.y - tooltipH / 2;

            if (left + tooltipW > areaRect.width) left = param.point.x - tooltipW - 12;
            if (top < 0) top = 0;
            if (top + tooltipH > areaRect.height) top = areaRect.height - tooltipH;

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        };

        chart.subscribeCrosshairMove(handleCrosshair);

        // ── Tap-to-show tooltip + hint (mobile) ────────────────────
        let tapDismissTimer: ReturnType<typeof setTimeout> | undefined;
        let hintTimer: ReturnType<typeof setTimeout> | undefined;

        // Show usage hint on first mobile render
        if (mobile && !hintShownRef.current) {
            hintShownRef.current = true;
            setShowHint(true);
            hintTimer = setTimeout(() => setShowHint(false), 4000);
        }

        // On tap, show tooltip (mobile requires this — crosshair only fires on long-press)
        const handleClick = (param: MouseEventParams<Time>) => {
            setShowHint(false);
            handleCrosshair(param);
            // Auto-dismiss tooltip after 4s on mobile
            if (mobile) {
                clearTimeout(tapDismissTimer);
                if (param.time) {
                    tapDismissTimer = setTimeout(() => {
                        tooltip.style.display = 'none';
                    }, 4000);
                }
            }
        };
        chart.subscribeClick(handleClick);

        // ── Resize observer (watches the layout div, not the chart container) ──
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                chart.resize(width, height);
            }
        });
        ro.observe(area);

        chart.timeScale().fitContent();

        // ── Cleanup ──────────────────────────────────────────────────
        return () => {
            clearTimeout(tapDismissTimer);
            clearTimeout(hintTimer);
            ro.disconnect();
            chart.unsubscribeClick(handleClick);
            chart.unsubscribeCrosshairMove(handleCrosshair);
            if (markersHandle) markersHandle.detach();
            chart.remove();
            chartApiRef.current = null;
        };
    }, [portfolioData, investedData, priceData, powerLawData, m2NormData, showPowerLaw, showM2, showBtcPrice, markers, sym, isMobile]);

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
                    {/* Mobile: BTC Price toggle + Events */}
                    {isMobile && (
                        <label className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 cursor-pointer select-none whitespace-nowrap">
                            <input
                                type="checkbox"
                                checked={showBtcPrice}
                                onChange={(e) => setShowBtcPrice(e.target.checked)}
                                className="rounded border-slate-300 dark:border-slate-600 text-emerald-500 focus:ring-emerald-500 w-3 h-3"
                            />
                            BTC Price
                        </label>
                    )}
                    {/* Desktop: Power Law, M2, Events */}
                    {!isMobile && (
                        <>
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
                        </>
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

            {/* Legend — only show visible series */}
            <div className="flex items-center gap-3 mb-1 shrink-0 flex-wrap text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-500 inline-block rounded" /> Portfolio</span>
                {!isMobile && <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-slate-500 inline-block rounded" /> Invested</span>}
                {showBtcPrice && <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-emerald-500 inline-block rounded" /> BTC Price</span>}
                {!isMobile && showPowerLaw && <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-violet-500 inline-block rounded" /> Power Law</span>}
                {!isMobile && showM2 && <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-green-500 inline-block rounded" /> M2 Supply</span>}
            </div>

            {/* Chart area — layout sizing wrapper */}
            <div ref={chartAreaRef} className="flex-1 min-h-0 relative">
                {/* Chart container — clean empty div for lightweight-charts */}
                <div
                    ref={chartContainerRef}
                    className="absolute inset-0"
                    style={{ touchAction: 'none' }}
                />
                {/* Tooltip — sibling to chart container, never inside it */}
                <div
                    ref={tooltipRef}
                    className="lw-tooltip"
                    style={{ display: 'none' }}
                />
                {/* Mobile hint — shown once on first render, dismissed on tap or after 4s */}
                {showHint && (
                    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                        <div className="bg-slate-800/80 backdrop-blur-sm text-slate-200 text-xs px-4 py-2.5 rounded-xl text-center leading-relaxed shadow-lg">
                            Tap for details<br />
                            Pinch to zoom &middot; Drag to pan
                        </div>
                    </div>
                )}
            </div>

            <div className="absolute bottom-0.5 right-2 text-[9px] text-slate-400/40 dark:text-slate-600/40 select-none pointer-events-none">
                btcdollarcostaverage.com
            </div>
        </div>
    );
});

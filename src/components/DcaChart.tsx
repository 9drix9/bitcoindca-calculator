'use client';

import { useMemo, useRef, useCallback, useState } from 'react';
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
    ComposedChart
} from 'recharts';
import { DcaBreakdownItem, HistoricalEvent } from '@/types';
import { format } from 'date-fns';
import { Camera } from 'lucide-react';

interface DcaChartProps {
    data: DcaBreakdownItem[];
    unit?: 'BTC' | 'SATS';
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
    { date: '2020-03-12', label: 'COVID Crash', color: '#ef4444' },
    { date: '2021-05-19', label: 'China Ban 2', color: '#f97316' },
    { date: '2021-09-07', label: 'El Salvador', color: '#22c55e' },
    { date: '2024-01-10', label: 'ETF Approval', color: '#3b82f6' },
    { date: '2024-12-05', label: '$100k', color: '#f59e0b' },
];

const GENESIS_DATE = new Date('2009-01-03T00:00:00Z');

const formatYAxis = (value: number): string => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
    return `$${value.toFixed(0)}`;
};

const computePowerLawPrice = (dateStr: string): number | null => {
    const date = new Date(dateStr);
    const daysSinceGenesis = (date.getTime() - GENESIS_DATE.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceGenesis <= 0) return null;
    const logDays = Math.log10(daysSinceGenesis);
    const price = Math.pow(10, 5.82 * logDays - 17.01);
    return price;
};

export const DcaChart = ({ data, unit = 'BTC', m2Data }: DcaChartProps) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const [showPowerLaw, setShowPowerLaw] = useState(false);
    const [showM2, setShowM2] = useState(false);
    const [showEvents, setShowEvents] = useState(false);

    const isSats = unit === 'SATS';

    const halvingLines = useMemo(() => {
        if (!data || data.length < 2) return [];
        const firstDate = new Date(data[0].date).getTime();
        const lastDate = new Date(data[data.length - 1].date).getTime();
        return HALVING_DATES
            .filter(h => {
                const hTs = new Date(h.date).getTime();
                return hTs >= firstDate && hTs <= lastDate;
            })
            .map(h => {
                const hTs = new Date(h.date).getTime();
                let closestIdx = 0;
                let closestDist = Infinity;
                for (let i = 0; i < data.length; i++) {
                    const dist = Math.abs(new Date(data[i].date).getTime() - hTs);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestIdx = i;
                    }
                }
                return { ...h, snappedDate: data[closestIdx].date };
            });
    }, [data]);

    const eventLines = useMemo(() => {
        if (!showEvents || !data || data.length < 2) return [];
        const firstDate = new Date(data[0].date).getTime();
        const lastDate = new Date(data[data.length - 1].date).getTime();
        return HISTORICAL_EVENTS
            .filter(e => {
                const eTs = new Date(e.date).getTime();
                return eTs >= firstDate && eTs <= lastDate;
            })
            .map(e => {
                const eTs = new Date(e.date).getTime();
                let closestIdx = 0;
                let closestDist = Infinity;
                for (let i = 0; i < data.length; i++) {
                    const dist = Math.abs(new Date(data[i].date).getTime() - eTs);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestIdx = i;
                    }
                }
                return { ...e, snappedDate: data[closestIdx].date };
            });
    }, [data, showEvents]);

    // Build sorted M2 array for efficient lookup
    const m2Sorted = useMemo(() => {
        if (!m2Data || m2Data.length === 0) return null;
        // m2Data is already [timestamp, value][], ensure sorted by timestamp
        const sorted = [...m2Data].sort((a, b) => a[0] - b[0]);
        return sorted;
    }, [m2Data]);

    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Determine max portfolio value for M2 normalization
        let maxPortfolioValue = 0;
        if (showM2 && m2Sorted) {
            for (const item of data) {
                if (item.portfolioValue > maxPortfolioValue) maxPortfolioValue = item.portfolioValue;
            }
        }

        // Find min/max M2 values
        let minM2 = Infinity;
        let maxM2 = 0;
        if (showM2 && m2Sorted) {
            for (const [, val] of m2Sorted) {
                if (val < minM2) minM2 = val;
                if (val > maxM2) maxM2 = val;
            }
        }

        // Use index pointer for O(n+m) M2 lookup instead of O(n*m)
        let m2Idx = 0;

        return data.map(item => {
            const extended: Record<string, unknown> = { ...item };

            if (showPowerLaw) {
                extended.powerLaw = computePowerLawPrice(item.date);
            }

            if (showM2 && m2Sorted && m2Sorted.length > 0 && maxM2 > minM2 && maxPortfolioValue > 0) {
                const dateTs = new Date(item.date).getTime();
                // Advance pointer to closest M2 data point
                while (m2Idx < m2Sorted.length - 1 && m2Sorted[m2Idx + 1][0] <= dateTs) {
                    m2Idx++;
                }
                // Check if next point is closer than current
                let closestVal = m2Sorted[m2Idx][1];
                if (m2Idx < m2Sorted.length - 1) {
                    const distCurrent = Math.abs(m2Sorted[m2Idx][0] - dateTs);
                    const distNext = Math.abs(m2Sorted[m2Idx + 1][0] - dateTs);
                    if (distNext < distCurrent) closestVal = m2Sorted[m2Idx + 1][1];
                }
                // Normalize M2 to left Y-axis scale (0 to maxPortfolioValue)
                extended.m2Normalized = ((closestVal - minM2) / (maxM2 - minM2)) * maxPortfolioValue;
            }

            return extended;
        });
    }, [data, showPowerLaw, showM2, m2Sorted]);

    const handleExport = useCallback(async () => {
        if (!chartRef.current) return;
        try {
            const { toPng } = await import('html-to-image');
            const dataUrl = await toPng(chartRef.current, {
                pixelRatio: 2,
                backgroundColor: '#0f172a',
                skipFonts: true,
            });
            const link = document.createElement('a');
            link.download = `bitcoin-dca-chart-${format(new Date(), 'yyyy-MM-dd')}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Chart export failed:', err);
        }
    }, []);

    if (!data || data.length === 0) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tooltipFormatter = (value: any, name: any) => {
        if (name === 'price' || name === 'BTC Price') {
            return [`$${Number(value).toLocaleString()}`, 'BTC Price'];
        }
        if (name === 'powerLaw' || name === 'Power Law') {
            return [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'Power Law'];
        }
        if (name === 'm2Normalized' || name === 'M2 Supply') {
            return [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'M2 Supply (normalized)'];
        }
        if ((name === 'accumulated' || name === 'BTC Bought') && isSats) {
            return [`${Math.floor(Number(value) * 100_000_000).toLocaleString()} sats`, 'Sats Bought'];
        }
        return [`$${Number(value).toLocaleString()}`, name];
    };

    return (
        <div
            ref={chartRef}
            className="w-full h-[300px] sm:h-[420px] bg-white dark:bg-slate-900 rounded-xl p-3 sm:p-4 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden relative flex flex-col"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2 sm:mb-4 gap-2 shrink-0">
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

            <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                    <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#64748b" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                        dataKey="date"
                        tickFormatter={(str) => format(new Date(str), 'MMM yy')}
                        minTickGap={40}
                        stroke="#94a3b8"
                        fontSize={10}
                        tick={{ fontSize: 10 }}
                    />
                    <YAxis
                        yAxisId="left"
                        stroke="#94a3b8"
                        fontSize={10}
                        width={40}
                        tickFormatter={formatYAxis}
                        tick={{ fontSize: 10 }}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#94a3b8"
                        fontSize={10}
                        width={40}
                        tickFormatter={formatYAxis}
                        tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                        labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')}
                        formatter={tooltipFormatter}
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', fontSize: '11px', borderRadius: '8px', padding: '8px 12px' }}
                    />
                    <Legend verticalAlign="top" height={28} iconSize={8} wrapperStyle={{ top: -4, fontSize: '10px' }} />
                    {halvingLines.map((h) => (
                        <ReferenceLine
                            key={h.date}
                            x={h.snappedDate}
                            yAxisId="left"
                            stroke="#a855f7"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            label={{ value: h.label, position: 'top', fill: '#a855f7', fontSize: 9 }}
                        />
                    ))}
                    {eventLines.map((e) => (
                        <ReferenceLine
                            key={e.date}
                            x={e.snappedDate}
                            yAxisId="left"
                            stroke={e.color}
                            strokeDasharray="3 3"
                            strokeWidth={1}
                            label={{ value: e.label, position: 'insideTopRight', fill: e.color, fontSize: 8 }}
                        />
                    ))}
                    <Area yAxisId="left" type="monotone" dataKey="portfolioValue" name="Portfolio Value" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" isAnimationActive={false} />
                    <Area yAxisId="left" type="monotone" dataKey="totalInvested" name="Total Invested" stroke="#64748b" strokeWidth={1.5} fillOpacity={0.5} fill="url(#colorInvested)" isAnimationActive={false} />
                    <Area yAxisId="right" type="monotone" dataKey="price" name="BTC Price" stroke="#10b981" strokeWidth={1.5} fillOpacity={0.1} strokeDasharray="5 5" fill="#10b981" isAnimationActive={false} />
                    {showPowerLaw && (
                        <Line yAxisId="right" type="monotone" dataKey="powerLaw" name="Power Law" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    )}
                    {showM2 && (
                        <Line yAxisId="left" type="monotone" dataKey="m2Normalized" name="M2 Supply" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
            </div>
            <div className="absolute bottom-0.5 right-2 text-[9px] text-slate-400/40 dark:text-slate-600/40 select-none pointer-events-none">
                btcdollarcostaverage.com
            </div>
        </div>
    );
};

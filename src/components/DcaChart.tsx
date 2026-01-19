'use client';

import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from 'recharts';
import { DcaBreakdownItem } from '@/types';
import { format } from 'date-fns';

interface DcaChartProps {
    data: DcaBreakdownItem[];
}

export const DcaChart = ({ data }: DcaChartProps) => {
    if (!data || data.length === 0) return null;

    return (
        <div className="w-full h-[300px] sm:h-[400px] bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">Performance Over Time</h3>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
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
                        tickFormatter={(str) => format(new Date(str), 'MMM yyyy')}
                        minTickGap={30}
                        stroke="#94a3b8"
                        fontSize={12}
                    />
                    <YAxis
                        yAxisId="left"
                        stroke="#94a3b8"
                        fontSize={11}
                        width={35}
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#94a3b8"
                        fontSize={11}
                        width={35}
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                        labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')}
                        formatter={(value: any, name: any) => [
                            `$${Number(value).toLocaleString()}`,
                            name === 'price' ? 'BTC Price' : name
                        ]}
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', fontSize: '12px' }}
                        wrapperStyle={{ top: 0, left: 0, right: 0, margin: 'auto' }}
                    />
                    <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ top: 0, fontSize: '12px' }} />
                    <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="portfolioValue"
                        name="Portfolio Value"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorValue)"
                        isAnimationActive={false}
                    />
                    <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="totalInvested"
                        name="Total Invested (USD)"
                        stroke="#64748b"
                        strokeWidth={2}
                        fillOpacity={0.5}
                        fill="url(#colorInvested)"
                        isAnimationActive={false}
                    />
                    <Area
                        yAxisId="right"
                        type="monotone"
                        dataKey="price"
                        name="BTC Price"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={0.1}
                        strokeDasharray="5 5"
                        fill="#10b981"
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

'use client';

import { useSyncExternalStore } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card } from '@/components/ui/Card';

const INTERNET_ADOPTION = [
    { year: 1990, internet: 0.05, bitcoin: null as number | null },
    { year: 1993, internet: 0.3, bitcoin: null },
    { year: 1995, internet: 0.7, bitcoin: null },
    { year: 1997, internet: 2.0, bitcoin: null },
    { year: 1998, internet: 3.6, bitcoin: null },
    { year: 2000, internet: 6.8, bitcoin: null },
    { year: 2002, internet: 10.6, bitcoin: null },
    { year: 2005, internet: 15.7, bitcoin: null },
    { year: 2008, internet: 23.1, bitcoin: null },
    { year: 2010, internet: 28.8, bitcoin: 0.001 },
    { year: 2012, internet: 34.4, bitcoin: 0.01 },
    { year: 2014, internet: 40.4, bitcoin: 0.05 },
    { year: 2016, internet: 45.8, bitcoin: 0.2 },
    { year: 2018, internet: 51.0, bitcoin: 0.8 },
    { year: 2020, internet: 59.5, bitcoin: 1.5 },
    { year: 2022, internet: 63.0, bitcoin: 3.0 },
    { year: 2024, internet: 67.0, bitcoin: 4.5 },
];

const GLOBAL_OWNERS_M = 560;
const WORLD_POPULATION_B = 8;
const ADOPTION_PERCENT = 4.5;

// Chart palette per design spec (validated for both modes):
// Internet = violet, Bitcoin = amber.
const INTERNET_COLOR = { light: '#7c3aed', dark: '#8b5cf6' };
const BITCOIN_COLOR = '#d97706';
const GRID_COLOR = { light: '#f1f5f9', dark: '#1e293b' };
const AXIS_TEXT = '#64748b';

// SSR renders the chart placeholder (recharts cannot hydrate safely); the store
// snapshot flips to true on the client, replacing the old setState-in-effect trick.
const emptySubscribe = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

const subscribeToThemeChanges = (callback: () => void) => {
    const observer = new MutationObserver(callback);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
};
const getIsDark = () => document.documentElement.classList.contains('dark');

export const BitcoinAdoption = () => {
    const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse);
    const isDark = useSyncExternalStore(subscribeToThemeChanges, getIsDark, getFalse);

    const internetColor = isDark ? INTERNET_COLOR.dark : INTERNET_COLOR.light;

    return (
        <section className="space-y-6">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Bitcoin Adoption
            </h3>

            {/* Global progress */}
            <Card className="p-4 sm:p-6 space-y-4">
                <div className="flex items-baseline justify-between">
                    <div>
                        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                            ~{GLOBAL_OWNERS_M}M
                        </div>
                        <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                            estimated global Bitcoin owners
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-lg sm:text-xl font-bold text-amber-500">
                            {ADOPTION_PERCENT}%
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            of {WORLD_POPULATION_B}B people
                        </div>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                    <div
                        className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
                        role="meter"
                        aria-label="Estimated global Bitcoin adoption"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={ADOPTION_PERCENT}
                    >
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                            style={{ width: `${ADOPTION_PERCENT}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>0%</span>
                        <span>100% global adoption</span>
                    </div>
                </div>

                {/* Comparison cards */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/50 p-3 sm:p-4">
                        <div className="text-xs sm:text-sm font-medium text-violet-700 dark:text-violet-400 mb-1">
                            Internet in 1998
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                            3.6%
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            ~150M users worldwide
                        </div>
                        <div className="text-xs text-violet-700 dark:text-violet-400 mt-1 font-medium">
                            Now: 67% (5.4B users)
                        </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3 sm:p-4">
                        <div suppressHydrationWarning className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
                            Bitcoin in {new Date().getFullYear()}
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                            4.5%
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            ~{GLOBAL_OWNERS_M}M owners worldwide
                        </div>
                        <div className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium">
                            Similar stage to early internet
                        </div>
                    </div>
                </div>

                {/* Chart — deferred to client to avoid recharts SSR hydration mismatch */}
                <div className="pt-2">
                    <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                        Adoption Curves: Internet vs Bitcoin
                    </div>
                    {mounted ? (
                        <div className="tabular-nums">
                            <ResponsiveContainer width="100%" height={180}>
                                <AreaChart data={INTERNET_ADOPTION} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="fillInternet" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={internetColor} stopOpacity={0.25} />
                                            <stop offset="100%" stopColor={internetColor} stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="fillBitcoin" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={BITCOIN_COLOR} stopOpacity={0.25} />
                                            <stop offset="100%" stopColor={BITCOIN_COLOR} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        vertical={false}
                                        stroke={isDark ? GRID_COLOR.dark : GRID_COLOR.light}
                                    />
                                    {/* Numeric axis so uneven year gaps keep true horizontal spacing */}
                                    <XAxis
                                        dataKey="year"
                                        type="number"
                                        domain={['dataMin', 'dataMax']}
                                        ticks={[1990, 2000, 2010, 2020]}
                                        tickFormatter={(v: number) => String(v)}
                                        tick={{ fontSize: 11, fill: AXIS_TEXT }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: AXIS_TEXT }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={v => `${v}%`}
                                    />
                                    <Tooltip
                                        contentStyle={isDark
                                            ? {
                                                backgroundColor: '#0f172a',
                                                border: '1px solid #1e293b',
                                                borderRadius: '8px',
                                                fontSize: '12px',
                                                color: '#f8fafc',
                                            }
                                            : {
                                                backgroundColor: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                fontSize: '12px',
                                                color: '#0f172a',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                            }}
                                        labelFormatter={(year: number) => String(year)}
                                        formatter={(value?: number, name?: string) => [
                                            `${value ?? 0}%`,
                                            name === 'internet' ? 'Internet' : 'Bitcoin',
                                        ]}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="internet"
                                        stroke={internetColor}
                                        strokeWidth={2}
                                        fill="url(#fillInternet)"
                                        connectNulls
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="bitcoin"
                                        stroke={BITCOIN_COLOR}
                                        strokeWidth={2}
                                        fill="url(#fillBitcoin)"
                                        connectNulls
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[180px] bg-slate-50 dark:bg-slate-800/50 rounded-lg animate-pulse" />
                    )}
                    <div className="flex justify-center gap-4 mt-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                            <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: internetColor }}
                                aria-hidden="true"
                            />{' '}
                            Internet
                        </span>
                        <span className="flex items-center gap-1">
                            <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: BITCOIN_COLOR }}
                                aria-hidden="true"
                            />{' '}
                            Bitcoin
                        </span>
                    </div>
                </div>

                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 italic">
                    Adoption estimates vary by source and methodology.
                </p>
            </Card>
        </section>
    );
};

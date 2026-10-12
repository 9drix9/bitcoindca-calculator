'use client';

import { useSyncExternalStore } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card } from '@/components/ui/Card';
import { useIsDark } from '@/hooks/useIsDark';

// Every figure on this card comes from the three tables below, each read from
// its publisher on 2026-10-12. Nothing else is typed in: the card used to hold
// an owner count, a population and a percentage as three separate constants,
// and they disagreed (560M of 8B is 7.0%, shown beside "4.5%"), with no source
// named for any of them.
//
// Refresh the tables together, and CHECKED_ON with them.
const CHECKED_ON = 'Oct 12, 2026';

// Share of the world's population that used the internet in the last three
// months. ITU's estimate, as published in the World Bank's World Development
// Indicators (IT.NET.USER.ZS, World; database updated 2026-10-08). The World
// aggregate starts in 2005. The chart used to run back to 1990 on numbers with
// no source, and its "Internet in 1998: 3.6%, ~150M users" tile did not agree
// with itself (150M of that year's 6.0B people is 2.5%).
const INTERNET_SHARE: [year: number, percent: number][] = [
    [2005, 15.6], [2006, 17.2], [2007, 20.2], [2008, 22.8], [2009, 25.3],
    [2010, 28.4], [2011, 30.9], [2012, 33.3], [2013, 35.3], [2014, 37.4],
    [2015, 39.9], [2016, 43.6], [2017, 46.3], [2018, 49.4], [2019, 53.9],
    [2020, 60.1], [2021, 63.8], [2022, 67.0], [2023, 69.2], [2024, 71.2],
    [2025, 73.6],
];
// ITU Facts and Figures 2025: "6 billion people ... are using the Internet in 2025".
const INTERNET_USERS_B = 6;

// Estimated Bitcoin owners each December, from Crypto.com's yearly Crypto
// Market Sizing reports (the 2022 to 2025 editions, published each January),
// over the world population on 1 July of the same year from the UN's World
// Population Prospects 2024. These are the only years read from the reports
// themselves, so the line starts in 2022; the older points on the old chart
// had no source at all.
const BITCOIN_OWNERS = [
    { year: 2022, ownersM: 219, populationM: 8021 },
    { year: 2023, ownersM: 296, populationM: 8092 },
    { year: 2024, ownersM: 337, populationM: 8162 },
    { year: 2025, ownersM: 365, populationM: 8232 },
];

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;
const ownerShare = (row: { ownersM: number; populationM: number }): number =>
    oneDecimal((row.ownersM / row.populationM) * 100);

const BITCOIN_SHARE = new Map(BITCOIN_OWNERS.map(row => [row.year, ownerShare(row)]));
const CHART_DATA = INTERNET_SHARE.map(([year, internet]) => ({
    year,
    internet,
    bitcoin: BITCOIN_SHARE.get(year) ?? null,
}));

const LATEST = BITCOIN_OWNERS[BITCOIN_OWNERS.length - 1];
const LATEST_SHARE = ownerShare(LATEST);
const FIRST_INTERNET = INTERNET_SHARE[0];
const LATEST_INTERNET = INTERNET_SHARE[INTERNET_SHARE.length - 1];

// Chart palette per design spec (validated for both modes):
// Internet = violet, Bitcoin = amber.
const INTERNET_COLOR = { light: '#7c3aed', dark: '#8b5cf6' };
const BITCOIN_COLOR = '#d97706';
const GRID_COLOR = { light: '#f1f5f9', dark: '#1e293b' };
// Theme-flipped: #64748b is 4.76:1 on the light card but only 3.75:1 on the dark
// one, so a single fixed value cannot clear AA in both.
const AXIS_TEXT = { light: '#64748b', dark: '#94a3b8' };

// SSR renders the chart placeholder (recharts cannot hydrate safely); the store
// snapshot flips to true on the client, replacing the old setState-in-effect trick.
const emptySubscribe = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

const sourceLink = 'underline hover:text-amber-700 dark:hover:text-amber-400 transition-colors';

export const BitcoinAdoption = () => {
    const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse);
    const isDark = useIsDark();

    const internetColor = isDark ? INTERNET_COLOR.dark : INTERNET_COLOR.light;
    const axisText = isDark ? AXIS_TEXT.dark : AXIS_TEXT.light;

    // The section and its heading live in LazyBitcoinAdoption, so they are on
    // the page before this chunk loads.
    return (
        <Card className="p-4 sm:p-6 space-y-4">
            <div className="flex items-baseline justify-between gap-3">
                <div>
                    <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                        ~{LATEST.ownersM}M
                    </div>
                    <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        estimated Bitcoin owners, December {LATEST.year}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400">
                        {LATEST_SHARE}%
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        of {(LATEST.populationM / 1000).toFixed(1)}B people
                    </div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
                <div
                    className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
                    role="meter"
                    aria-label="Estimated share of the world's population that owns Bitcoin"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={LATEST_SHARE}
                >
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-colors"
                        style={{ width: `${LATEST_SHARE}%` }}
                    />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>0%</span>
                    <span>100% of people</span>
                </div>
            </div>

            {/* Comparison cards: the same year on both sides. Text on the tinted
                panels is slate-600, since slate-500 there is 4.3:1, under AA. */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/50 p-3 sm:p-4">
                    <div className="text-xs sm:text-sm font-medium text-violet-700 dark:text-violet-400 mb-1">
                        Internet users, {LATEST_INTERNET[0]}
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        {LATEST_INTERNET[1]}%
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        about {INTERNET_USERS_B} billion people
                    </div>
                </div>
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3 sm:p-4">
                    <div className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
                        Bitcoin owners, {LATEST.year}
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                        {LATEST_SHARE}%
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        about {LATEST.ownersM} million people (estimate)
                    </div>
                </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                These are two different things, measured two different ways. The internet figure is the
                ITU&apos;s estimate of people who went online in the last three months. The Bitcoin figure is
                one exchange&apos;s model of how many people own any, and nobody can check it against a
                headcount. One line says nothing about where the other goes next.
            </p>

            {/* Chart — deferred to client to avoid recharts SSR hydration mismatch */}
            <div className="pt-2">
                <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                    Share of the world&apos;s population, {FIRST_INTERNET[0]} to {LATEST_INTERNET[0]}
                </div>
                {mounted ? (
                    <div
                        className="tabular-nums"
                        role="img"
                        aria-label={`Chart. Internet users rose from ${FIRST_INTERNET[1]}% of the world's population in ${FIRST_INTERNET[0]} to ${LATEST_INTERNET[1]}% in ${LATEST_INTERNET[0]}. Estimated Bitcoin owners rose from ${ownerShare(BITCOIN_OWNERS[0])}% in ${BITCOIN_OWNERS[0].year} to ${LATEST_SHARE}% in ${LATEST.year}.`}
                    >
                        <ResponsiveContainer width="100%" height={180} initialDimension={{ width: 358, height: 180 }}>
                            {/* accessibilityLayer off: it makes the SVG a focusable
                                "application" with no name, inside a wrapper that
                                already describes the chart as one image. */}
                            <AreaChart data={CHART_DATA} margin={{ top: 5, right: 14, left: -20, bottom: 0 }} accessibilityLayer={false}>
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
                                <XAxis
                                    dataKey="year"
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                    ticks={[2005, 2010, 2015, 2020, 2025]}
                                    tickFormatter={(v: number) => String(v)}
                                    tick={{ fontSize: 11, fill: axisText }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: axisText }}
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
                                        name === 'internet' ? 'Internet users' : 'Bitcoin owners (est.)',
                                    ]}
                                />
                                {/* No entry animation, like every chart on the site:
                                    Recharts animates in script, which the
                                    reduced-motion rule in globals.css cannot stop. */}
                                <Area
                                    type="monotone"
                                    dataKey="internet"
                                    stroke={internetColor}
                                    strokeWidth={2}
                                    fill="url(#fillInternet)"
                                    connectNulls
                                    isAnimationActive={false}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="bitcoin"
                                    stroke={BITCOIN_COLOR}
                                    strokeWidth={2}
                                    fill="url(#fillBitcoin)"
                                    connectNulls
                                    isAnimationActive={false}
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
                        Internet users
                    </span>
                    <span className="flex items-center gap-1">
                        <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{ backgroundColor: BITCOIN_COLOR }}
                            aria-hidden="true"
                        />{' '}
                        Bitcoin owners (estimate, from {BITCOIN_OWNERS[0].year})
                    </span>
                </div>
            </div>

            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Sources, checked {CHECKED_ON}. Bitcoin owners: Crypto.com&apos;s{' '}
                <a
                    href="https://crypto.com/research/crypto-market-sizing-report-2025"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={sourceLink}
                >
                    Crypto Market Sizing reports
                </a>
                , December figures for {BITCOIN_OWNERS[0].year} to {LATEST.year}. Crypto.com is an exchange. Its
                figure is modelled from blockchain data, surveys and its own customer data, the method changed
                between editions, and it assumes everyone it finds still holds coins, though some may have
                sold. Internet users: ITU estimates of people who used the internet in the last three months,{' '}
                <a
                    href="https://data.worldbank.org/indicator/IT.NET.USER.ZS?locations=1W"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={sourceLink}
                >
                    via the World Bank
                </a>
                {' '}and{' '}
                <a
                    href="https://www.itu.int/itu-d/reports/statistics/2025/10/15/ff25-internet-use/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={sourceLink}
                >
                    ITU Facts and Figures 2025
                </a>
                . Population:{' '}
                <a
                    href="https://population.un.org/wpp/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={sourceLink}
                >
                    UN World Population Prospects 2024
                </a>
                .
            </p>
        </Card>
    );
};

'use client';

import { useCallback, useId, useMemo, useState } from 'react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Hourglass } from 'lucide-react';
import clsx from 'clsx';
import { Card, CardHeader } from '@/components/ui/Card';
import { useCurrency } from '@/context/CurrencyContext';
import { useIsDark } from '@/hooks/useIsDark';

// ── Props contract (wired into DcaCalculator by the orchestrator) ─────────────

export interface DrawdownCalculatorProps {
    /** BTC the user has accumulated (from the DCA result) */
    btcAccumulated: number;
    /** Current BTC price in USD, or null when the live price is unavailable */
    livePrice: number | null;
}

// ── Model ─────────────────────────────────────────────────────────────────────

const MAX_MONTHS = 1200; // 100 years — bounds every loop
const TARGET_MONTHS = 360; // horizon for the "sustainable withdrawal" solve
const CHART_MAX_MONTHS = 480; // cap the drawn horizon at 40y when the stack never runs out
const MAX_CHART_POINTS = 300;
const AXIS_COLOR = '#64748b';
const LINE_COLOR = '#d97706'; // amber-600, both modes (spec §2)

const GROWTH_CHIPS = [-0.2, 0, 0.15, 0.3];
const SCENARIO_SPREAD = 0.2; // bear / bull sit ±20pp around the user's assumption

const GROWTH_MIN = -0.9;
const GROWTH_MAX = 3;

interface SimParams {
    startBtc: number;
    priceUsd: number;
    monthlyWithdrawalUsd: number;
    annualGrowth: number;
    annualInflation: number;
    floorBtc: number;
}

interface PathPoint {
    /** Years elapsed since today */
    year: number;
    /** Stack value in USD at that month */
    value: number;
    /** BTC remaining at that month */
    btc: number;
}

interface SimResult {
    /** Complete months funded by the stack */
    monthsSurvived: number;
    /** True when the stack outlived the simulated horizon */
    neverExhausted: boolean;
    btcRemaining: number;
    /** Nominal USD withdrawn (not inflation-adjusted back to today) */
    totalWithdrawnUsd: number;
    path: PathPoint[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** Parse a user-typed number. Returns null for empty / partial / non-finite input. */
const parseInput = (raw: string): number | null => {
    const cleaned = raw.replace(/[,\s]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
};

/**
 * Spend the stack down month by month.
 *
 * Each month the price compounds by `(1+g)^(1/12)-1`, the withdrawal compounds by the
 * monthly inflation rate, and `withdrawal / price` BTC is sold. The month the sale can
 * no longer be funded (down to the floor) is the month the stack runs out.
 */
function simulateDrawdown(p: SimParams, maxMonths: number, collectPath: boolean): SimResult {
    const growth = clamp(p.annualGrowth, GROWTH_MIN, GROWTH_MAX);
    const monthlyGrowth = Math.pow(1 + growth, 1 / 12) - 1;
    const monthlyInflation = Math.pow(1 + clamp(p.annualInflation, -0.5, 0.5), 1 / 12) - 1;

    let btc = p.startBtc;
    let price = p.priceUsd;
    let withdrawal = p.monthlyWithdrawalUsd;
    let totalWithdrawn = 0;
    let months = 0;

    const path: PathPoint[] = collectPath ? [{ year: 0, value: btc * price, btc }] : [];

    for (let m = 1; m <= maxMonths; m++) {
        price *= 1 + monthlyGrowth;
        if (!Number.isFinite(price) || price <= 0) break; // degenerate assumptions

        const spendable = btc - p.floorBtc;
        const btcNeeded = withdrawal / price;

        if (!Number.isFinite(btcNeeded) || btcNeeded >= spendable) {
            // Final, partially funded month: sell what is left above the floor and stop.
            if (spendable > 0) totalWithdrawn += spendable * price;
            btc = p.floorBtc;
            if (collectPath) path.push({ year: m / 12, value: btc * price, btc });
            break;
        }

        btc -= btcNeeded;
        totalWithdrawn += withdrawal;
        withdrawal *= 1 + monthlyInflation;
        months = m;
        if (collectPath) path.push({ year: m / 12, value: btc * price, btc });
    }

    return {
        monthsSurvived: months,
        neverExhausted: months >= maxMonths,
        btcRemaining: btc,
        totalWithdrawnUsd: totalWithdrawn,
        path,
    };
}

/**
 * Largest monthly withdrawal (USD, today's money) that still funds `targetMonths`.
 * Months survived is monotonically non-increasing in the withdrawal amount, so bisection
 * converges; the upper bound (one month = the whole stack) always fails.
 */
function solveSustainableWithdrawal(base: SimParams, targetMonths: number): number | null {
    const spendable = base.startBtc - base.floorBtc;
    if (!(spendable > 0) || !(base.priceUsd > 0)) return null;

    const lasts = (w: number): boolean =>
        simulateDrawdown({ ...base, monthlyWithdrawalUsd: w }, targetMonths, false).monthsSurvived >= targetMonths;

    let lo = 0;
    let hi = Math.max(spendable * base.priceUsd, 1);
    if (lasts(hi)) return hi; // unreachable in practice; keeps the result bounded
    if (!lasts(lo)) return null;

    for (let i = 0; i < 48; i++) {
        const mid = (lo + hi) / 2;
        if (lasts(mid)) lo = mid;
        else hi = mid;
    }
    return lo;
}

const downsample = (rows: PathPoint[], max: number): PathPoint[] => {
    if (rows.length <= max) return rows;
    const step = Math.ceil(rows.length / max);
    const sampled = rows.filter((_, i) => i % step === 0);
    const last = rows[rows.length - 1];
    if (sampled[sampled.length - 1] !== last) sampled.push(last);
    return sampled;
};

const formatDuration = (months: number): string => {
    if (months <= 0) return 'less than a month';
    const y = Math.floor(months / 12);
    const m = months % 12;
    const yearPart = `${y} year${y === 1 ? '' : 's'}`;
    const monthPart = `${m} month${m === 1 ? '' : 's'}`;
    if (y === 0) return monthPart;
    if (m === 0) return yearPart;
    return `${yearPart}, ${monthPart}`;
};

/** Percent with at most one decimal, trailing ".0" trimmed (0.15 → "15%"). */
const formatPercent = (rate: number): string => {
    const pct = Math.round(rate * 1000) / 10;
    return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
};

// ── Theme detection: observe the `dark` class on <html> (same as PlanComparison) ─

// Now shared — see src/hooks/useIsDark.ts. This was the fifth copy.

// ── Styling shorthands (spec §1) ──────────────────────────────────────────────

const inputClass =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-base tabular-nums text-slate-800 outline-none ' +
    'transition-shadow focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:text-sm';

const labelClass = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipEntry {
    value?: number | string;
    payload?: PathPoint;
}

function DrawdownTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
    const { formatCurrency, formatBtc } = useCurrency();
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0]?.payload;
    if (!point) return null;

    return (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-1.5 font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {point.year < 1 ? `Month ${Math.round(point.year * 12)}` : `Year ${point.year.toFixed(1)}`}
            </p>
            <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Stack value</span>
                    <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                        {formatCurrency(point.value)}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">BTC left</span>
                    <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                        {formatBtc(point.btc)}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ── Scenario card ─────────────────────────────────────────────────────────────

function ScenarioCard({
    label,
    rate,
    result,
    emphasised,
}: {
    label: string;
    rate: number;
    result: SimResult;
    emphasised: boolean;
}) {
    const good = result.neverExhausted || result.monthsSurvived >= TARGET_MONTHS;
    const bad = !result.neverExhausted && result.monthsSurvived < 120;
    const years = Math.floor(result.monthsSurvived / 12);
    const months = result.monthsSurvived % 12;

    return (
        <div
            className={clsx(
                'rounded-xl border p-3 text-center',
                emphasised
                    ? 'border-amber-500/30 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/[0.07]'
                    : 'border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50',
            )}
        >
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {label}
            </div>
            <div className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                {rate >= 0 ? '+' : ''}
                {formatPercent(rate)} / yr
            </div>
            <div
                className={clsx(
                    'mt-1.5 text-xl font-bold tracking-tight sm:text-2xl',
                    good
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : bad
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-800 dark:text-slate-100',
                )}
            >
                {result.neverExhausted ? (
                    'Never runs out'
                ) : years === 0 ? (
                    <>
                        {months}
                        <span className="text-sm font-semibold"> mo</span>
                    </>
                ) : (
                    <>
                        {years}
                        <span className="text-sm font-semibold"> yr</span>
                        {months > 0 && (
                            <>
                                {' '}
                                {months}
                                <span className="text-sm font-semibold"> mo</span>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export const DrawdownCalculator: React.FC<DrawdownCalculatorProps> = ({ btcAccumulated, livePrice }) => {
    const { currencyConfig, formatCurrency, formatBtc, convertFromUsd } = useCurrency();
    const isDark = useIsDark();
    const uid = useId();

    // Raw inputs. The withdrawal is typed in the DISPLAY currency and divided by the
    // FX rate before any math (spec §3); everything internal is USD.
    const [withdrawalInput, setWithdrawalInput] = useState('4000');
    const [growthInput, setGrowthInput] = useState('15');
    const [inflationInput, setInflationInput] = useState('3');
    const [floorInput, setFloorInput] = useState('0');

    const stackBtc = Number.isFinite(btcAccumulated) && btcAccumulated > 0 ? btcAccumulated : 0;
    const priceUsd = livePrice !== null && Number.isFinite(livePrice) && livePrice > 0 ? livePrice : null;

    const withdrawalDisplay = parseInput(withdrawalInput);
    const monthlyWithdrawalUsd =
        withdrawalDisplay !== null && withdrawalDisplay > 0 && currencyConfig.rate > 0
            ? withdrawalDisplay / currencyConfig.rate
            : 0;

    const annualGrowth = clamp((parseInput(growthInput) ?? 0) / 100, GROWTH_MIN, GROWTH_MAX);
    const annualInflation = clamp((parseInput(inflationInput) ?? 0) / 100, -0.1, 0.25);
    const floorBtc = clamp(parseInput(floorInput) ?? 0, 0, stackBtc);

    const model = useMemo(() => {
        if (priceUsd === null || stackBtc <= 0 || monthlyWithdrawalUsd <= 0) return null;

        const base: SimParams = {
            startBtc: stackBtc,
            priceUsd,
            monthlyWithdrawalUsd,
            annualGrowth,
            annualInflation,
            floorBtc,
        };

        const scenarios = [
            { key: 'bear', label: 'Bear', rate: clamp(annualGrowth - SCENARIO_SPREAD, GROWTH_MIN, GROWTH_MAX) },
            { key: 'base', label: 'Your assumption', rate: annualGrowth },
            { key: 'bull', label: 'Bull', rate: clamp(annualGrowth + SCENARIO_SPREAD, GROWTH_MIN, GROWTH_MAX) },
        ].map((s) => ({
            ...s,
            result: simulateDrawdown({ ...base, annualGrowth: s.rate }, MAX_MONTHS, false),
        }));

        const baseRun = simulateDrawdown(base, MAX_MONTHS, true);
        const chartMonths = baseRun.neverExhausted ? CHART_MAX_MONTHS : baseRun.path.length;
        const chartData = downsample(baseRun.path.slice(0, chartMonths + 1), MAX_CHART_POINTS);

        return {
            base: baseRun,
            scenarios,
            chartData,
            sustainableUsd: solveSustainableWithdrawal(base, TARGET_MONTHS),
        };
    }, [priceUsd, stackBtc, monthlyWithdrawalUsd, annualGrowth, annualInflation, floorBtc]);

    // Compact currency ticks — always converted from USD before formatting (spec §3).
    const formatAxisTick = useCallback(
        (usd: number): string => {
            const v = convertFromUsd(usd);
            const sym = currencyConfig.symbol;
            const sign = v < 0 ? '-' : '';
            const abs = Math.abs(v);
            if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(1)}T`;
            if (abs >= 1_000_000_000) return `${sign}${sym}${(abs / 1_000_000_000).toFixed(1)}B`;
            if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
            if (abs >= 10_000) return `${sign}${sym}${(abs / 1_000).toFixed(0)}k`;
            if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}k`;
            return `${sign}${sym}${abs.toFixed(0)}`;
        },
        [convertFromUsd, currencyConfig.symbol],
    );

    // ── Quiet unavailable states (never NaN) ──────────────────────────────────

    if (stackBtc <= 0 || priceUsd === null) {
        return (
            <Card className="p-4 sm:p-5">
                <CardHeader
                    icon={<Hourglass className="h-4 w-4" />}
                    title="How Long Would Your Stack Last?"
                    subtitle="Sell the stack down instead of building it. See when it runs out."
                />
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                    {stackBtc <= 0
                        ? 'Run a calculation with some BTC in it first, then come back here.'
                        : "The live Bitcoin price isn't available, so this can't run right now."}
                </p>
            </Card>
        );
    }

    const stackValueUsd = stackBtc * priceUsd;
    const maxYear = model && model.chartData.length > 0 ? model.chartData[model.chartData.length - 1].year : 0;
    const yearTick = (v: number): string => (maxYear < 3 ? `${v.toFixed(1)}y` : `${Math.round(v)}y`);

    const gridColor = isDark ? '#1e293b' : '#f1f5f9';
    const cursorColor = isDark ? '#334155' : '#cbd5e1';

    return (
        <Card className="p-4 sm:p-5">
            <CardHeader
                icon={<Hourglass className="h-4 w-4" />}
                title="How Long Would Your Stack Last?"
                subtitle="Sell the stack down instead of building it. See when it runs out."
            />

            {/* Inputs */}
            <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label htmlFor={`${uid}-withdrawal`} className={labelClass}>
                            Monthly withdrawal ({currencyConfig.symbol})
                        </label>
                        <input
                            id={`${uid}-withdrawal`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={withdrawalInput}
                            onChange={(e) => setWithdrawalInput(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor={`${uid}-growth`} className={labelClass}>
                            Bitcoin growth (% per year)
                        </label>
                        <input
                            id={`${uid}-growth`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={growthInput}
                            onChange={(e) => setGrowthInput(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor={`${uid}-inflation`} className={labelClass}>
                            Withdrawals rise (% per year)
                        </label>
                        <input
                            id={`${uid}-inflation`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={inflationInput}
                            onChange={(e) => setInflationInput(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor={`${uid}-floor`} className={labelClass}>
                            Stop selling at (BTC)
                        </label>
                        <input
                            id={`${uid}-floor`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={floorInput}
                            onChange={(e) => setFloorInput(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                </div>

                {/* Growth quick-picks */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Growth
                    </span>
                    {GROWTH_CHIPS.map((rate) => {
                        const active = Math.abs(rate - annualGrowth) < 1e-9;
                        return (
                            <button
                                key={rate}
                                type="button"
                                onClick={() => setGrowthInput(String(Math.round(rate * 100)))}
                                aria-pressed={active}
                                className={clsx(
                                    // min-h-8: the label alone is a ~16px target, so the chip carries the tap area.
                                    'inline-flex min-h-8 items-center rounded-lg px-2.5 py-1 text-xs font-medium tabular-nums transition-colors',
                                    active
                                        ? 'bg-amber-500 text-white'
                                        : 'border border-slate-200 bg-white text-slate-600 hover:border-amber-500/60 hover:text-amber-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-500/40 dark:hover:text-amber-400',
                                )}
                            >
                                {rate >= 0 ? '+' : ''}
                                {Math.round(rate * 100)}%
                            </button>
                        );
                    })}
                </div>
            </div>

            {model === null ? (
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                    Enter a monthly withdrawal to see how long the stack lasts.
                </p>
            ) : (
                <>
                    {/* Headline */}
                    <div className="mt-4 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-500/25 dark:from-amber-500/[0.07] dark:to-slate-900">
                        <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Your stack lasts
                        </div>
                        <div
                            className={clsx(
                                'mt-1 text-2xl font-bold tracking-tight sm:text-3xl',
                                model.base.neverExhausted
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-900 dark:text-white',
                            )}
                        >
                            {model.base.neverExhausted
                                ? 'Indefinitely'
                                : formatDuration(model.base.monthsSurvived)}
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
                            {model.base.neverExhausted
                                ? `At ${formatPercent(annualGrowth)} a year, the stack grows faster than you spend it, so it never runs out inside 100 years. `
                                : ''}
                            Spending{' '}
                            <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                {formatCurrency(monthlyWithdrawalUsd)}
                            </span>{' '}
                            a month from{' '}
                            <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                {formatBtc(stackBtc)}
                            </span>{' '}
                            ({formatCurrency(stackValueUsd)} at {formatCurrency(priceUsd)} per BTC), assuming Bitcoin{' '}
                            {annualGrowth >= 0 ? 'grows' : 'falls'} {formatPercent(Math.abs(annualGrowth))} a year and
                            withdrawals rise {formatPercent(annualInflation)} a year
                            {floorBtc > 0 ? ` and you never sell below ${formatBtc(floorBtc)}` : ''}.
                        </p>
                    </div>

                    {/* Scenario strip */}
                    <div className="mt-4">
                        <div className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300 sm:text-sm">
                            Same spending, three price paths
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {model.scenarios.map((s) => (
                                <ScenarioCard
                                    key={s.key}
                                    label={s.label}
                                    rate={s.rate}
                                    result={s.result}
                                    emphasised={s.key === 'base'}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Chart — single axis: stack value in the display currency */}
                    {model.chartData.length > 1 && (
                        <div
                            className="mt-4 h-[220px] tabular-nums"
                            role="img"
                            aria-label={`Stack value over time, from ${formatCurrency(stackValueUsd)} today to ${formatCurrency(
                                model.chartData[model.chartData.length - 1].value,
                            )} after ${maxYear.toFixed(1)} years`}
                        >
                            <ResponsiveContainer width="100%" height="100%" debounce={150}>
                                <LineChart
                                    data={model.chartData}
                                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                                    accessibilityLayer={false}
                                >
                                    {/* Horizontal-only SOLID hairlines (spec §2) */}
                                    <CartesianGrid vertical={false} stroke={gridColor} />
                                    <XAxis
                                        dataKey="year"
                                        type="number"
                                        domain={[0, 'dataMax']}
                                        tickFormatter={yearTick}
                                        minTickGap={32}
                                        tick={{ fontSize: 11, fill: AXIS_COLOR }}
                                        tickLine={false}
                                        axisLine={{ stroke: gridColor }}
                                    />
                                    <YAxis
                                        width={52}
                                        domain={[0, 'auto']}
                                        tickFormatter={formatAxisTick}
                                        tick={{ fontSize: 11, fill: AXIS_COLOR }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        content={<DrawdownTooltip />}
                                        cursor={{ stroke: cursorColor, strokeWidth: 1 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        name="Stack value"
                                        stroke={LINE_COLOR}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, strokeWidth: 0 }}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Supporting figures */}
                    <dl className="mt-4 space-y-1.5 text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-slate-500 dark:text-slate-400">Total withdrawn</dt>
                            <dd className="text-right font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                {formatCurrency(model.base.totalWithdrawnUsd)}
                            </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-slate-500 dark:text-slate-400">
                                BTC left {model.base.neverExhausted ? 'after 100 years' : 'at the end'}
                            </dt>
                            <dd className="text-right font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                {formatBtc(model.base.btcRemaining)}
                            </dd>
                        </div>
                        {model.sustainableUsd !== null && (
                            <div className="flex items-baseline justify-between gap-3">
                                <dt className="text-slate-500 dark:text-slate-400">
                                    Sustainable for {TARGET_MONTHS / 12} years
                                </dt>
                                <dd className="text-right font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(model.sustainableUsd)} / month
                                </dd>
                            </div>
                        )}
                    </dl>
                </>
            )}

            {/* Caveat — stated plainly, not buried */}
            <p className="mt-4 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 sm:text-xs">
                This assumes a smooth compounding price path, which Bitcoin has never had. The order of returns
                matters: an 80% drawdown in your first few years forces you to sell far more BTC at low prices, and
                the stack can be gone long before this model says. Read the number as an upper bound, not a plan.
                Not financial advice.
            </p>
        </Card>
    );
};

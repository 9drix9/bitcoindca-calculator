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
import { useCurrency, type Denomination } from '@/context/CurrencyContext';
import { useIsDark } from '@/hooks/useIsDark';
import {
    defaultMonthlySpend,
    flipSign,
    formatCompactAmount,
    impliedPrice,
    priceScenarioLabel,
    stackAmountAsInput,
} from '@/app/calculators/bitcoin-fire/projection';
import {
    GROWTH_MAX,
    GROWTH_MIN,
    clamp,
    floorMoney,
    simulateDrawdown,
    solveSustainableWithdrawal,
    type PathPoint,
    type SimParams,
    type SimResult,
} from '@/app/calculators/bitcoin-drawdown/spendDown';
import { readTypedAmount } from '@/app/calculators/bitcoin-drawdown/typedAmount';
import { SATS_PER_BTC } from '@/utils/units';

// ── Props contract (wired into DcaCalculator by the orchestrator) ─────────────

export interface DrawdownCalculatorProps {
    /**
     * BTC the user holds as of today. Never the end-of-plan total of a schedule
     * that runs into the future: this planner spends "your stack", and coins from
     * buys that have not happened yet are not in it.
     */
    btcAccumulated: number;
    /** Current BTC price in USD, or null when the live price is unavailable */
    livePrice: number | null;
    /** Unit for bitcoin amounts. Defaults to BTC, which is what the standalone page's inputs and prose use. */
    unit?: Denomination;
}

// ── Model ─────────────────────────────────────────────────────────────────────

const MAX_MONTHS = 1200; // 100 years — bounds every loop
const TARGET_MONTHS = 360; // horizon for the "sustainable withdrawal" solve
const CHART_MAX_MONTHS = 480; // cap the drawn horizon at 40y when the stack never runs out
const MAX_CHART_POINTS = 300;
const LINE_COLOR = '#d97706'; // amber-600, both modes (spec §2)

const GROWTH_CHIPS = [-0.5, -0.2, 0, 0.15, 0.3];
const SCENARIO_SPREAD = 0.2; // the two outer cards sit ±20pp around the user's assumption
// The implied price is quoted a decade out, and again at the horizon of the
// largest-withdrawal solve (TARGET_MONTHS).
const IMPLIED_PRICE_YEARS = 10;

const INFLATION_MIN = -0.1;
const INFLATION_MAX = 0.25;

/**
 * The simulation clamps growth and inflation internally, so a field left showing
 * an out-of-range number (say 500) would contradict the headline's stated
 * assumption (300%). Snapping on blur keeps field and simulation in agreement
 * without fighting the user mid-keystroke.
 */
const snapToRange = (raw: string, lo: number, hi: number): string | null => {
    const v = readTypedAmount(raw);
    if (v === null || (v >= lo && v <= hi)) return null;
    return String(clamp(v, lo, hi));
};

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

// 44px wherever a finger does the pointing: under 640px, and on a coarse
// pointer at any width (a tablet, a phone held sideways). 16px text there too,
// or iOS zooms the page when the field takes focus. A mouse keeps the denser
// 40px row.
const inputClass =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm tabular-nums text-slate-800 outline-none ' +
    'max-sm:h-11 max-sm:text-base pointer-coarse:h-11 pointer-coarse:text-base ' +
    'transition-shadow focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const labelClass = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipEntry {
    value?: number | string;
    payload?: PathPoint;
}

function DrawdownTooltip({
    active,
    payload,
    unit,
}: {
    active?: boolean;
    payload?: TooltipEntry[];
    unit: Denomination;
}) {
    const { formatCurrency, formatBtc, formatSats } = useCurrency();
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0]?.payload;
    if (!point) return null;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
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
                    <span className="text-slate-500 dark:text-slate-400">{unit === 'SATS' ? 'Sats left' : 'BTC left'}</span>
                    <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                        {unit === 'SATS' ? formatSats(point.btc) : formatBtc(point.btc)}
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
    impliedPriceLabel,
}: {
    label: string;
    rate: number;
    result: SimResult;
    emphasised: boolean;
    /** The price this rate implies at IMPLIED_PRICE_YEARS, already formatted. Null for a flat path. */
    impliedPriceLabel: string | null;
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
                {rate > 0 ? '+' : ''}
                {formatPercent(rate)} / yr
                {impliedPriceLabel && (
                    <span className="block">
                        BTC at {impliedPriceLabel} in {IMPLIED_PRICE_YEARS} yr
                    </span>
                )}
            </div>
            <div
                className={clsx(
                    'mt-1.5 text-xl font-bold sm:text-2xl',
                    good
                        ? 'text-gain'
                        : bad
                          ? 'text-loss'
                          : 'text-slate-800 dark:text-slate-100',
                )}
            >
                {result.neverExhausted ? (
                    // The model stops at 100 years. "Never" is more than it can show.
                    `${MAX_MONTHS / 12}+ years`
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

export const DrawdownCalculator: React.FC<DrawdownCalculatorProps> = ({ btcAccumulated, livePrice, unit = 'BTC' }) => {
    const { currencyConfig, formatCurrency, formatBtc, formatSats, convertFromUsd, rateNote } = useCurrency();
    const isDark = useIsDark();
    const uid = useId();
    // A bitcoin amount in the unit this panel was asked for.
    const formatStack = (btc: number): string => (unit === 'SATS' ? formatSats(btc) : formatBtc(btc));

    // Raw inputs. The withdrawal is typed in the DISPLAY currency and divided by the
    // FX rate before any math (spec §3); everything internal is USD.
    //
    // null means "not typed yet": the field then shows the default for whichever
    // currency is active (a bare 4000 is about $25 a month in yen), and follows a
    // currency switch until the visitor types a figure of their own.
    const [typedWithdrawal, setTypedWithdrawal] = useState<string | null>(null);
    const withdrawalInput = typedWithdrawal ?? String(defaultMonthlySpend(currencyConfig.rate));
    // Opens flat. Any other pre-filled rate is a price forecast the visitor never
    // made: +15% a year, the old default, is a 66-fold rise over the 30 years the
    // largest-withdrawal figure is solved for.
    const [growthInput, setGrowthInput] = useState('0');
    const [inflationInput, setInflationInput] = useState('3');
    // The floor is kept as typed, with the unit it was typed in. With Units on
    // sats this field used to stay a BTC field, the one bitcoin figure on the
    // panel that ignored the switch. It now follows it, and a figure typed in
    // one unit is shown as the same amount in the other when the switch moves.
    const [floor, setFloor] = useState<{ raw: string; unit: Denomination }>({ raw: '0', unit: 'BTC' });

    const stackBtc = Number.isFinite(btcAccumulated) && btcAccumulated > 0 ? btcAccumulated : 0;
    const priceUsd = livePrice !== null && Number.isFinite(livePrice) && livePrice > 0 ? livePrice : null;

    const withdrawalDisplay = readTypedAmount(withdrawalInput);
    const monthlyWithdrawalUsd =
        withdrawalDisplay !== null && withdrawalDisplay > 0 && currencyConfig.rate > 0
            ? withdrawalDisplay / currencyConfig.rate
            : 0;

    const annualGrowth = clamp((readTypedAmount(growthInput) ?? 0) / 100, GROWTH_MIN, GROWTH_MAX);
    const annualInflation = clamp((readTypedAmount(inflationInput) ?? 0) / 100, INFLATION_MIN, INFLATION_MAX);
    // Read by the rules of the unit it was typed in: "0,5" is half a bitcoin,
    // and "100,000" is a hundred thousand sats.
    const floorTyped = readTypedAmount(floor.raw, floor.unit === 'BTC' ? 'decimal' : 'auto');
    const floorTypedBtc = floorTyped === null ? null : floor.unit === 'SATS' ? floorTyped / SATS_PER_BTC : floorTyped;
    // Text that cannot be read as a number is shown as it is: there is nothing to convert.
    const floorInput = floor.unit === unit || floorTypedBtc === null
        ? floor.raw
        : stackAmountAsInput(floorTypedBtc, unit);
    const floorBtc = clamp(floorTypedBtc ?? 0, 0, stackBtc);

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

        // The outer cards are named for what their rate does to the price. They were
        // "Slower" and "Faster", which called a card at -20% a year slow growth.
        const lower = clamp(annualGrowth - SCENARIO_SPREAD, GROWTH_MIN, GROWTH_MAX);
        const higher = clamp(annualGrowth + SCENARIO_SPREAD, GROWTH_MIN, GROWTH_MAX);
        const scenarios = [
            { key: 'lower', label: priceScenarioLabel(lower), rate: lower },
            { key: 'base', label: 'Your assumption', rate: annualGrowth },
            { key: 'higher', label: priceScenarioLabel(higher), rate: higher },
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
        (usd: number): string => formatCompactAmount(convertFromUsd(usd), currencyConfig.symbol),
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
                        ? 'Run a calculation with some bitcoin in it first, then come back here.'
                        : "The live Bitcoin price isn't available, so this can't run right now."}
                </p>
            </Card>
        );
    }

    const stackValueUsd = stackBtc * priceUsd;
    const maxYear = model && model.chartData.length > 0 ? model.chartData[model.chartData.length - 1].year : 0;

    // What a rate means in price terms, in the display currency. Printed beside
    // every non-zero rate so the assumption is visible next to the result it buys.
    const priceIn = (rate: number, years: number): string =>
        formatCompactAmount(convertFromUsd(impliedPrice(priceUsd, rate, years)), currencyConfig.symbol);
    const targetYears = TARGET_MONTHS / 12;

    const flipGrowth = () => {
        // Snapped here because no blur follows a button press.
        const flipped = flipSign(growthInput);
        setGrowthInput(snapToRange(flipped, GROWTH_MIN * 100, GROWTH_MAX * 100) ?? flipped);
    };
    const yearTick = (v: number): string => (maxYear < 3 ? `${v.toFixed(1)}y` : `${Math.round(v)}y`);

    const gridColor = isDark ? '#1e293b' : '#f1f5f9';
    // Theme-flipped: #64748b is 4.76:1 on the light card but only 3.75:1 on the
    // dark one, under the 4.5:1 floor for the 11px tick labels.
    const axisColor = isDark ? '#94a3b8' : '#64748b';
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
                            onChange={(e) => setTypedWithdrawal(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor={`${uid}-growth`} className={labelClass}>
                            Bitcoin price change (% per year)
                        </label>
                        <div className="flex gap-2">
                            {/* Touch screens only: a number pad is not guaranteed a minus key,
                                and a falling price has to be reachable on any keyboard. */}
                            <button
                                type="button"
                                onClick={flipGrowth}
                                aria-label="Switch between a rising and a falling price"
                                className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 max-sm:inline-flex pointer-coarse:inline-flex"
                            >
                                <span aria-hidden="true">&plusmn;</span>
                            </button>
                            {/* type="number" with no inputMode: "decimal" gives iOS a keypad
                                with no minus key, so a falling price could not be typed. */}
                            <input
                                id={`${uid}-growth`}
                                type="number"
                                step="any"
                                autoComplete="off"
                                value={growthInput}
                                onChange={(e) => setGrowthInput(e.target.value)}
                                onBlur={() => {
                                    const snapped = snapToRange(growthInput, GROWTH_MIN * 100, GROWTH_MAX * 100);
                                    if (snapped !== null) setGrowthInput(snapped);
                                }}
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor={`${uid}-inflation`} className={labelClass}>
                            Withdrawals rise (% per year)
                        </label>
                        <input
                            id={`${uid}-inflation`}
                            type="number"
                            step="any"
                            autoComplete="off"
                            value={inflationInput}
                            onChange={(e) => setInflationInput(e.target.value)}
                            onBlur={() => {
                                const snapped = snapToRange(inflationInput, INFLATION_MIN * 100, INFLATION_MAX * 100);
                                if (snapped !== null) setInflationInput(snapped);
                            }}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor={`${uid}-floor`} className={labelClass}>
                            Stop selling at ({unit === 'SATS' ? 'sats' : 'BTC'})
                        </label>
                        <input
                            id={`${uid}-floor`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={floorInput}
                            onChange={(e) => setFloor({ raw: e.target.value, unit })}
                            className={inputClass}
                        />
                    </div>
                </div>

                {/* Price-change quick-picks */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Price change
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
                                    // 32px tall for a mouse. On a touch screen 44px tall, and
                                    // at least as wide: "0%" alone is 39px.
                                    'inline-flex min-h-8 min-w-0 items-center justify-center rounded-lg px-2.5 py-1 text-xs font-medium tabular-nums transition-colors max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11',
                                    active
                                        ? 'bg-amber-500 text-slate-950'
                                        : 'border border-slate-200 bg-white text-slate-600 hover:border-amber-500/60 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-500/40 dark:hover:text-amber-400',
                                )}
                            >
                                {rate > 0 ? '+' : ''}
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
                                'mt-1 text-2xl font-bold sm:text-3xl',
                                model.base.neverExhausted
                                    ? 'text-gain'
                                    : 'text-slate-900 dark:text-white',
                            )}
                        >
                            {model.base.neverExhausted
                                ? `More than ${MAX_MONTHS / 12} years`
                                : formatDuration(model.base.monthsSurvived)}
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
                            {model.base.neverExhausted
                                ? `On these assumptions the stack is not used up inside the ${MAX_MONTHS / 12} years this model runs. `
                                : ''}
                            You spend{' '}
                            <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                {formatCurrency(monthlyWithdrawalUsd)}
                            </span>{' '}
                            a month out of{' '}
                            <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                {formatStack(stackBtc)}
                            </span>{' '}
                            ({formatCurrency(stackValueUsd)} at {formatCurrency(priceUsd)} per BTC). This run assumes{' '}
                            {annualGrowth === 0 ? (
                                'the Bitcoin price stays flat'
                            ) : (
                                <>
                                    Bitcoin {annualGrowth > 0 ? 'rises' : 'falls'} {formatPercent(Math.abs(annualGrowth))} a
                                    year, which puts one bitcoin at{' '}
                                    <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                        {priceIn(annualGrowth, IMPLIED_PRICE_YEARS)}
                                    </span>{' '}
                                    in {IMPLIED_PRICE_YEARS} years and{' '}
                                    <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                        {priceIn(annualGrowth, targetYears)}
                                    </span>{' '}
                                    in {targetYears}
                                </>
                            )}
                            , and that your withdrawals{' '}
                            {annualInflation === 0
                                ? 'stay the same'
                                : `${annualInflation > 0 ? 'rise' : 'fall'} ${formatPercent(Math.abs(annualInflation))} a year`}
                            {floorBtc > 0 ? `, and that you never sell below ${formatStack(floorBtc)}` : ''}.
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
                                    impliedPriceLabel={s.rate === 0 ? null : priceIn(s.rate, IMPLIED_PRICE_YEARS)}
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
                            {/* initialDimension: without it the first render measures -1×-1,
                                spamming a console warning and flashing an empty chart. */}
                            <ResponsiveContainer width="100%" height="100%" debounce={150} initialDimension={{ width: 358, height: 220 }}>
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
                                        tick={{ fontSize: 11, fill: axisColor }}
                                        tickLine={false}
                                        axisLine={{ stroke: gridColor }}
                                    />
                                    <YAxis
                                        width={52}
                                        domain={[0, 'auto']}
                                        tickFormatter={formatAxisTick}
                                        tick={{ fontSize: 11, fill: axisColor }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        content={<DrawdownTooltip unit={unit} />}
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
                                {unit === 'SATS' ? 'Sats' : 'BTC'} left {model.base.neverExhausted ? `after ${MAX_MONTHS / 12} years` : 'at the end'}
                            </dt>
                            <dd className="text-right font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                {formatStack(model.base.btcRemaining)}
                            </dd>
                        </div>
                        {model.sustainableUsd !== null && (
                            <div className="flex items-baseline justify-between gap-3">
                                <dt className="text-slate-500 dark:text-slate-400">
                                    Largest withdrawal that lasts {targetYears} years
                                    {/* The figure is only as good as the price it leans on. */}
                                    {annualGrowth !== 0 && (
                                        <span className="block text-xs tabular-nums">
                                            needs BTC at {priceIn(annualGrowth, targetYears)} in year {targetYears}
                                        </span>
                                    )}
                                </dt>
                                {/* Neutral, not green: it is an output of the assumption above,
                                    not a finding that this spending is safe. Rounded down, so
                                    the amount printed is one that lasts the years in its label. */}
                                <dd className="shrink-0 whitespace-nowrap text-right font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                    {currencyConfig.symbol}
                                    {floorMoney(convertFromUsd(model.sustainableUsd)).toLocaleString('en-US', { maximumFractionDigits: 4 })} / month
                                </dd>
                            </div>
                        )}
                    </dl>
                </>
            )}

            {/* Caveat — stated plainly, not buried */}
            <p className="mt-4 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 sm:text-xs">
                This assumes the price compounds smoothly, which Bitcoin has never done. The order the returns
                arrive in matters too. An 80% crash in your first few years would force you to sell far more bitcoin
                at low prices. The stack can then be gone long before this model says. Read the number as arithmetic
                on the rate you typed, not a plan. Not financial advice.
                {/* Set when the display currency's rate is a dated fallback, not today's. */}
                {rateNote ? ` ${rateNote}` : ''}
            </p>
        </Card>
    );
};

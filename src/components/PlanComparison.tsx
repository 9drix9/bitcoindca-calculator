'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { GitCompare, Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { getBitcoinPriceHistoryWithMeta } from '@/app/actions';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { useCurrency } from '@/context/CurrencyContext';
import { useIsDark } from '@/hooks/useIsDark';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { priceFallbackNotice, priceStaleNotice, type PriceProvider } from '@/data/priceSources';
import { DcaResult, Frequency } from '@/types';
import { calculateDca } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_DATE, EARLIEST_PRICE_TS, formatUtc, parseUtcDate, utcDayStart } from '@/utils/dates';
import { limitMessage, readNumericText } from '@/utils/numericInput';
import { URL_PARAM_LIMITS } from '@/utils/urlParams';

// ── Props contract (wired into DcaCalculator by the orchestrator) ─────────────

export interface BasePlan {
    amountUsd: number; // per-purchase amount in USD
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    startDate: string; // 'yyyy-MM-dd'
    /**
     * 'yyyy-MM-dd'. Every plan here runs to this day. The calculator passes
     * today for a plan whose own end date is in the future: these cards say
     * what a plan "would have done", and buys that have not happened yet would
     * only be the last known price repeated.
     */
    endDate: string;
    feePercentage: number;
    /**
     * Flat fee per buy in USD. It is charged to every plan compared here, on
     * top of that plan's own percentage: a fixed charge per order is exactly
     * what makes a weekly schedule cost more than a monthly one.
     */
    flatFeeUsd?: number;
    provider: PriceProvider;
    /**
     * Live spot price. Without it every plan here was valued at the last historical
     * bar while the headline result cards used the live price, so the same schedule
     * showed two different "current value" figures on screen at once.
     * Deliberately kept out of `specsJson` — it ticks continuously and would
     * re-trigger the fetch effect on every update.
     */
    livePrice: number | null;
}

// ── Internal types ────────────────────────────────────────────────────────────

type PlanKey = 'a' | 'b' | 'c';
type AltSlot = 'b' | 'c';

interface AltPlanState {
    slot: AltSlot;
    /** Raw user input in DISPLAY currency; divided by currencyConfig.rate for USD math (spec §3). */
    amountInput: string;
    frequency: Frequency;
    startDate: string; // 'yyyy-MM-dd'
    feeInput: string;
}

interface PlanSpec {
    key: PlanKey;
    amountUsd: number | null; // null = invalid input
    frequency: Frequency;
    startTs: number | null; // null = invalid date
    feePercentage: number;
}

interface SpecPayload {
    endTs: number | null;
    provider: PriceProvider;
    flatFeeUsd: number;
    specs: PlanSpec[];
}

interface ComputedPlan {
    key: PlanKey;
    result: DcaResult | null; // null = data unavailable for this plan
    /**
     * Set when the prices this plan ran on are not the ones asked for: the
     * other exchange's, or a copy fetched earlier. The main result says so
     * for its own series, and this panel fetches its own.
     */
    sourceNotice: string | null;
}

/**
 * An alternative plan's fields as the comparison will use them, with a
 * sentence for each one that is not being used as typed. The fields are free
 * text, so "1,000", a fee of 75 and a start date after the end all arrive
 * here, and a plan that cannot be run is a different thing from prices that
 * are missing.
 */
interface CheckedPlan {
    amountUsd: number | null;
    amountNote: string | null;
    feePercentage: number;
    feeNote: string | null;
    startTs: number | null;
    dateNote: string | null;
}

/** The same ceilings as the main form's amount and fee fields. */
const AMOUNT_LIMITS = { min: 0, max: URL_PARAM_LIMITS.maxAmount };
const FEE_LIMITS = { min: 0, max: URL_PARAM_LIMITS.maxFeePct };

const checkPlan = (plan: AltPlanState, rate: number, symbol: string, endTs: number): CheckedPlan => {
    const amount = readNumericText(plan.amountInput, AMOUNT_LIMITS);
    const amountOk = amount.value !== null && amount.value > 0;
    const fee = readNumericText(plan.feeInput, FEE_LIMITS);
    const typedStart = parseUtcDate(plan.startDate);
    // `min` on the input is not enforced for typed values in every browser, so
    // a start before the first priced day is moved up to it: left alone, it
    // would price purchases at nothing. The note below says that it happened.
    const startTs = Number.isFinite(typedStart) ? Math.max(typedStart, EARLIEST_PRICE_TS) : null;
    const dateOk = startTs !== null && Number.isFinite(endTs) && startTs <= endTs;
    return {
        // Display-currency input → USD for all internal math (spec §3)
        amountUsd: amountOk && amount.value !== null ? amount.value / rate : null,
        amountNote: !amountOk
            ? 'Enter an amount above 0, in digits only: 1000, or 12.50.'
            : amount.hit
                ? limitMessage('The amount', amount.hit, (n) => `${symbol}${n.toLocaleString('en-US')}`)
                : null,
        feePercentage: fee.value ?? 0,
        feeNote: fee.hit
            ? limitMessage('The fee', fee.hit, (n) => `${n}%`)
            : fee.value === null && plan.feeInput.trim() !== ''
                ? 'Enter the fee as a number, like 0.5. No fee is charged until then.'
                : null,
        startTs: dateOk ? startTs : null,
        dateNote: !dateOk
            ? Number.isFinite(endTs)
                ? `Pick a start date on or before ${formatUtc(endTs, 'full')}.`
                : 'Pick a start date.'
            : typedStart < EARLIEST_PRICE_TS
                ? 'Bitcoin price data starts on 18 August 2010, so this plan starts then.'
                : null,
    };
};

interface ChartRow {
    ts: number;
    a?: number;
    b?: number;
    c?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_NAMES: Record<PlanKey, string> = { a: 'Your plan', b: 'Plan B', c: 'Plan C' };

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Every 2 weeks' },
    { value: 'monthly', label: 'Monthly' },
];

const FREQUENCY_NOUN: Record<Frequency, string> = {
    daily: 'day',
    weekly: 'week',
    biweekly: '2 weeks',
    monthly: 'month',
};

const DEBOUNCE_MS = 500;
const MAX_CHART_POINTS = 300;
// slate-500 fails contrast on the dark card — same pair DcaChart documents.
const axisColor = (isDark: boolean): string => (isDark ? '#94a3b8' : '#64748b');

/** CVD-validated comparison palette (all-pairs, both modes) — do not change.
    Plan C is magenta, not violet: blue↔violet fails deutan separation in light mode. */
const planColor = (key: PlanKey, isDark: boolean): string => {
    if (key === 'a') return '#d97706';
    if (key === 'b') return isDark ? '#3987e5' : '#2a78d6';
    return isDark ? '#d55181' : '#e87ba4';
};

const finiteOrNull = (v: number): number | null => (Number.isFinite(v) ? v : null);

// 44px tall on a narrow screen or a coarse pointer: a field is a touch target
// too, and the 44px floor in globals.css only covers buttons.
const inputClass =
    'h-11 sm:h-10 pointer-coarse:h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-800 outline-none ' +
    'transition-shadow focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:text-sm pointer-coarse:text-base';

const labelClass = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

const noteClass = 'mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300';

const addButtonClass =
    'flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 ' +
    'py-2.5 text-sm font-medium text-amber-700 dark:text-amber-400 transition-colors hover:border-amber-500/60 hover:bg-amber-50 ' +
    'dark:border-slate-700 dark:text-amber-400 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/5';

// ── Tooltip (card-styled, theme-aware via dark: classes) ──────────────────────

interface TooltipEntry {
    dataKey?: string | number;
    value?: number | string;
    color?: string;
    name?: string | number;
}

function ComparisonTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: number | string;
}) {
    const { formatCurrency } = useCurrency();
    if (!active || !payload || payload.length === 0) return null;
    const entries = payload.filter((e) => typeof e.value === 'number');
    if (entries.length === 0) return null;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-1.5 font-semibold text-slate-800 dark:text-slate-100">
                {formatUtc(Number(label), 'full')}
            </p>
            <div className="space-y-1">
                {entries.map((entry) => (
                    <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: entry.color }}
                                aria-hidden="true"
                            />
                            {entry.name}
                        </span>
                        <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">
                            {formatCurrency(entry.value as number)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Editable row for an alternative plan ──────────────────────────────────────

function PlanRow({
    plan,
    checked,
    name,
    color,
    maxDate,
    onChange,
    onRemove,
}: {
    plan: AltPlanState;
    /** What the comparison makes of the fields, and what it had to change. */
    checked: CheckedPlan;
    name: string;
    color: string;
    maxDate: string;
    onChange: (patch: Partial<Pick<AltPlanState, 'amountInput' | 'frequency' | 'startDate' | 'feeInput'>>) => void;
    onRemove: () => void;
}) {
    const uid = useId();
    const { currencyConfig } = useCurrency();

    return (
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                    {name}
                </span>
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={`Remove ${name}`}
                    className="flex h-11 w-11 sm:h-9 sm:w-9 pointer-coarse:h-11 pointer-coarse:w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
            {/* Stacked below sm: a native date field cannot shrink into a ~147px column at
                the 16px font size iOS needs, and would spill out of the card. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
                <div className="min-w-0">
                    <label htmlFor={`${uid}-amount`} className={labelClass}>
                        Amount ({currencyConfig.symbol})
                    </label>
                    <input
                        id={`${uid}-amount`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={plan.amountInput}
                        onChange={(e) => onChange({ amountInput: e.target.value })}
                        aria-invalid={checked.amountUsd === null}
                        aria-describedby={checked.amountNote ? `${uid}-amount-note` : undefined}
                        className={inputClass}
                    />
                    {checked.amountNote && <p id={`${uid}-amount-note`} className={noteClass}>{checked.amountNote}</p>}
                </div>
                <div className="min-w-0">
                    <label htmlFor={`${uid}-frequency`} className={labelClass}>
                        Frequency
                    </label>
                    <select
                        id={`${uid}-frequency`}
                        value={plan.frequency}
                        onChange={(e) => onChange({ frequency: e.target.value as Frequency })}
                        className={inputClass}
                    >
                        {FREQUENCY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="min-w-0">
                    <label htmlFor={`${uid}-start`} className={labelClass}>
                        Start date
                    </label>
                    <input
                        id={`${uid}-start`}
                        type="date"
                        min={EARLIEST_PRICE_DATE}
                        max={maxDate}
                        value={plan.startDate}
                        onChange={(e) => onChange({ startDate: e.target.value })}
                        aria-invalid={checked.startTs === null}
                        aria-describedby={checked.dateNote ? `${uid}-start-note` : undefined}
                        className={clsx(inputClass, 'min-w-0')}
                    />
                    {checked.dateNote && <p id={`${uid}-start-note`} className={noteClass}>{checked.dateNote}</p>}
                </div>
                <div className="min-w-0">
                    <label htmlFor={`${uid}-fee`} className={labelClass}>
                        Fee (%)
                    </label>
                    <input
                        id={`${uid}-fee`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={plan.feeInput}
                        onChange={(e) => onChange({ feeInput: e.target.value })}
                        aria-describedby={checked.feeNote ? `${uid}-fee-note` : undefined}
                        className={inputClass}
                    />
                    {checked.feeNote && <p id={`${uid}-fee-note`} className={noteClass}>{checked.feeNote}</p>}
                </div>
            </div>
        </div>
    );
}

// ── Per-plan summary stat card ────────────────────────────────────────────────

function SummaryStat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className={clsx('text-right font-medium text-slate-800 dark:text-slate-100', valueClassName)}>{value}</dd>
        </div>
    );
}

function SummaryCard({
    name,
    color,
    descriptor,
    result,
    problem,
}: {
    name: string;
    color: string;
    descriptor: string | null;
    result: DcaResult | null;
    /** Why this plan cannot be run as typed, when that is the reason there is no result. */
    problem?: string | null;
}) {
    const { formatCurrency, formatBtcAmount } = useCurrency();

    return (
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{name}</span>
            </div>
            {descriptor && (
                <p className="mt-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{descriptor}</p>
            )}
            {result ? (
                <dl className="mt-2 space-y-1 text-xs tabular-nums">
                    <SummaryStat label="Invested" value={formatCurrency(result.totalInvested)} />
                    <SummaryStat label="Value" value={formatCurrency(result.currentValue)} />
                    <SummaryStat
                        label="ROI"
                        value={`${result.roi >= 0 ? '+' : ''}${result.roi.toFixed(1)}%`}
                        valueClassName={
                            result.roi >= 0
                                ? 'text-gain'
                                : 'text-loss'
                        }
                    />
                    {/* "Stack", not "BTC": the figure follows the Units switch. */}
                    <SummaryStat label="Stack" value={formatBtcAmount(result.btcAccumulated)} />
                </dl>
            ) : problem ? (
                // The prices are fine; the plan's own fields are not.
                <EmptyState hint={problem} className="mt-2">Nothing to show yet</EmptyState>
            ) : (
                <EmptyState className="mt-2" />
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export const PlanComparison: React.FC<{
    basePlan: BasePlan;
    simplifiedBase?: boolean;
    /** True when the plan's own end date is after `basePlan.endDate` (today). */
    stopsAtToday?: boolean;
}> = ({ basePlan, simplifiedBase, stopsAtToday }) => {
    const { currencyConfig, formatCurrency, convertFromUsd } = useCurrency();
    const isDark = useIsDark();
    const flatFeeUsd = basePlan.flatFeeUsd !== undefined && basePlan.flatFeeUsd > 0 ? basePlan.flatFeeUsd : 0;
    // formatCurrency trims trailing zeros ("$2.5"); a fee is read as money.
    const flatFeeText = formatCurrency(flatFeeUsd, 2).replace(/\.\d$/, (cents) => `${cents}0`);

    const [altPlans, setAltPlans] = useState<AltPlanState[]>([]);
    const [computed, setComputed] = useState<ComputedPlan[] | null>(null);
    const [loading, setLoading] = useState(false);

    const sortedAlts = [...altPlans].sort((x, y) => x.slot.localeCompare(y.slot));

    // ── Plan management ───────────────────────────────────────────────────────

    const addPlan = useCallback(() => {
        setAltPlans((prev) => {
            if (prev.length >= 2) return prev;
            const slot: AltSlot = prev.some((p) => p.slot === 'b') ? 'c' : 'b';
            // Sensible defaults: B doubles the amount, C switches the schedule.
            // From the default amount when the main plan buys nothing, so the
            // new row does not open on an error for a value nobody typed.
            const baseUsd = basePlan.amountUsd > 0 ? basePlan.amountUsd : DEFAULT_PLAN.amount;
            const defaultUsd = slot === 'b' ? baseUsd * 2 : baseUsd;
            const frequency: Frequency =
                slot === 'b'
                    ? basePlan.frequency
                    : basePlan.frequency === 'monthly'
                      ? 'weekly'
                      : 'monthly';
            const displayAmount = Math.round(defaultUsd * currencyConfig.rate * 100) / 100;
            return [
                ...prev,
                {
                    slot,
                    amountInput: String(displayAmount),
                    frequency,
                    startDate: basePlan.startDate,
                    feeInput: String(basePlan.feePercentage),
                },
            ];
        });
    }, [basePlan.amountUsd, basePlan.frequency, basePlan.startDate, basePlan.feePercentage, currencyConfig.rate]);

    const updateAltPlan = useCallback(
        (slot: AltSlot, patch: Partial<Pick<AltPlanState, 'amountInput' | 'frequency' | 'startDate' | 'feeInput'>>) => {
            setAltPlans((prev) => prev.map((p) => (p.slot === slot ? { ...p, ...patch } : p)));
        },
        [],
    );

    const removeAltPlan = (slot: AltSlot) => {
        const next = altPlans.filter((p) => p.slot !== slot);
        setAltPlans(next);
        if (next.length === 0) {
            // Back to the collapsed state: clear results here (event handler)
            // so the effect never needs a synchronous setState reset.
            setComputed(null);
            setLoading(false);
        }
    };

    // ── Data: debounced fetch + calculate, keyed on a value-stable string ─────
    // (a plain string dep means identical inputs never refetch, and any input
    // change restarts the 500ms debounce; the cancelled flag drops stale runs)

    const baseEndTs = parseUtcDate(basePlan.endDate);
    // One entry per plan in `sortedAlts`, in the same order.
    const checkedAlts = sortedAlts.map((plan) => checkPlan(plan, currencyConfig.rate, currencyConfig.symbol, baseEndTs));

    const specsJson =
        altPlans.length === 0
            ? null
            : JSON.stringify({
                  endTs: finiteOrNull(baseEndTs),
                  provider: basePlan.provider,
                  flatFeeUsd,
                  specs: [
                      {
                          key: 'a',
                          amountUsd: finiteOrNull(basePlan.amountUsd),
                          frequency: basePlan.frequency,
                          startTs: finiteOrNull(parseUtcDate(basePlan.startDate)),
                          feePercentage: basePlan.feePercentage,
                      },
                      ...sortedAlts.map((p, i): PlanSpec => ({
                          key: p.slot,
                          amountUsd: checkedAlts[i].amountUsd,
                          frequency: p.frequency,
                          startTs: checkedAlts[i].startTs,
                          feePercentage: checkedAlts[i].feePercentage,
                      })),
                  ],
              } satisfies SpecPayload);

    // Read through a ref so a ticking spot price values the plans correctly without
    // re-running the debounced fetch effect on every tick.
    const livePriceRef = useRef(basePlan.livePrice);
    useEffect(() => {
        livePriceRef.current = basePlan.livePrice;
    }, [basePlan.livePrice]);

    useEffect(() => {
        if (specsJson === null) return; // collapsed — removeAltPlan already cleared results
        const { endTs, provider, flatFeeUsd: flatFee, specs } = JSON.parse(specsJson) as SpecPayload;
        let cancelled = false;
        const timer = setTimeout(async () => {
            setLoading(true);
            const results = await Promise.all(
                specs.map(async (spec): Promise<ComputedPlan> => {
                    if (endTs === null || spec.startTs === null || spec.amountUsd === null || spec.amountUsd <= 0) {
                        return { key: spec.key, result: null, sourceNotice: null };
                    }
                    try {
                        const history = await getBitcoinPriceHistoryWithMeta(spec.startTs, endTs + DAY_MS, provider);
                        if (cancelled || history.data.length === 0) return { key: spec.key, result: null, sourceNotice: null };
                        const sourceNotice = [
                            priceFallbackNotice(history.requestedProvider, history.servedProvider),
                            history.stale ? priceStaleNotice(history.servedProvider, history.fetchedAt) : null,
                        ].filter(Boolean).join(' ') || null;
                        const result = calculateDca(
                            {
                                amount: spec.amountUsd,
                                frequency: spec.frequency,
                                startDate: new Date(spec.startTs),
                                endDate: new Date(endTs),
                                feePercentage: spec.feePercentage,
                                flatFee,
                                priceMode: 'api',
                                manualPrice: 0,
                            },
                            history.data,
                            livePriceRef.current,
                        );
                        return { key: spec.key, result: result.breakdown.length > 0 ? result : null, sourceNotice };
                    } catch {
                        return { key: spec.key, result: null, sourceNotice: null }; // quiet failure: card says "Data unavailable"
                    }
                }),
            );
            if (!cancelled) {
                setComputed(results);
                setLoading(false);
            }
        }, DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [specsJson]);

    // ── Chart data: merge every plan's series on UTC-day timestamps ───────────

    const chartData = useMemo<ChartRow[]>(() => {
        if (!computed) return [];
        const rows = new Map<number, ChartRow>();
        for (const plan of computed) {
            if (!plan.result) continue;
            for (const item of plan.result.breakdown) {
                const ts = utcDayStart(new Date(item.date).getTime());
                let row = rows.get(ts);
                if (!row) {
                    row = { ts };
                    rows.set(ts, row);
                }
                row[plan.key] = item.portfolioValue;
            }
        }
        const merged = [...rows.values()].sort((x, y) => x.ts - y.ts);
        if (merged.length <= MAX_CHART_POINTS) return merged;
        const step = Math.ceil(merged.length / MAX_CHART_POINTS);
        const sampled = merged.filter((_, i) => i % step === 0);
        const last = merged[merged.length - 1];
        if (sampled[sampled.length - 1] !== last) sampled.push(last);
        return sampled;
    }, [computed]);

    // Only draw plans that still exist (a just-removed plan may linger in
    // `computed` for the debounce window) and produced a result.
    const liveKeys = new Set<PlanKey>(['a', ...sortedAlts.map((p) => p.slot)]);
    const activePlans = computed?.filter((p) => p.result !== null && liveKeys.has(p.key)) ?? [];
    const sourceNotices = [...new Set(activePlans.map((p) => p.sourceNotice).filter((notice) => notice !== null))];

    // Compact currency Y ticks — always converted from USD before formatting (spec §3).
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
            // "$0.00" beside "$20k" reads as a different unit; zero is just $0.
            if (abs === 0) return `${sym}0`;
            return `${sign}${sym}${abs.toFixed(2)}`;
        },
        [convertFromUsd, currencyConfig.symbol],
    );

    // Day labels up to about a year and a half, month and year beyond, as on
    // the main chart: on a short span "Jul 26" (July 2026) repeats and reads
    // as the 26th.
    const xTickStyle =
        chartData.length > 1 && (chartData[chartData.length - 1].ts - chartData[0].ts) / DAY_MS <= 550
            ? 'monthDay'
            : 'shortMonthYear';

    // ── Display metadata ──────────────────────────────────────────────────────

    const describe = (amountUsd: number | null, frequency: Frequency): string | null =>
        amountUsd !== null && amountUsd > 0
            ? `${formatCurrency(amountUsd)} / ${FREQUENCY_NOUN[frequency]}`
            : null;

    const displayPlans: { key: PlanKey; descriptor: string | null; problem: string | null }[] = [
        {
            key: 'a',
            descriptor: describe(finiteOrNull(basePlan.amountUsd), basePlan.frequency),
            problem: basePlan.amountUsd > 0
                ? null
                : 'Your plan buys nothing on its schedule. Enter an amount above 0 in the calculator to compare it.',
        },
        ...sortedAlts.map((p, i) => {
            const checked = checkedAlts[i];
            return {
                key: p.slot,
                descriptor: describe(checked.amountUsd, p.frequency),
                // Only what stops the plan from running: a capped fee still gives a result.
                problem: checked.amountUsd === null ? checked.amountNote : checked.startTs === null ? checked.dateNote : null,
            };
        }),
    ];

    const baseStartTs = parseUtcDate(basePlan.startDate);
    const baseDescriptor = [
        describe(finiteOrNull(basePlan.amountUsd), basePlan.frequency),
        Number.isFinite(baseStartTs) ? `from ${formatUtc(baseStartTs, 'full')}` : null,
        basePlan.feePercentage > 0 ? `${basePlan.feePercentage}% fee` : null,
        flatFeeUsd > 0 ? `${flatFeeText} flat fee per buy` : null,
    ]
        .filter(Boolean)
        .join(' · ');

    const chartAriaLabel =
        chartData.length > 1
            ? `Portfolio value comparison for ${activePlans.length} plan${activePlans.length === 1 ? '' : 's'} from ${formatUtc(chartData[0].ts, 'full')} to ${formatUtc(chartData[chartData.length - 1].ts, 'full')}`
            : 'Portfolio value comparison chart';

    const gridColor = isDark ? '#1e293b' : '#f1f5f9';
    const cursorColor = isDark ? '#334155' : '#cbd5e1';

    return (
        <Card className="p-4 sm:p-5">
            <CardHeader
                icon={<GitCompare className="h-4 w-4" />}
                title="Compare Plans"
                subtitle={[
                    'What a different amount, schedule, or start date would have done.',
                    // Plan rows can only express amount/schedule/date, so when the
                    // main plan carries a starting stack or yearly increases the
                    // "Your plan" row here is the simplified version — say so
                    // rather than let two panels disagree in silence.
                    simplifiedBase && 'Plans here use your year-one amount only — starting stack and yearly increases are left out.',
                    flatFeeUsd > 0 && `Every plan pays your ${flatFeeText} flat fee on each buy, on top of its own percentage.`,
                    stopsAtToday && 'Your plan runs past today, so every plan here stops at today.',
                ].filter(Boolean).join(' ')}
            />

            {altPlans.length === 0 ? (
                // Collapsed: nothing is fetched until the user adds a plan.
                <button type="button" onClick={addPlan} className={clsx('mt-4', addButtonClass)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add a plan to compare
                </button>
            ) : (
                <div className="mt-4 space-y-4">
                    {/* Plan A reference line (read-only; edited via the main calculator) */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                            <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: planColor('a', isDark) }}
                                aria-hidden="true"
                            />
                            {PLAN_NAMES.a}
                        </span>
                        {baseDescriptor && <span className="tabular-nums">{baseDescriptor}</span>}
                    </div>

                    {/* Alternative plan editors */}
                    <div className="space-y-3">
                        {sortedAlts.map((p, i) => (
                            <PlanRow
                                key={p.slot}
                                plan={p}
                                checked={checkedAlts[i]}
                                name={PLAN_NAMES[p.slot]}
                                color={planColor(p.slot, isDark)}
                                maxDate={basePlan.endDate}
                                onChange={(patch) => updateAltPlan(p.slot, patch)}
                                onRemove={() => removeAltPlan(p.slot)}
                            />
                        ))}
                    </div>

                    {altPlans.length < 2 && (
                        <button type="button" onClick={addPlan} className={addButtonClass}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Add plan
                        </button>
                    )}

                    {/* Chart */}
                    {computed === null ? (
                        <div className="h-[260px] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden="true" />
                    ) : chartData.length > 0 ? (
                        // The legend text is coloured here: a formatter that returns an
                        // element ends up in the icon's label as "[object Object]".
                        <div
                            className={clsx(
                                'h-[260px] tabular-nums transition-opacity [&_.recharts-legend-item-text]:text-slate-500! dark:[&_.recharts-legend-item-text]:text-slate-400!',
                                loading && 'opacity-60',
                            )}
                            role="img"
                            aria-label={chartAriaLabel}
                        >
                            <ResponsiveContainer width="100%" height="100%" debounce={150} initialDimension={{ width: 358, height: 260 }}>
                                <LineChart
                                    data={chartData}
                                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                                    accessibilityLayer={false}
                                >
                                    {/* Horizontal-only SOLID hairlines (spec §2) */}
                                    <CartesianGrid vertical={false} stroke={gridColor} />
                                    <XAxis
                                        dataKey="ts"
                                        type="number"
                                        scale="time"
                                        domain={['dataMin', 'dataMax']}
                                        tickFormatter={(ts: number) => formatUtc(ts, xTickStyle)}
                                        minTickGap={40}
                                        tick={{ fontSize: 11, fill: axisColor(isDark) }}
                                        tickLine={false}
                                        axisLine={{ stroke: gridColor }}
                                    />
                                    <YAxis
                                        width={48}
                                        domain={[0, 'auto']}
                                        tickFormatter={formatAxisTick}
                                        tick={{ fontSize: 11, fill: axisColor(isDark) }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        content={<ComparisonTooltip />}
                                        cursor={{ stroke: cursorColor, strokeWidth: 1 }}
                                    />
                                    {activePlans.length >= 2 && (
                                        <Legend verticalAlign="top" height={24} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                    )}
                                    {activePlans.map((p) => (
                                        <Line
                                            key={p.key}
                                            type="monotone"
                                            dataKey={p.key}
                                            name={PLAN_NAMES[p.key]}
                                            stroke={planColor(p.key, isDark)}
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4, strokeWidth: 0 }}
                                            connectNulls
                                            isAnimationActive={false}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex h-[260px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                            {/* A plan that cannot run is not missing data. */}
                            {displayPlans.some((p) => p.problem) ? 'Nothing to chart yet' : 'Chart data unavailable'}
                        </div>
                    )}

                    {sourceNotices.map((notice) => (
                        <p key={notice} className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">{notice}</p>
                    ))}

                    {/* Per-plan summary cards */}
                    {computed !== null && (
                        <div
                            className={clsx(
                                'grid grid-cols-1 gap-3',
                                displayPlans.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
                            )}
                        >
                            {displayPlans.map((p) => (
                                <SummaryCard
                                    key={p.key}
                                    name={PLAN_NAMES[p.key]}
                                    color={planColor(p.key, isDark)}
                                    descriptor={p.descriptor}
                                    result={computed.find((c) => c.key === p.key)?.result ?? null}
                                    problem={p.problem}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
};

'use client';

import { useState, useEffect, useMemo, useCallback, useDeferredValue, useId, useRef, memo } from 'react';
import { differenceInMonths } from 'date-fns';
import { Frequency, PriceMode, AssetDcaResult, DcaStats } from '@/types';
import { useCurrency, CurrencyCode } from '@/context/CurrencyContext';
import { calculateDca, calculateLumpSum, calculateAssetDca } from '@/utils/dca';
import { getBitcoinPriceHistory, getCurrentBitcoinPriceWithFallback, getAssetPriceHistory, getCpiData, getProfitableWindows } from '@/app/actions';
import { generateCsvContent, downloadCsv } from '@/utils/csv';
import { encodeParams, decodeParams } from '@/utils/urlParams';
import {
    formatUtc,
    parseUtcDate,
    utcDayStart,
    utcFullYearsBetween,
    DAY_MS,
    EARLIEST_PRICE_DATE,
    DEFAULT_YEARS_BACK,
    utcIsoToday,
    utcIsoYearsAgo,
    utcIsoMonthsAgo,
} from '@/utils/dates';
import dynamic from 'next/dynamic';
import { SkeletonCard, SkeletonChart, SkeletonPanel } from './Skeleton';
import { AdSlot } from './AdSlot';
import { Card, chip } from './ui/Card';

// Lazy-load result sub-components — none render until after a calculation
// ssr:false is load-bearing here. Now that the calculator itself server-renders,
// without this Recharts (~370 KB) would be pulled into the homepage's server
// render and its initial script set — trading the SSR win for a much worse LCP.
// `loading` matters as much as `ssr: false` here: without it the chart renders
// null until its chunk lands, and the page reflows by the chart's full height.
const DcaChart = dynamic(() => import('./DcaChart').then(m => m.DcaChart), {
    ssr: false,
    loading: () => <SkeletonChart />,
});
const TransactionTable = dynamic(() => import('./TransactionTable').then(m => m.TransactionTable), { loading: () => <SkeletonPanel /> });
const AssetComparison = dynamic(() => import('./AssetComparison').then(m => m.AssetComparison), { loading: () => <SkeletonPanel /> });
const ExchangeFeeComparison = dynamic(() => import('./ExchangeFeeComparison').then(m => m.ExchangeFeeComparison), { loading: () => <SkeletonPanel /> });
const StackingGoalTracker = dynamic(() => import('./StackingGoalTracker').then(m => m.StackingGoalTracker), { loading: () => <SkeletonPanel /> });
const ShareMyStack = dynamic(() => import('./ShareMyStack').then(m => m.ShareMyStack), { loading: () => <SkeletonPanel /> });
const UnitBiasCalculator = dynamic(() => import('./UnitBiasCalculator').then(m => m.UnitBiasCalculator), { loading: () => <SkeletonPanel /> });
const SavingsComparison = dynamic(() => import('./SavingsComparison').then(m => m.SavingsComparison), { loading: () => <SkeletonPanel /> });
const OpportunityCostCalculator = dynamic(() => import('./OpportunityCostCalculator').then(m => m.OpportunityCostCalculator), { loading: () => <SkeletonPanel /> });
const FireCalculator = dynamic(() => import('./FireCalculator').then(m => m.FireCalculator), { loading: () => <SkeletonPanel /> });
const CostBasisTracker = dynamic(() => import('./CostBasisTracker').then(m => m.CostBasisTracker), { loading: () => <SkeletonPanel /> });
const PlanComparison = dynamic(() => import('./PlanComparison').then(m => m.PlanComparison), { loading: () => <SkeletonPanel /> });
const FutureProjection = dynamic(() => import('./FutureProjection').then(m => m.FutureProjection), { loading: () => <SkeletonPanel /> });
const DrawdownCalculator = dynamic(() => import('./DrawdownCalculator').then(m => m.DrawdownCalculator), { loading: () => <SkeletonPanel /> });
import { TrendingUp, TrendingDown, DollarSign, Activity, Download, Share2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

type Preset = { label: string; amount: number; frequency: Frequency; yearsBack?: number; monthsBack?: number; startDate?: string };

// Effective all-in cost of a RECURRING buy (fee + typical spread), as of
// August 2026 — sourced per platform in ExchangeFeeComparison. Coinbase has no
// chip: its flat fee ($2.99 on a $50 buy ≈ 6%) depends on the amount, so any
// fixed percentage here would be wrong for most inputs.
const FEE_PRESETS: { name: string; fee: number }[] = [
    { name: 'Cash App', fee: 0 },
    { name: 'Strike', fee: 0.22 },
    { name: 'River', fee: 0.25 },
    { name: 'Swan', fee: 0.5 },
    { name: 'Kraken', fee: 1 },
];

/** Round to 2 significant figures (used to keep converted quick-pick prices tidy). */
const roundTo2Sig = (n: number): number => {
    if (!Number.isFinite(n) || n <= 0) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / mag) * mag;
};

/**
 * Progressive disclosure for the secondary analysis panels.
 *
 * Fifteen panels stacked vertically was the single worst thing about this page:
 * the chart sat ~4,000px down, and every lazily-imported panel mounted at once
 * on first paint. Only the active tab renders, so the other chunks are never
 * even requested until asked for.
 *
 * Deliberately NOT a URL-synced router tab — switching tabs should not push
 * history entries that break the back button on a calculator.
 */
const RESULT_TABS = [
    { id: 'compare' as const, label: 'Compare', hint: 'How this plan did against other assets and other strategies' },
    { id: 'project' as const, label: 'Project', hint: 'What happens if you keep buying' },
    { id: 'details' as const, label: 'Details', hint: 'Every purchase, plus coins you already own' },
];

type ResultTabId = (typeof RESULT_TABS)[number]['id'];

function ResultTabs({
    compare,
    project,
    details,
}: {
    compare: React.ReactNode;
    project: React.ReactNode;
    details: React.ReactNode;
}) {
    const [active, setActive] = useState<ResultTabId>('compare');
    const baseId = useId();
    const panels: Record<ResultTabId, React.ReactNode> = { compare, project, details };

    // Roving arrow-key navigation is what the tablist pattern requires; without
    // it a keyboard user has to Tab through every tab to reach the last one.
    const onKeyDown = (e: React.KeyboardEvent) => {
        const i = RESULT_TABS.findIndex((t) => t.id === active);
        let next = i;
        if (e.key === 'ArrowRight') next = (i + 1) % RESULT_TABS.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + RESULT_TABS.length) % RESULT_TABS.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = RESULT_TABS.length - 1;
        else return;
        e.preventDefault();
        setActive(RESULT_TABS[next].id);
        document.getElementById(`${baseId}-tab-${RESULT_TABS[next].id}`)?.focus();
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            <div
                role="tablist"
                aria-label="More analysis"
                onKeyDown={onKeyDown}
                className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70"
            >
                {RESULT_TABS.map((t) => {
                    const selected = t.id === active;
                    return (
                        <button
                            key={t.id}
                            id={`${baseId}-tab-${t.id}`}
                            role="tab"
                            type="button"
                            aria-selected={selected}
                            aria-controls={`${baseId}-panel-${t.id}`}
                            tabIndex={selected ? 0 : -1}
                            aria-describedby={`${baseId}-hint`}
                            onClick={() => setActive(t.id)}
                            className={clsx(
                                'flex-1 rounded-lg px-3 py-2 text-sm transition-colors',
                                selected
                                    // The selected thumb was white on a slate-100
                                    // track — 1.096:1, so under any glare the only
                                    // marker was a sub-2% shadow, on a control that
                                    // decides which of three panels is mounted.
                                    // Carry the state on colour and weight, matching
                                    // how the nav already marks "you are here".
                                    ? 'bg-white shadow-[var(--elev-1)] font-semibold text-amber-700 dark:bg-slate-700 dark:text-amber-400'
                                    : 'font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                            )}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Visible on every device — these hints lived in title attributes,
                which touch users and screen readers never see. */}
            <p id={`${baseId}-hint`} className="-mt-2 text-xs text-slate-500 dark:text-slate-400 px-1">
                {RESULT_TABS.find((t) => t.id === active)?.hint}
            </p>

            {RESULT_TABS.map((t) => (
                <div
                    key={t.id}
                    id={`${baseId}-panel-${t.id}`}
                    role="tabpanel"
                    aria-labelledby={`${baseId}-tab-${t.id}`}
                    hidden={t.id !== active}
                    tabIndex={0}
                    // min-h is a backstop, not decoration. Every real panel is far
                    // taller than this, so it never adds dead space — but if a lazy
                    // child ever loses its loading fallback, this stops the document
                    // from collapsing and the browser from clamping the reader to the
                    // bottom of the page mid-swap.
                    className="space-y-6 sm:space-y-8 focus-visible:outline-none min-h-[420px]"
                >
                    {/* Mount only the active panel so the inactive tabs' lazy chunks
                        are never fetched. */}
                    {t.id === active && panels[t.id]}
                </div>
            ))}
        </div>
    );
}

/**
 * Numeric field that tolerates being empty while the user types.
 *
 * Binding the input straight to the number state meant clearing the field
 * snapped it back to a forced value mid-keystroke — on mobile, backspacing
 * "50" to type "75" produced "0", then "075". The text is the source of truth
 * while focused; the parsed number updates live when valid and the text
 * resnaps to the committed number on blur or when a preset/URL changes it.
 */
function useNumericInput(value: number, setValue: (n: number) => void, clamp: (n: number) => number) {
    const [text, setText] = useState<string>(() => String(value));
    const [focused, setFocused] = useState(false);
    // "Adjust state during render", not an effect: when the committed number
    // changes underneath an unfocused field (presets, shared links), the text
    // resyncs before paint instead of one frame later.
    const [lastValue, setLastValue] = useState(value);
    if (value !== lastValue) {
        setLastValue(value);
        if (!focused) setText(String(value));
    }
    return {
        value: text,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value;
            setText(raw);
            if (raw.trim() === '') return;
            const n = Number(raw);
            if (Number.isFinite(n)) setValue(clamp(n));
        },
        onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
            setFocused(true);
            e.target.select();
        },
        onBlur: () => {
            setFocused(false);
            setText(String(value));
        },
    };
}

/** Compact sats rendering for narrow columns. */
const satsShort = (btc: number): string => {
    const sats = Math.floor(btc * 100_000_000);
    if (sats >= 1_000_000_000) return `${(sats / 1_000_000_000).toFixed(2)}B sats`;
    if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M sats`;
    return `${sats.toLocaleString()} sats`;
};

export interface DcaCalculatorProps {
    /**
     * Prices for the default window, fetched on the server so the first paint
     * already shows a real result instead of a skeleton. Must cover exactly the
     * default date range — both sides derive it from utils/dates.
     */
    initialPriceData?: [number, number][];
    initialLivePrice?: number | null;
}

export const DcaCalculator = ({ initialPriceData, initialLivePrice }: DcaCalculatorProps = {}) => {
    const { currency, setCurrency, setSessionCurrency, currencyConfig, currencies, formatCurrency, formatCompact, denomination, setDenomination, formatBtcAmount } = useCurrency();
    const isSats = denomination === 'SATS';
    // UTC end to end: the engine buckets by UTC day and the default end date is
    // utcIsoToday(), so a LOCAL calendar date here mislabelled the default view
    // as a "projection" for every user west of UTC in their evening (and put a
    // different date in the server HTML than the browser produced).
    const [todayUtcTs, setTodayUtcTs] = useState(() => utcDayStart(Date.now()));

    useEffect(() => {
        const interval = setInterval(() => {
            const now = utcDayStart(Date.now());
            if (now !== todayUtcTs) {
                setTodayUtcTs(now);
            }
        }, 60_000);
        return () => clearInterval(interval);
    }, [todayUtcTs]);

    const [amount, setAmount] = useState<number>(50);
    const deferredAmount = useDeferredValue(amount);
    const [frequency, setFrequency] = useState<Frequency>('weekly');
    // Advanced plan shape: coins already held, and income-style annual raises.
    const [startingBtc, setStartingBtc] = useState<number>(0);
    const deferredStartingBtc = useDeferredValue(startingBtc);
    const [startingAvgCost, setStartingAvgCost] = useState<number>(0);
    const deferredStartingAvgCost = useDeferredValue(startingAvgCost);
    const [annualEscalationPct, setAnnualEscalationPct] = useState<number>(0);
    const deferredEscalation = useDeferredValue(annualEscalationPct);
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    // Seeded from UTC, not local time. This component now server-renders (it is no
    // longer ssr:false), and a locally-derived default put a different date in the
    // server HTML than the browser produced, tripping a hydration mismatch for
    // every visitor outside UTC.
    const [startDate, setStartDate] = useState<string>(() => utcIsoYearsAgo(DEFAULT_YEARS_BACK));
    const [endDate, setEndDate] = useState<string>(() => utcIsoToday());
    const [feePercentage, setFeePercentage] = useState<number>(0.5);
    const deferredFee = useDeferredValue(feePercentage);
    const [priceMode, setPriceMode] = useState<PriceMode>('api');
    const [manualPrice, setManualPrice] = useState<number>(50000);
    const deferredManualPrice = useDeferredValue(manualPrice);
    const [provider, setProvider] = useState<'kraken' | 'coinbase'>('kraken');
    const [priceData, setPriceData] = useState<[number, number][]>(initialPriceData ?? []);
    // The REQUESTED range of the last successful fetch — not the bar coverage of
    // priceData, which legitimately starts later than requested for early dates.
    // Lets the maths tell "computing from a superset" (fine) apart from
    // "computing from a window that doesn't cover these dates yet" (wrong totals).
    const [fetchedWindow, setFetchedWindow] = useState<{ start: string; end: string } | null>(() =>
        initialPriceData && initialPriceData.length > 0
            ? { start: utcIsoYearsAgo(DEFAULT_YEARS_BACK), end: utcIsoToday() }
            : null,
    );
    const [livePrice, setLivePrice] = useState<number | null>(initialLivePrice ?? null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const firstFetchRef = useRef(true);
    const urlAppliedRef = useRef(false);
    // When the server already supplied prices for the default window, the mount
    // fetch would re-request exactly that data and briefly blank the results.
    const skipSeededFetchRef = useRef(Boolean(initialPriceData && initialPriceData.length > 0));
    const [shareMessage, setShareMessage] = useState<string | null>(null);
    const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [sp500Data, setSp500Data] = useState<[number, number][] | null>(null);
    const [goldData, setGoldData] = useState<[number, number][] | null>(null);
    const [comparisonLoading, setComparisonLoading] = useState(false);
    const [cpiData, setCpiData] = useState<[number, number][] | null>(null);

    const applyPreset = useCallback((preset: Preset) => {
        // UTC helpers, same as the defaults and activePresetLabel below — the
        // local-date versions desynced by a day near midnight UTC, so a chip a
        // user had just clicked never highlighted.
        setAmount(preset.amount);
        setFrequency(preset.frequency);
        setEndDate(utcIsoToday());
        if (preset.startDate) {
            setStartDate(preset.startDate);
        } else if (preset.yearsBack) {
            setStartDate(utcIsoYearsAgo(preset.yearsBack));
        } else if (preset.monthsBack) {
            setStartDate(utcIsoMonthsAgo(preset.monthsBack));
        }
        setPriceMode('api');
        // A preset is a complete, reproducible scenario — clear the advanced
        // fields or two people clicking the same chip see different numbers.
        setStartingBtc(0);
        setStartingAvgCost(0);
        setAnnualEscalationPct(0);
    }, []);

    // Preset amounts are entered into the display-currency amount field, so the
    // labels carry the selected currency's symbol rather than a hardcoded '$'.
    const presetGroups = useMemo(() => {
        const s = currencyConfig.symbol;
        return [
            {
                title: 'Quick scenarios',
                presets: [
                    // The starter chip exists for people who have never DCA'd:
                    // a number small enough to feel safe, a window short enough to grasp.
                    { label: `Start small: ${s}10/week for 1 year`, amount: 10, frequency: 'weekly', yearsBack: 1 },
                    { label: `${s}50/week for 5 years`, amount: 50, frequency: 'weekly', yearsBack: 5 },
                    { label: `${s}100/week for 3 years`, amount: 100, frequency: 'weekly', yearsBack: 3 },
                    { label: `${s}200/month for 1 year`, amount: 200, frequency: 'monthly', yearsBack: 1 },
                    { label: `${s}25/week since 2013`, amount: 25, frequency: 'weekly', startDate: '2013-01-01' },
                ] as Preset[],
            },
            {
                title: 'What if I bought the peak?',
                presets: [
                    { label: `${s}50/week from 2013 peak`, amount: 50, frequency: 'weekly', startDate: '2013-12-04' },
                    { label: `${s}50/week from 2017 peak`, amount: 50, frequency: 'weekly', startDate: '2017-12-17' },
                    { label: `${s}50/week from 2021 peak`, amount: 50, frequency: 'weekly', startDate: '2021-11-10' },
                ] as Preset[],
            },
        ];
    }, [currencyConfig.symbol]);

    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        const params = decodeParams(Object.fromEntries(sp.entries()));
        if (params) {
            // Session-only override: the sharer's currency should shape THIS
            // visit, not silently overwrite the visitor's saved preference.
            if (params.currency) setSessionCurrency(params.currency as CurrencyCode);
            if (params.amount !== undefined) setAmount(params.amount);
            if (params.frequency) setFrequency(params.frequency);
            if (params.startDate) setStartDate(params.startDate);
            if (params.endDate) setEndDate(params.endDate);
            if (params.feePercentage !== undefined) setFeePercentage(params.feePercentage);
            if (params.priceMode) setPriceMode(params.priceMode);
            if (params.provider) setProvider(params.provider);
            if (params.manualPrice !== undefined) setManualPrice(params.manualPrice);
            if (params.startingBtc !== undefined) {
                setStartingBtc(params.startingBtc);
                setShowMoreOptions(true);
            }
            if (params.startingAvgCost !== undefined) setStartingAvgCost(params.startingAvgCost);
            if (params.annualEscalationPct !== undefined) {
                setAnnualEscalationPct(params.annualEscalationPct);
                setShowMoreOptions(true);
            }
            // A shared link is a single programmatic change, not typing — skip
            // the fetch debounce so the recipient isn't parked on a skeleton.
            if (params.startDate || params.endDate) urlAppliedRef.current = true;
        }
    }, [setSessionCurrency]);

    /** Label of the preset the current inputs correspond to, if any. */
    const activePresetLabel = useMemo(() => {
        const todayIso = utcIsoToday();
        if (endDate !== todayIso) return null;
        // Advanced fields change the numbers, so a chip must not claim the match.
        if (startingBtc > 0 || annualEscalationPct > 0) return null;
        for (const group of presetGroups) {
            for (const preset of group.presets) {
                if (preset.amount !== amount || preset.frequency !== frequency) continue;
                const presetStart = preset.startDate
                    ? preset.startDate
                    : preset.yearsBack
                        ? utcIsoYearsAgo(preset.yearsBack)
                        : preset.monthsBack
                            ? utcIsoMonthsAgo(preset.monthsBack)
                            : null;
                if (presetStart === startDate) return preset.label;
            }
        }
        return null;
    }, [presetGroups, amount, frequency, startDate, endDate, startingBtc, annualEscalationPct]);

    const dateError = useMemo(() => {
        if (!startDate || !endDate) return 'Pick a start date and an end date';
        if (startDate > endDate) return 'The start date has to come before the end date';
        // `min` on a date input is not enforced for typed values in every browser,
        // so guard here too rather than let the engine price the gap.
        if (startDate < EARLIEST_PRICE_DATE) return 'Bitcoin price data starts on 18 August 2010. Pick a later start date.';
        return null;
    }, [startDate, endDate]);

    useEffect(() => {
        if (priceMode !== 'api' || dateError) {
            // A fetch cancelled mid-flight never reaches its finally, so the
            // flag must be cleared here or Manual mode (and date errors) can
            // inherit a skeleton that nothing will ever dismiss.
            setLoading(false);
            return;
        }
        let cancelled = false;
        const fetchPrices = async () => {
            setLoading(true);
            setError(null);
            try {
                const startTs = new Date(startDate).getTime();
                const endTs = new Date(endDate).getTime();
                // The spot quote must not sink a successful history fetch: with
                // history in hand the engine values the stack at the last bar
                // (correctly dated for XIRR), which beats an error card.
                const [history, current] = await Promise.all([
                    getBitcoinPriceHistory(startTs, endTs + 86400000, provider),
                    getCurrentBitcoinPriceWithFallback(provider).catch(() => null),
                ]);
                if (cancelled) return;
                setPriceData(history);
                setFetchedWindow({ start: startDate, end: endDate });
                setLivePrice(current);
            } catch {
                if (cancelled) return;
                // Be honest: don't silently price everything at the manual default.
                setPriceData([]);
                setFetchedWindow(null);
                setLivePrice(null);
                setError("We can't reach the live price data right now, so there are no results to show. Try again, or switch to Manual mode.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        // Server-seeded prices already cover this exact window — nothing to fetch.
        if (skipSeededFetchRef.current) {
            skipSeededFetchRef.current = false;
            firstFetchRef.current = false;
            return () => {
                cancelled = true;
            };
        }
        // The debounce exists to absorb typing in the date/amount fields. On the
        // very first run there is nothing to absorb, and paying it delayed the
        // first result by 500ms for every visitor. A decoded share link is the
        // same situation: one programmatic change, no typing to absorb.
        if (firstFetchRef.current || urlAppliedRef.current) {
            firstFetchRef.current = false;
            urlAppliedRef.current = false;
            fetchPrices();
            return () => {
                cancelled = true;
            };
        }
        const timer = setTimeout(fetchPrices, 500);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [startDate, endDate, priceMode, provider, dateError, retryToken]);

    useEffect(() => {
        if (priceMode !== 'api' || dateError) {
            setSp500Data(null);
            setGoldData(null);
            setCpiData(null);
            // Same stuck-flag hazard as the price fetch above.
            setComparisonLoading(false);
            return;
        }
        let cancelled = false;
        const fetchComparison = async () => {
            setComparisonLoading(true);
            try {
                const startTs = new Date(startDate).getTime();
                const endTs = new Date(endDate).getTime() + 86400000;
                const [sp500, gold, cpi] = await Promise.all([
                    // ^SP500TR is the TOTAL RETURN index — it reinvests dividends.
                    // ^GSPC is price-only, which understated the S&P by roughly
                    // 1.5-2%/yr compounded and quietly flattered Bitcoin in every
                    // comparison. Falls back to ^GSPC if Yahoo has no TR data.
                    getAssetPriceHistory('^SP500TR', startTs, endTs).then(
                        (d) => (d && d.length > 0 ? d : getAssetPriceHistory('^GSPC', startTs, endTs)),
                    ),
                    getAssetPriceHistory('GC=F', startTs, endTs),
                    getCpiData(startTs, endTs),
                ]);
                if (cancelled) return;
                setSp500Data(sp500);
                setGoldData(gold);
                setCpiData(cpi);
            } catch {
                if (cancelled) return;
                setSp500Data(null);
                setGoldData(null);
                setCpiData(null);
            } finally {
                if (!cancelled) setComparisonLoading(false);
            }
        };
        const timer = setTimeout(fetchComparison, 600);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [startDate, endDate, priceMode, dateError]);

    const amountUsd = useMemo(() => deferredAmount / currencyConfig.rate, [deferredAmount, currencyConfig.rate]);

    const isFutureEndDate = parseUtcDate(endDate) > todayUtcTs;

    // Starting-stack cost is entered per-BTC in the display currency.
    const startingAvgCostUsd = useMemo(
        () => (deferredStartingAvgCost > 0 ? deferredStartingAvgCost / currencyConfig.rate : undefined),
        [deferredStartingAvgCost, currencyConfig.rate],
    );

    const results = useMemo(() => {
        if (dateError) {
            return { totalInvested: 0, btcAccumulated: 0, averageCost: 0, currentValue: 0, profit: 0, roi: 0, breakdown: [] };
        }
        return calculateDca({ amount: amountUsd, frequency, startDate: new Date(startDate), endDate: new Date(endDate), feePercentage: deferredFee, priceMode, manualPrice: deferredManualPrice, startingBtc: deferredStartingBtc, startingAvgCost: startingAvgCostUsd, annualEscalationPct: deferredEscalation }, priceData, priceMode === 'api' ? livePrice : undefined);
    }, [amountUsd, frequency, startDate, endDate, deferredFee, priceMode, deferredManualPrice, deferredStartingBtc, startingAvgCostUsd, deferredEscalation, priceData, livePrice, dateError]);

    // Past-only run (end date capped at today). calculateDca already includes the
    // future leg at the last known price when the end date is in the future, so
    // FutureProjection must receive these figures — not the full-range ones — or
    // every future purchase would be counted twice.
    const pastResults = useMemo(() => {
        if (dateError || !isFutureEndDate) return results;
        return calculateDca(
            { amount: amountUsd, frequency, startDate: new Date(startDate), endDate: new Date(todayUtcTs), feePercentage: deferredFee, priceMode, manualPrice: deferredManualPrice, startingBtc: deferredStartingBtc, startingAvgCost: startingAvgCostUsd, annualEscalationPct: deferredEscalation },
            priceData,
            priceMode === 'api' ? livePrice : undefined
        );
    }, [results, dateError, isFutureEndDate, amountUsd, frequency, startDate, todayUtcTs, deferredFee, priceMode, deferredManualPrice, deferredStartingBtc, startingAvgCostUsd, deferredEscalation, priceData, livePrice]);

    // Schedule-only view of the result, for panels whose comparison has no
    // "coins already held" analogue (savings, lump sum, exchange fees).
    // Stack value separates exactly: it owns startingBtc/totalBtc of the coins.
    const stackCost = results.stats?.startingStackCost ?? 0;
    const stackShare = deferredStartingBtc > 0 && results.btcAccumulated > 0
        ? Math.min(1, deferredStartingBtc / results.btcAccumulated)
        : 0;
    const scheduledOnly = useMemo(() => {
        const invested = Math.max(0, results.totalInvested - stackCost);
        const value = results.currentValue * (1 - stackShare);
        return {
            invested,
            value,
            roi: invested > 0 ? ((value - invested) / invested) * 100 : 0,
            profit: value - invested,
        };
    }, [results.totalInvested, results.currentValue, stackCost, stackShare]);

    const lumpSumResult = useMemo(() => {
        if (priceMode !== 'api' || !priceData.length || !livePrice || dateError) return null;
        // Schedule money only: lump-summing the stack's cost at the WINDOW-START
        // price against stack coins bought years earlier hands the DCA side all
        // the pre-window appreciation and decides the panel by the stack.
        return calculateLumpSum(scheduledOnly.invested, new Date(startDate), priceData, livePrice, deferredFee);
    }, [priceMode, priceData, livePrice, scheduledOnly.invested, startDate, dateError, deferredFee]);

    const sp500Result: AssetDcaResult | null = useMemo(() => {
        if (!sp500Data) return null;
        return calculateAssetDca(amountUsd, frequency, new Date(startDate), new Date(endDate), deferredFee, sp500Data, '^SP500TR', 'S&P 500 (total return)', deferredEscalation);
    }, [sp500Data, amountUsd, frequency, startDate, endDate, deferredFee, deferredEscalation]);

    const goldResult: AssetDcaResult | null = useMemo(() => {
        if (!goldData) return null;
        return calculateAssetDca(amountUsd, frequency, new Date(startDate), new Date(endDate), deferredFee, goldData, 'GC=F', 'Gold', deferredEscalation);
    }, [goldData, amountUsd, frequency, startDate, endDate, deferredFee, deferredEscalation]);

    // The comparison panel's BTC row is valued at the BTC window series' own
    // last bar — the same semantics calculateAssetDca gives S&P/gold. Reusing
    // the headline figures here valued BTC at TODAY's spot against comparators
    // frozen at the window-end close, so a 2017→2019 backtest was "won" by
    // years of post-window appreciation only one side received.
    const btcAssetResult: AssetDcaResult = useMemo(() => {
        // Schedule only — no starting stack. The comparators have no analogue of
        // "coins already held", so including it would decide the panel by the
        // stack, not the plan. Escalation IS passed: all three assets get the
        // same deposit stream.
        const windowResult = dateError
            ? results
            : calculateDca(
                { amount: amountUsd, frequency, startDate: new Date(startDate), endDate: new Date(endDate), feePercentage: deferredFee, priceMode, manualPrice: deferredManualPrice, annualEscalationPct: deferredEscalation },
                priceData,
                undefined,
            );
        return {
            asset: 'BTC', label: 'Bitcoin', totalInvested: windowResult.totalInvested, currentValue: windowResult.currentValue,
            profit: windowResult.profit, roi: windowResult.roi,
            breakdown: windowResult.breakdown.map(b => ({ date: b.date, portfolioValue: b.portfolioValue })),
        };
    }, [results, dateError, amountUsd, frequency, startDate, endDate, deferredFee, priceMode, deferredManualPrice, deferredEscalation, priceData]);

    // Scheduled market buys only. The starting stack's breakdown row is a
    // position, not a purchase — counting it made every "N purchases" surface,
    // the fee panel's per-buy math, and the share receipt over-count by one.
    const purchaseCount = results.breakdown.length > 0 && results.breakdown[0].isStartingStack
        ? results.breakdown.length - 1
        : results.breakdown.length;

    // With escalation, "keep buying" projections must start from what the plan
    // pays TODAY, not the year-one amount.
    const currentAmountUsd = useMemo(() => {
        if (deferredEscalation <= 0) return amountUsd;
        const startTs = parseUtcDate(startDate);
        if (!Number.isFinite(startTs) || startTs >= todayUtcTs) return amountUsd;
        return amountUsd * Math.pow(1 + deferredEscalation / 100, utcFullYearsBetween(startTs, todayUtcTs));
    }, [amountUsd, deferredEscalation, startDate, todayUtcTs]);

    const durationText = useMemo(() => {
        if (results.breakdown.length < 2) return null;
        const first = new Date(results.breakdown[0].date);
        const last = new Date(results.breakdown[results.breakdown.length - 1].date);
        const totalMonths = differenceInMonths(last, first);
        const years = Math.floor(totalMonths / 12);
        const months = totalMonths % 12;
        if (years > 0 && months > 0) return `${years}y ${months}mo`;
        if (years > 0) return `${years}y`;
        return `${months}mo`;
    }, [results.breakdown]);

    const inflationStats = useMemo(() => {
        if (!cpiData || cpiData.length < 2) return null;
        const startCpi = cpiData[0][1];
        const endCpi = cpiData[cpiData.length - 1][1];
        if (startCpi <= 0 || endCpi <= 0) return null;
        const adjustmentFactor = startCpi / endCpi;
        const adjustedValue = results.currentValue * adjustmentFactor;
        const adjustedProfit = adjustedValue - results.totalInvested;
        const adjustedRoi = results.totalInvested > 0 ? (adjustedProfit / results.totalInvested) * 100 : 0;
        const cumulativeInflation = ((endCpi - startCpi) / startCpi) * 100;
        return { adjustedValue, adjustedProfit, adjustedRoi, cumulativeInflation };
    }, [cpiData, results.currentValue, results.totalInvested]);

    const isProfit = results.profit >= 0;

    const handleExportCsv = useCallback(() => {
        if (results.breakdown.length === 0) return;
        const csv = generateCsvContent(results.breakdown, { code: currencyConfig.code, rate: currencyConfig.rate });
        downloadCsv(csv, `bitcoin-dca-${startDate}-to-${endDate}.csv`);
    }, [results.breakdown, startDate, endDate, currencyConfig.code, currencyConfig.rate]);

    const handleShare = useCallback(async () => {
        const paramStr = encodeParams({ amount, frequency, startDate, endDate, feePercentage, priceMode, provider, manualPrice, currency: currencyConfig.code, startingBtc, startingAvgCost, annualEscalationPct });
        // /share serves a result-specific OG card to link unfurlers, then forwards
        // humans to the calculator with the same params.
        const url = `${window.location.origin}/share?${paramStr}`;
        if (typeof navigator.share === 'function') {
            try {
                await navigator.share({ title: 'Bitcoin DCA Calculator', url });
                return;
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') return;
                // fall through to the clipboard path
            }
        }
        if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
        try {
            await navigator.clipboard.writeText(url);
            setShareMessage('Link copied to your clipboard');
        } catch {
            setShareMessage("Couldn't copy the link");
        }
        shareTimerRef.current = setTimeout(() => setShareMessage(null), 2000);
    }, [amount, frequency, startDate, endDate, feePercentage, priceMode, provider, manualPrice, currencyConfig.code, startingBtc, startingAvgCost, annualEscalationPct]);

    /**
     * Mirror the current settings into the address bar.
     *
     * Copying the URL is how people actually share a result, and until now the
     * bar always read "/" no matter what was on screen — the only way to get a
     * shareable link was to find the share button. replaceState (not pushState)
     * so configuring the calculator never fills up the back button.
     */
    useEffect(() => {
        if (dateError) return;
        const timer = setTimeout(() => {
            const params = encodeParams({
                amount, frequency, startDate, endDate,
                feePercentage, priceMode, provider, manualPrice,
                currency: currencyConfig.code,
                startingBtc, startingAvgCost, annualEscalationPct,
            });
            window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
        }, 400);
        return () => clearTimeout(timer);
    }, [amount, frequency, startDate, endDate, feePercentage, priceMode, provider, manualPrice, currencyConfig.code, startingBtc, startingAvgCost, annualEscalationPct, dateError]);

    const handleRetry = useCallback(() => setRetryToken(t => t + 1), []);

    const amountField = useNumericInput(amount, setAmount, (n) => Math.min(1e9, Math.max(0, n)));
    const feeField = useNumericInput(feePercentage, setFeePercentage, (n) => Math.min(50, Math.max(0, n)));
    const manualPriceField = useNumericInput(manualPrice, setManualPrice, (n) => Math.min(1e9, Math.max(1, n)));
    const startingBtcField = useNumericInput(startingBtc, setStartingBtc, (n) => Math.min(21_000_000, Math.max(0, n)));
    const startingCostField = useNumericInput(startingAvgCost, setStartingAvgCost, (n) => Math.min(1e9, Math.max(0, n)));
    const escalationField = useNumericInput(annualEscalationPct, setAnnualEscalationPct, (n) => Math.min(200, Math.max(0, n)));

    // In API mode with no data, results would be silently priced at the manual
    // default — never show those phantom numbers. A range that EXTENDS beyond
    // the last fetched window counts as missing too: computing from the stale
    // partial window briefly showed wrong totals until the refetch landed.
    // (A shrunk range computes correctly from superset data and keeps rendering.)
    const rangeExtendsFetched = fetchedWindow !== null
        && (startDate < fetchedWindow.start || endDate > fetchedWindow.end);
    const apiDataMissing = priceMode === 'api' && !dateError
        && (priceData.length === 0 || rangeExtendsFetched);
    const showSkeleton = loading || (apiDataMissing && !error);
    const showEmptyError = !loading && apiDataMissing && !!error;

    const profitClass = isProfit ? 'text-gain' : 'text-loss';

    return (
        <div className="space-y-6 sm:space-y-8">
            {/*
              Results update silently for screen-reader users: changing an input
              re-renders the cards with no announcement, so there is no way to
              tell the calculation finished. This lives outside the results
              subtree that gets swapped for the skeleton, so it survives loading
              states and is not re-announced wholesale on every re-render.
            */}
            <div role="status" aria-live="polite" className="sr-only">
                {showSkeleton
                    ? 'Calculating…'
                    : showEmptyError
                        ? 'Price data unavailable.'
                        : purchaseCount > 0
                            ? `${purchaseCount} purchases. Invested ${formatCurrency(results.totalInvested)}, now worth ${formatCurrency(results.currentValue)}, a ${results.roi >= 0 ? 'gain' : 'loss'} of ${results.roi.toFixed(1)} percent.`
                            : ''}
            </div>

            {/* Input Section */}
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <h2 className="text-lg sm:text-xl font-bold mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-500 shrink-0" />
                    Your plan
                </h2>

                {/* Presets */}
                <div className="space-y-3 mb-5 sm:mb-6">
                    {presetGroups.map((group) => (
                        <div key={group.title}>
                            <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                {group.title}
                            </div>
                            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                {group.presets.map((preset) => {
                                    // Reflect which preset the current inputs match, so
                                    // clicking one gives visible feedback instead of the
                                    // chips looking permanently inert.
                                    const isActive = activePresetLabel === preset.label;
                                    return (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => applyPreset(preset)}
                                            aria-pressed={isActive}
                                            className={chip(isActive)}
                                        >
                                            {preset.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 2-up on phones rather than 1-up: six full-width stacked fields
                    pushed the actual result most of a screen further down. */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 overflow-hidden">
                    {/* Amount */}
                    <div className="space-y-1.5">
                        <label htmlFor="dca-amount" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Amount ({currencyConfig.code})</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-sm">{currencyConfig.symbol}</span>
                            <input
                                id="dca-amount"
                                type="number"
                                inputMode="decimal"
                                {...amountField}
                                className="w-full pl-7 pr-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors"
                            />
                        </div>
                    </div>

                    {/* Frequency */}
                    <div className="space-y-1.5">
                        <label htmlFor="dca-frequency" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Frequency</label>
                        <select
                            id="dca-frequency"
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as Frequency)}
                            className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors"
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Bi-weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </div>

                    {/* Fee */}
                    <div className="space-y-1.5">
                        <label htmlFor="dca-fee" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Fee (%)</label>
                        <input
                            id="dca-fee"
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={0}
                            max={50}
                            {...feeField}
                            className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors"
                        />
                    </div>

                    {/* Exchange presets span the full row. Nested inside the Fee cell
                        they were squeezed into a half-width column on phones and
                        stacked five rows deep, adding ~120px before the date fields. */}
                    <div className="col-span-2 lg:col-span-3">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Exchange presets</div>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Exchange fee presets">
                            {FEE_PRESETS.map((p) => (
                                <button
                                    key={p.name}
                                    type="button"
                                    onClick={() => setFeePercentage(p.fee)}
                                    aria-pressed={feePercentage === p.fee}
                                    className={chip(feePercentage === p.fee)}
                                >
                                    {p.name} {p.fee}%
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Currency */}
                    <div className="space-y-1.5">
                        <label htmlFor="dca-currency" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Currency</label>
                        <select
                            id="dca-currency"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                            className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors"
                        >
                            {currencies.map(c => (
                                <option key={c.code} value={c.code}>{c.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Start Date */}
                    <div className="space-y-1.5 min-w-0 overflow-hidden">
                        <label htmlFor="dca-start-date" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Start Date</label>
                        <input
                            id="dca-start-date"
                            type="date"
                            value={startDate}
                            min={EARLIEST_PRICE_DATE}
                            max={endDate || undefined}
                            onChange={(e) => setStartDate(e.target.value)}
                            aria-invalid={!!dateError}
                            aria-describedby={dateError ? 'dca-date-error' : undefined}
                            className={clsx(
                                "w-full min-w-0 max-w-full appearance-none box-border px-2 sm:px-3 py-2 text-base sm:text-sm rounded-lg border bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors min-h-[38px]",
                                dateError ? "border-rose-400 dark:border-rose-600" : "border-slate-200 dark:border-slate-700"
                            )}
                        />
                    </div>

                    {/* End Date */}
                    <div className="space-y-1.5 min-w-0 overflow-hidden">
                        <label htmlFor="dca-end-date" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">End Date</label>
                        <input
                            id="dca-end-date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            aria-invalid={!!dateError}
                            aria-describedby={dateError ? 'dca-date-error' : undefined}
                            className={clsx(
                                "w-full min-w-0 max-w-full appearance-none box-border px-2 sm:px-3 py-2 text-base sm:text-sm rounded-lg border bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors min-h-[38px]",
                                dateError ? "border-rose-400 dark:border-rose-600" : "border-slate-200 dark:border-slate-700"
                            )}
                        />
                        {dateError && <p id="dca-date-error" className="text-xs text-loss">{dateError}</p>}
                    </div>

                    {/* Price Mode + Provider */}
                    <div className="space-y-3 sm:col-span-2 lg:col-span-1">
                        <div className="space-y-1.5">
                            <span id="dca-price-mode-label" className="block text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Price Mode</span>
                            <div role="group" aria-labelledby="dca-price-mode-label" className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setPriceMode('api')}
                                    aria-pressed={priceMode === 'api'}
                                    className={clsx(
                                        "flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors",
                                        priceMode === 'api'
                                            ? "bg-white dark:bg-slate-700 shadow-sm text-amber-700 dark:text-amber-400"
                                            : "text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                                    )}
                                >
                                    Live
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPriceMode('manual')}
                                    aria-pressed={priceMode === 'manual'}
                                    className={clsx(
                                        "flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors",
                                        priceMode === 'manual'
                                            ? "bg-white dark:bg-slate-700 shadow-sm text-amber-700 dark:text-amber-400"
                                            : "text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                                    )}
                                >
                                    Manual
                                </button>
                            </div>
                        </div>

                        {priceMode === 'api' && (
                            <div className="fade-in">
                                <label htmlFor="dca-provider" className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Price source</label>
                                <select
                                    id="dca-provider"
                                    value={provider}
                                    onChange={(e) => setProvider(e.target.value as 'kraken' | 'coinbase')}
                                    className="w-full text-base sm:text-sm px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:border-amber-500 transition-colors"
                                >
                                    <option value="kraken">Kraken</option>
                                    <option value="coinbase">Coinbase</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {priceMode === 'manual' && (
                        <div className="space-y-1.5 fade-in sm:col-span-2 lg:col-span-1">
                            <label htmlFor="dca-manual-price" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Avg. BTC Price (USD)</label>
                            <input
                                id="dca-manual-price"
                                type="number"
                                inputMode="decimal"
                                {...manualPriceField}
                                className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors"
                            />
                        </div>
                    )}

                    {/* Advanced plan shape, collapsed by default: most visitors never
                        need it, and three extra fields would push the results further
                        down every phone screen. */}
                    <div className="col-span-2 lg:col-span-3">
                        <button
                            type="button"
                            onClick={() => setShowMoreOptions(v => !v)}
                            aria-expanded={showMoreOptions}
                            aria-controls="dca-more-options"
                            className="flex min-h-11 items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                        >
                            <span aria-hidden="true" className={clsx('inline-block transition-transform text-[10px]', showMoreOptions && 'rotate-90')}>▶</span>
                            More options
                            <span className="font-normal text-slate-500 dark:text-slate-400">— starting stack, yearly increase</span>
                        </button>
                        {showMoreOptions && (
                            <div id="dca-more-options" className="mt-2 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 fade-in">
                                <div className="space-y-1.5">
                                    <label htmlFor="dca-starting-btc" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Starting stack (BTC)</label>
                                    <input
                                        id="dca-starting-btc"
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        {...startingBtcField}
                                        className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors"
                                    />
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Coins you already hold</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="dca-starting-cost" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Its avg. cost ({currencyConfig.code})</label>
                                    <input
                                        id="dca-starting-cost"
                                        type="number"
                                        inputMode="decimal"
                                        {...startingCostField}
                                        className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors"
                                    />
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Per BTC. Blank = priced at your start date</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="dca-escalation" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Yearly increase (%)</label>
                                    <input
                                        id="dca-escalation"
                                        type="number"
                                        inputMode="decimal"
                                        step="1"
                                        {...escalationField}
                                        className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors"
                                    />
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Buy amount grows each year, like a raise</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer bar */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
                    <div className="flex items-center gap-2">
                        {/* Every other label in this component branches on the end
                            date; this one was hardcoded "Projected", so a historical
                            backtest — the default — labelled money already spent as a
                            forecast. */}
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                            {isFutureEndDate ? 'Total to Invest' : 'Total Invested'}
                        </span>
                        <span className="text-base sm:text-lg font-bold text-slate-800 dark:text-white tabular-nums">{formatCurrency(results.totalInvested)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleShare}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            title="Share calculator settings"
                            aria-label="Share calculator settings"
                        >
                            <Share2 className="w-4 h-4" />
                        </button>
                        {results.breakdown.length > 0 && (
                            <button
                                onClick={handleExportCsv}
                                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                title="Export to CSV"
                                aria-label="Export transaction history to CSV"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
                <div role="status" aria-live="polite">
                    {shareMessage && <div className="mt-2 text-xs sm:text-sm text-gain fade-in">{shareMessage}</div>}
                </div>
            </div>

            {/* Loading / Error / Results */}
            {showSkeleton ? (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                    <SkeletonChart />
                </>
            ) : showEmptyError ? (
                <Card className="p-6 sm:p-10 text-center fade-in">
                    <p role="status" aria-live="polite" className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                        {error}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" aria-hidden="true" />
                            Retry
                        </button>
                        <button
                            type="button"
                            onClick={() => setPriceMode('manual')}
                            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Use Manual mode
                        </button>
                    </div>
                </Card>
            ) : (
                <>
                    {/* Denomination — display only, every BTC figure below follows it.
                        No negative margins here: they let this row collide with the result cards. */}
                    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                        <span id="dca-denomination-label" className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Units
                        </span>
                        <div
                            role="group"
                            aria-labelledby="dca-denomination-label"
                            className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5"
                        >
                            {(['BTC', 'SATS'] as const).map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => setDenomination(d)}
                                    aria-pressed={denomination === d}
                                    className={clsx(
                                        'min-h-[24px] rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                        denomination === d
                                            ? 'bg-white dark:bg-slate-700 shadow-sm text-amber-700 dark:text-amber-400'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                    )}
                                >
                                    {d === 'BTC' ? 'BTC' : 'sats'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Hero result.
                        Four equal cards made the visitor hunt for the one number they
                        came for. This states it once, large, with the supporting
                        figures subordinate to it — and puts Share next to the result
                        instead of a thousand pixels further down the page. */}
                    {purchaseCount > 0 && (
                        // @container establishes the query context the hero figure's
                        // cqw sizing resolves against.
                        <Card celebrated className="@container p-5 sm:p-8 text-center fade-in">
                            <p className="text-xs sm:text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {isFutureEndDate ? 'Projected value at today’s price' : 'Worth today'}
                            </p>
                            {/* The exact figure, never abbreviated — this is the whole
                                point of the page, and "$19.9K" hides the number the
                                visitor came for. clamp() scales it to fit instead of
                                switching to a compact form on small screens.

                                Sized in `cqw` (container width), not `vw`: at 11vw the
                                clamp hit its 3.75rem ceiling at a 545px viewport, so
                                on every desktop it was a flat 60px that scaled with
                                the WINDOW while the thing constraining it is the CARD.
                                leading-[1.05] rather than leading-tight — at 60px,
                                1.25 leading puts ~30px of empty box around a single
                                line of digits whose ink is only ~44px tall, so the
                                figure read as floating. Tracking is -0.022em, the
                                display end of Inter's curve. */}
                            <p className="mt-1.5 text-[clamp(2rem,9cqw,4.5rem)] leading-[1.05] tracking-[-0.022em] font-extrabold text-slate-900 dark:text-[var(--text-strong)] tabular-nums">
                                {formatCurrency(results.currentValue)}
                            </p>
                            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
                                from <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{formatCurrency(results.totalInvested)}</span> invested
                                {' · '}
                                <span className={clsx('font-semibold tabular-nums', profitClass)}>
                                    {results.profit >= 0 ? '+' : ''}{formatCurrency(results.profit)} ({results.roi >= 0 ? '+' : ''}{results.roi.toFixed(1)}%)
                                </span>
                            </p>
                            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleShare}
                                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
                                >
                                    <Share2 className="h-4 w-4" aria-hidden="true" />
                                    Share this result
                                </button>
                                {results.breakdown.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleExportCsv}
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        <Download className="h-4 w-4" aria-hidden="true" />
                                        CSV
                                    </button>
                                )}
                            </div>
                        </Card>
                    )}

                    {/* Result Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        <ResultCard
                            label={isFutureEndDate ? "Total to Invest" : "Total Invested"}
                            value={results.totalInvested}
                            format={formatCurrency}
                            formatShort={formatCompact}
                        />
                        <ResultCard
                            label={isSats ? (isFutureEndDate ? "Sats to Accumulate" : "Sats Accumulated") : (isFutureEndDate ? "BTC to Accumulate" : "BTC Accumulated")}
                            value={results.btcAccumulated}
                            format={formatBtcAmount}
                            /* Sats strings blow out a half-width card on mobile — abbreviate below sm. */
                            formatShort={(n) => isSats ? satsShort(n) : `${n < 1 ? n.toFixed(4) : n.toFixed(2)} ₿`}
                            subValue={isFutureEndDate ? "at today’s price" : `Avg: ${formatCurrency(results.averageCost)}`}
                        />
                        <ResultCard
                            label={isFutureEndDate ? "Value at Current Price" : "Current Value"}
                            value={results.currentValue}
                            format={formatCurrency}
                            formatShort={formatCompact}
                            subValue={priceMode === 'api' && livePrice ? `@ ${formatCurrency(livePrice)}` : undefined}
                            subValueClassName="text-amber-700 dark:text-amber-400 font-medium"
                            /* Deliberately NOT `celebrated`. The accent rule means
                               "this is the answer", and the hero card above already
                               carries it — for the very same figure. Firing it twice
                               within 150px halves what it signals. */
                            icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />}
                        />
                        <ResultCard
                            label={isFutureEndDate ? "Projected Gain" : "Profit / Loss"}
                            value={results.profit}
                            format={(n) => `${n >= 0 ? '+' : ''}${formatCurrency(n)}`}
                            formatShort={(n) => `${n >= 0 ? '+' : ''}${formatCompact(n)}`}
                            valueClassName={profitClass}
                            icon={isProfit
                                ? <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-gain shrink-0" />
                                : <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-loss shrink-0" />}
                            subValue={isFutureEndDate ? "if the price holds" : `${results.roi.toFixed(1)}% ROI`}
                            subValueClassName={profitClass}
                        />
                    </div>

                    {/* Stats strip (historical figures — capped at today when the end date is in the future) */}
                    {pastResults.stats && pastResults.breakdown.length > 0 && (
                        <StatsStrip stats={pastResults.stats} />
                    )}

                    {/* Historical profitability of comparable windows */}
                    {purchaseCount > 0 && priceMode === 'api' && (
                        <ProfitableWindows frequency={frequency} startDate={startDate} endDate={endDate} />
                    )}

                    {/* Stats Banner */}
                    {purchaseCount > 0 && (
                        <div className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 py-1">
                            <p className="flex flex-wrap justify-center gap-x-1 gap-y-0.5">
                                <span>{purchaseCount} purchases{durationText ? ` over ${durationText}` : ''}</span>
                                {results.btcAccumulated > 0 && (
                                    <>
                                        <span className="hidden sm:inline mx-1">|</span>
                                        <span>
                                            <span className="font-medium text-amber-700 dark:text-amber-400 tabular-nums">
                                                {isSats
                                                    ? Math.floor(results.btcAccumulated * 100_000_000).toLocaleString('en-US')
                                                    : (results.btcAccumulated < 1 ? results.btcAccumulated.toFixed(4) : results.btcAccumulated.toFixed(2))}
                                            </span> of {isSats ? '2.1 quadrillion sats' : '21M BTC'}
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    )}

                    {/* Result Explainer */}
                    {purchaseCount > 0 && (
                        <p className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto">
                            {isFutureEndDate ? (
                                <>
                                    Buy {currencyConfig.symbol}{amount.toLocaleString()} of Bitcoin every {frequency === 'daily' ? 'day' : frequency === 'biweekly' ? 'two weeks' : frequency.replace('ly', '')} from{' '}
                                    {formatUtc(parseUtcDate(startDate), 'monthYear')} to {formatUtc(parseUtcDate(endDate), 'monthYear')} and you will spend{' '}
                                    {formatCurrency(results.totalInvested)}. That buys{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{formatBtcAmount(results.btcAccumulated)}</span>,
                                    worth {formatCurrency(results.currentValue)} at today&apos;s price.
                                </>
                            ) : (
                                <>
                                    Buying {currencyConfig.symbol}{amount.toLocaleString()} of Bitcoin every {frequency === 'daily' ? 'day' : frequency === 'biweekly' ? 'two weeks' : frequency.replace('ly', '')} from{' '}
                                    {formatUtc(parseUtcDate(startDate), 'monthYear')} to {formatUtc(parseUtcDate(endDate), 'monthYear')} would have cost you{' '}
                                    {formatCurrency(results.totalInvested)}. It would have bought{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{formatBtcAmount(results.btcAccumulated)}</span>,{' '}
                                    worth{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{formatCurrency(results.currentValue)}</span>{' '}
                                    today. That is a <span className={clsx("font-medium", isProfit ? "text-gain" : "text-loss")}>{results.roi.toFixed(1)}% return</span>.
                                </>
                            )}
                        </p>
                    )}

                    {/* Chart — moved up from below six analysis panels. It is the
                        second thing a visitor wants after the headline number, and it
                        was previously about 4,000px down the page. */}
                    <DcaChart data={results.breakdown} unit={denomination} />

                    {/* Ad Slot (after the chart — never between the form and its results) */}
                    <AdSlot className="min-h-[100px] flex justify-center" />

                    {/* Everything below is secondary analysis. Fifteen panels stacked
                        vertically buried the useful parts and forced every lazy chunk
                        to load at once; behind tabs, only the active panel mounts. */}
                    <ResultTabs
                        compare={
                            <>
                    {/* Inflation-Adjusted Returns */}
                    {inflationStats && (
                        <div className="bg-white dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-slate-200 dark:border-slate-800 fade-in">
                            <div className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center mb-2">
                                Real value: what it is worth after inflation, using CPI over the whole period
                            </div>
                            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center text-xs sm:text-sm">
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Real Value</div>
                                    <div className="font-semibold text-slate-800 dark:text-white truncate tabular-nums">
                                        <span className="sm:hidden">{formatCompact(inflationStats.adjustedValue)}</span>
                                        <span className="hidden sm:inline">{formatCurrency(inflationStats.adjustedValue)}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Real ROI</div>
                                    <div className={clsx("font-semibold tabular-nums", inflationStats.adjustedRoi >= 0 ? "text-gain" : "text-loss")}>
                                        {inflationStats.adjustedRoi.toFixed(1)}%
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Inflation</div>
                                    <div className="font-semibold text-loss tabular-nums">
                                        {inflationStats.cumulativeInflation.toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Lump Sum Comparison */}
                    {lumpSumResult && (
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 fade-in">
                            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-800 dark:text-slate-100">Buying steadily vs all at once</h3>
                            <div className="grid grid-cols-2 gap-3 sm:gap-6">
                                <div className="p-3 sm:p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
                                    <div className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">DCA Strategy</div>
                                    {/* Schedule only, matching the lump-sum leg — see lumpSumResult. */}
                                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
                                        <span className="sm:hidden">{formatCompact(scheduledOnly.value)}</span>
                                        <span className="hidden sm:inline">{formatCurrency(scheduledOnly.value)}</span>
                                    </div>
                                    <div className={clsx("text-xs sm:text-sm mt-1 truncate tabular-nums", scheduledOnly.profit >= 0 ? "text-gain" : "text-loss")}>
                                        <span className="sm:hidden">{scheduledOnly.profit >= 0 ? '+' : '-'}{formatCompact(Math.abs(scheduledOnly.profit))} ({scheduledOnly.roi.toFixed(1)}%)</span>
                                        <span className="hidden sm:inline">{scheduledOnly.profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(scheduledOnly.profit))} ({scheduledOnly.roi.toFixed(1)}%)</span>
                                    </div>
                                </div>
                                <div className="p-3 sm:p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50">
                                    <div className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Lump Sum</div>
                                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
                                        <span className="sm:hidden">{formatCompact(lumpSumResult.currentValue)}</span>
                                        <span className="hidden sm:inline">{formatCurrency(lumpSumResult.currentValue)}</span>
                                    </div>
                                    <div className={clsx("text-xs sm:text-sm mt-1 truncate tabular-nums", lumpSumResult.profit >= 0 ? "text-gain" : "text-loss")}>
                                        <span className="sm:hidden">{lumpSumResult.profit >= 0 ? '+' : '-'}{formatCompact(Math.abs(lumpSumResult.profit))} ({lumpSumResult.roi.toFixed(1)}%)</span>
                                        <span className="hidden sm:inline">{lumpSumResult.profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(lumpSumResult.profit))} ({lumpSumResult.roi.toFixed(1)}%)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Asset Comparison */}
                    {priceMode === 'api' && (
                        <AssetComparison btcResult={btcAssetResult} sp500Result={sp500Result} goldResult={goldResult} loading={comparisonLoading} excludesStartingStack={deferredStartingBtc > 0} />
                    )}

                    {/* Exchange Fee Comparison — schedule only: exchanges never
                        charged a fee on coins the user already held. */}
                    <ExchangeFeeComparison totalInvested={scheduledOnly.invested} purchaseCount={purchaseCount} />

                    {/* Savings Account Comparison — schedule only: a savings account
                        has no analogue of coins already held. */}
                    <SavingsComparison
                        totalInvested={scheduledOnly.invested}
                        btcCurrentValue={scheduledOnly.value}
                        btcRoi={scheduledOnly.roi}
                        amount={amountUsd}
                        frequency={frequency}
                        startDate={startDate}
                        endDate={endDate}
                        annualEscalationPct={deferredEscalation}
                    />

                    {/* Opportunity Cost Calculator */}
                    {priceMode === 'api' && priceData.length > 0 && livePrice && (
                        <OpportunityCostCalculator priceData={priceData} livePrice={livePrice} />
                    )}

                    {/* Plan-vs-plan comparison */}
                    {priceMode === 'api' && !dateError && (
                        <PlanComparison
                            simplifiedBase={deferredStartingBtc > 0 || deferredEscalation > 0}
                            basePlan={{
                                amountUsd,
                                frequency,
                                startDate,
                                endDate,
                                feePercentage: deferredFee,
                                provider,
                                livePrice: priceMode === 'api' ? livePrice : null,
                            }}
                        />
                    )}
                            </>
                        }
                        project={
                            <>
                    {/* Future Projection (when end date is in the future) */}
                    {livePrice && (
                        <FutureProjection
                            amount={amountUsd}
                            annualEscalationPct={deferredEscalation}
                            frequency={frequency}
                            startDate={startDate}
                            endDate={endDate}
                            feePercentage={deferredFee}
                            currentPrice={livePrice}
                            currentBtc={pastResults.btcAccumulated}
                            currentInvested={pastResults.totalInvested}
                        />
                    )}

                    {/* Price scenarios — the past-only run: for future-dated plans
                        the full-range figures include purchases not yet made, which
                        overstated holdings and contradicted FutureProjection above. */}
                    <PricePredictionScenario btcAmount={pastResults.btcAccumulated} totalInvested={pastResults.totalInvested} />

                    {/* Stacking Goals */}
                    <StackingGoalTracker
                        btcAccumulated={results.btcAccumulated}
                        totalInvested={results.totalInvested}
                        purchaseCount={purchaseCount}
                        startDate={startDate}
                        endDate={endDate}
                        amount={currentAmountUsd}
                        frequency={frequency}
                        unit={denomination}
                        /* Project future sats at today's price, not at the average
                           price of a window the price already rose through. */
                        currentPrice={priceMode === 'api' ? livePrice ?? undefined : deferredManualPrice}
                    />

                    {/* FIRE Calculator */}
                    <FireCalculator
                        btcAccumulated={results.btcAccumulated}
                        totalInvested={results.totalInvested}
                        livePrice={livePrice}
                        amount={currentAmountUsd}
                        frequency={frequency}
                    />

                    {/* Drawdown / spend-down planner */}
                    {livePrice && results.btcAccumulated > 0 && (
                        <DrawdownCalculator
                            btcAccumulated={results.btcAccumulated}
                            livePrice={livePrice}
                        />
                    )}
                            </>
                        }
                        details={
                            <>
                    {/* Transaction Table */}
                    <TransactionTable breakdown={results.breakdown} unit={denomination} />

                    {/* Cost Basis Tracker */}
                    <CostBasisTracker
                        priceData={priceData}
                        livePrice={livePrice}
                        priceMode={priceMode}
                        provider={provider}
                    />

                    {/* Unit Bias Calculator */}
                    <UnitBiasCalculator btcAccumulated={results.btcAccumulated} />

                    {/* Share My Stack — past-only figures: a share card claiming
                        "stacked" coins the plan hasn't bought yet would be a lie,
                        and the percentile would rank a future-polluted average
                        cost against purely historical windows. */}
                    <ShareMyStack
                        totalInvested={pastResults.totalInvested}
                        currentValue={pastResults.currentValue}
                        roi={pastResults.roi}
                        btcAccumulated={pastResults.btcAccumulated}
                        unit={denomination}
                        startDate={startDate}
                        endDate={isFutureEndDate ? utcIsoToday() : endDate}
                        planEndDate={endDate}
                        amount={amount}
                        frequency={frequency}
                        feePercentage={feePercentage}
                        priceMode={priceMode}
                        provider={provider}
                        manualPrice={manualPrice}
                        startingBtc={startingBtc}
                        startingAvgCost={startingAvgCost}
                        annualEscalationPct={annualEscalationPct}
                        purchaseCount={purchaseCount}
                        bestBuy={pastResults.stats?.bestBuy}
                        maxDrawdownPercent={pastResults.stats?.maxDrawdownPercent}
                    />
                            </>
                        }
                    />
                </>
            )}

            {/* Mid-content Ad */}
            <AdSlot className="min-h-[100px] flex justify-center" />
        </div>
    );
};

interface AnimatedResultCardProps {
    label: string;
    /**
     * Raw numeric value, formatted and shown exactly. Deliberately NOT animated:
     * a count-up displays figures that are not true for the duration of the
     * animation, and re-formats through Intl.NumberFormat ~20 times per card
     * while the fetch response is being parsed on the same thread. The hero
     * figure never counted up either. The change is signalled with a background
     * flash instead, which says "this updated" without ever lying.
     */
    value: number;
    format: (n: number) => string;
    /** Compact formatter used below the sm breakpoint (replaces truncation). */
    formatShort?: (n: number) => string;
    subValue?: string;
    celebrated?: boolean;
    valueClassName?: string;
    icon?: React.ReactNode;
    subValueClassName?: string;
    action?: React.ReactNode;
}

const ResultCard = ({ label, value, format, formatShort, subValue, celebrated, valueClassName, icon, subValueClassName, action }: AnimatedResultCardProps) => {
    return (
        <Card celebrated={celebrated} className="p-3 sm:p-5">
            <div className="flex justify-between items-start gap-1 mb-1">
                {/* Level 1: the card's own label. Smallest, uppercase, tracked out. */}
                <div className="text-2xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">{label}</div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
                {/* Level 2: the figure. tabular-nums so digits never reflow as it changes. */}
                <div className={clsx('text-2xl sm:text-3xl font-bold tabular-nums text-slate-900 dark:text-[var(--text-strong)] min-w-0', valueClassName)}>
                    {formatShort ? (
                        <>
                            <span className="sm:hidden">{formatShort(value)}</span>
                            <span className="hidden sm:inline">{format(value)}</span>
                        </>
                    ) : format(value)}
                </div>
                {icon}
            </div>
            {/* Level 3: subordinate note. Was text-sm at the sm breakpoint, which made
                it larger than the card's own label — three levels reading as two. */}
            {subValue && <div className={clsx('text-2xs sm:text-xs mt-0.5 sm:mt-1 tabular-nums', subValueClassName || 'text-slate-500 dark:text-slate-400')}>{subValue}</div>}
        </Card>
    );
};

const StatsStrip = memo(function StatsStrip({ stats }: { stats: DcaStats }) {
    const { formatCurrency } = useCurrency();
    const xirr = stats.xirrPercent;
    const labelClass = "text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5";
    const valueClass = "text-sm sm:text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100";
    const subClass = "text-[11px] text-slate-500 dark:text-slate-400";
    return (
        <Card className="p-4 sm:p-5 fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                <div>
                    <div className={labelClass}>Annualized return (XIRR)</div>
                    <div className={clsx(
                        "text-sm sm:text-base font-semibold tabular-nums",
                        xirr === null
                            ? "text-slate-500 dark:text-slate-400"
                            : xirr >= 0 ? "text-gain" : "text-loss"
                    )}>
                        {xirr === null ? '—' : `${xirr >= 0 ? '+' : ''}${xirr.toFixed(1)}%`}
                    </div>
                    {/* Visible, not a title attribute: most visitors are on touch,
                        where hover tooltips simply do not exist. */}
                    <div className={subClass}>Yearly return, timing-adjusted</div>
                </div>
                <div>
                    <div className={labelClass}>Max drawdown</div>
                    <div className={valueClass}>
                        {stats.maxDrawdownPercent === null
                            ? '—'
                            : stats.maxDrawdownPercent > 0 ? `-${stats.maxDrawdownPercent.toFixed(1)}%` : '0%'}
                    </div>
                    <div className={subClass}>
                        {stats.maxDrawdownPercent === null
                            ? 'Not measurable at a fixed price'
                            /* "of total value": ongoing deposits can mask a falling
                               price, so 0% here never means the price didn't fall. */
                            : 'Biggest fall in total value, deposits included'}
                    </div>
                </div>
                <div>
                    <div className={labelClass}>Best buy</div>
                    <div className={valueClass}>{stats.bestBuy ? formatCurrency(stats.bestBuy.price) : '—'}</div>
                    {stats.bestBuy && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{formatUtc(stats.bestBuy.date, 'full')}</div>
                    )}
                </div>
                <div>
                    <div className={labelClass}>Fees paid</div>
                    <div className={valueClass}>{formatCurrency(stats.feesPaid, 2)}</div>
                </div>
            </div>
        </Card>
    );
});

const ProfitableWindows = memo(function ProfitableWindows({ frequency, startDate, endDate }: { frequency: Frequency; startDate: string; endDate: string }) {
    const [data, setData] = useState<{ profitablePercent: number; windowCount: number; durationDays: number } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            const startTs = parseUtcDate(startDate);
            const endTs = Math.min(parseUtcDate(endDate), Date.now());
            const durationDays = Math.round((endTs - startTs) / DAY_MS);
            if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs || durationDays < 90) {
                if (!cancelled) setData(null);
                return;
            }
            try {
                const result = await getProfitableWindows(frequency, durationDays);
                if (!cancelled) setData(result);
            } catch {
                if (!cancelled) setData(null);
            }
        }, 800);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [frequency, startDate, endDate]);

    if (!data) return null;
    const months = Math.round(data.durationDays / 30);
    return (
        <p className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 fade-in">
            Historically,{' '}
            <span className="font-semibold text-gain tabular-nums">
                {data.profitablePercent.toFixed(0)}%
            </span>{' '}
            of every {months}-month {frequency} buying run since 2010 ended in profit
            <span className="text-slate-500 dark:text-slate-400"> · {data.windowCount.toLocaleString('en-US')} runs, before fees</span>
        </p>
    );
});

const PricePredictionScenario = memo(function PricePredictionScenario({ btcAmount, totalInvested }: { btcAmount: number; totalInvested: number }) {
    const { currencyConfig, formatCurrency, formatCompact } = useCurrency();
    // Entered in the selected display currency; converted to USD before the math.
    const [targetPrice, setTargetPrice] = useState<number>(() => roundTo2Sig(100_000 * currencyConfig.rate));

    // Re-denominate the entered target when the display currency changes so the
    // same USD scenario is preserved (a JPY user shouldn't inherit a $-shaped number).
    const prevCurrencyRef = useRef({ code: currencyConfig.code, rate: currencyConfig.rate });
    useEffect(() => {
        const prev = prevCurrencyRef.current;
        if (prev.code !== currencyConfig.code && prev.rate > 0) {
            setTargetPrice(p => roundTo2Sig((p / prev.rate) * currencyConfig.rate));
        }
        prevCurrencyRef.current = { code: currencyConfig.code, rate: currencyConfig.rate };
    }, [currencyConfig.code, currencyConfig.rate]);

    const targetPriceUsd = currencyConfig.rate > 0 ? targetPrice / currencyConfig.rate : targetPrice;
    const projectedValue = btcAmount * targetPriceUsd;
    const projectedProfit = projectedValue - totalInvested;
    const multiplier = totalInvested > 0 ? projectedValue / totalInvested : 0;

    const quickTargets = useMemo(
        () => [100_000, 150_000, 250_000, 500_000, 1_000_000].map(usd => roundTo2Sig(usd * currencyConfig.rate)),
        [currencyConfig.rate]
    );

    const chipLabel = (v: number): string => {
        const sym = currencyConfig.symbol;
        if (v >= 1_000_000) {
            const m = v / 1_000_000;
            return `${sym}${Number.isInteger(m) ? m : m.toFixed(1)}M`;
        }
        if (v >= 1_000) {
            const k = v / 1_000;
            return `${sym}${Number.isInteger(k) ? k : k.toFixed(1)}k`;
        }
        return `${sym}${v.toLocaleString()}`;
    };

    return (
        <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-white p-4 sm:p-6 rounded-2xl shadow-sm dark:shadow-lg border border-slate-200 dark:border-slate-700">
            <h3 className="text-base sm:text-xl font-bold mb-3 sm:mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-gain shrink-0" />
                {/* Not "Price Prediction": nothing here forecasts anything. You supply
                    a price and it multiplies. The site's credibility rests on refusing
                    to predict, so the heading should not claim otherwise. */}
                Price scenarios
            </h3>
            {/* For future-dated plans this card values the coins bought SO FAR;
                the Future Projection card above includes purchases still to come. */}
            <p className="-mt-2 mb-3 text-xs text-slate-500 dark:text-slate-400 sm:mb-4">
                Values the coins this plan has bought so far.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 items-center">
                <div className="space-y-3">
                    <label htmlFor="prediction-target" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">If Bitcoin Price Hits... ({currencyConfig.code})</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">{currencyConfig.symbol}</span>
                        <input
                            id="prediction-target"
                            type="number"
                            inputMode="decimal"
                            value={targetPrice}
                            onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value)))}
                            onFocus={(e) => e.target.select()}
                            className="w-full pl-7 pr-3 py-2.5 rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-lg font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-colors"
                        />
                    </div>
                    <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Quick target prices">
                        {quickTargets.map((price, i) => (
                            <button
                                key={`${price}-${i}`}
                                type="button"
                                onClick={() => setTargetPrice(price)}
                                aria-pressed={targetPrice === price}
                                className={clsx(
                                    "px-2.5 py-1.5 text-[11px] sm:text-xs font-medium rounded-full transition-colors",
                                    targetPrice === price
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                        : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700/80 dark:hover:bg-slate-600 dark:text-slate-300"
                                )}
                            >
                                {chipLabel(price)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700/50">
                    <div className="flex justify-between items-end border-b border-slate-200 dark:border-slate-700 pb-3">
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Portfolio Value</span>
                        <span className="text-xl sm:text-3xl font-bold text-gain ml-2">
                            <span className="sm:hidden">{formatCompact(projectedValue)}</span>
                            <span className="hidden sm:inline">{formatCurrency(projectedValue)}</span>
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Profit</span>
                        <span className={clsx("text-sm sm:text-lg font-semibold ml-2 tabular-nums", projectedProfit >= 0 ? "text-gain" : "text-loss")}>
                            <span className="sm:hidden">{projectedProfit >= 0 ? '+' : ''}{formatCompact(projectedProfit)}</span>
                            <span className="hidden sm:inline">{projectedProfit >= 0 ? '+' : ''}{formatCurrency(projectedProfit)}</span>
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Multiplier</span>
                        <span className="text-xs sm:text-sm font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded tabular-nums">{multiplier.toFixed(1)}x</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

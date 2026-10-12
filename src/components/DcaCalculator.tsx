'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useDeferredValue, useId, useRef, memo } from 'react';
import Link from 'next/link';
import { Frequency, PriceMode, AssetDcaResult, DcaResult, DcaStats, PricePoint } from '@/types';
import { btcToSats, useCurrency, CurrencyCode } from '@/context/CurrencyContext';
import { calculateDca, calculateDcaToDate, calculateLumpSum, calculateAssetDca, emptyDcaResult, seriesThroughDay, withPriceKinds } from '@/utils/dca';
import { calculateRealReturn } from '@/utils/realReturn';
import { bucketDurationDays, standingAmong, type OutcomeRangeResult } from '@/utils/datasets';
import type { PriceHistoryResult } from '@/utils/priceSeries';
import { getPriceHistoryAndSpot, getBitcoinSpot, getAssetPriceHistory, getCpiData, getOutcomeRange } from '@/app/actions';
import { unpackDailyPrices, type PackedDailyPrices } from '@/app/calculators/bitcoin-cost-basis/priceSeed';
import { generateCsvContent, downloadCsv } from '@/utils/csv';
import { encodeParams, decodeParams, impliedSessionCurrency, URL_PARAM_LIMITS } from '@/utils/urlParams';
import {
    formatUtc,
    parseUtcDate,
    utcDayStart,
    utcFullYearsBetween,
    utcMonthsBetween,
    defaultPlanWindow,
    DAY_MS,
    EARLIEST_PRICE_DATE,
    EARLIEST_PRICE_TS,
    MAX_END_DATE,
    MAX_END_TS,
    utcIsoToday,
    utcIsoYearsAgo,
} from '@/utils/dates';
import { answersPriceRequest, samePriceRequest, selectResultView, type PriceRequest } from '@/utils/priceRequest';
import { carryPriceAcrossRate, limitMessage, roundTo2Sig, signedPercent, type LimitHit } from '@/utils/numericInput';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { feeCostLabel, feePresetsAsOf, feesLastVerified, type FeePreset } from '@/data/exchangeFees';
import {
    DEFAULT_PRICE_PROVIDER,
    PRICE_ERAS,
    PRICE_PROVIDERS,
    PRICE_PROVIDER_LABELS,
    isPriceProvider,
    priceFallbackNotice,
    priceStaleNotice,
    type PriceEra,
    type PriceProvider,
} from '@/data/priceSources';
import { EVERY, planLinkMarked, publishDefaultPlanFigures, publishShownPlan, releasePlanLinkMark } from './HeroProofLine';
import dynamic from 'next/dynamic';
import { SkeletonCard, SkeletonChart, SkeletonPanel } from './Skeleton';
import { AdSlot } from './AdSlot';
import { Card, chip } from './ui/Card';
import { DockedResult } from './DockedResult';
import { useNumericInput } from './useNumericInput';
// Plain imports: the three panels of the default tab that draw no chart. They
// are in the server's HTML on every visit, and behind a lazy boundary that
// markup is dropped for a placeholder whenever the calculator renders again
// before their code has arrived (the comparison data landing is enough).
import { ExchangeFeeComparison } from './ExchangeFeeComparison';
import { SavingsComparison } from './SavingsComparison';
import { OpportunityCostCalculator } from './OpportunityCostCalculator';
// Types only: the chart itself is loaded on the client (see below), and a
// value import here would pull Recharts into this chunk.
import type { DcaChartView } from './DcaChart';

// Lazy-load the other result sub-components: the chart-drawing ones (Recharts),
// and those behind a tab that may never be opened.
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
const StackingGoalTracker = dynamic(() => import('./StackingGoalTracker').then(m => m.StackingGoalTracker), { loading: () => <SkeletonPanel /> });
const ShareMyStack = dynamic(() => import('./ShareMyStack').then(m => m.ShareMyStack), { loading: () => <SkeletonPanel /> });
const UnitBiasCalculator = dynamic(() => import('./UnitBiasCalculator').then(m => m.UnitBiasCalculator), { loading: () => <SkeletonPanel /> });
const FireCalculator = dynamic(() => import('./FireCalculator').then(m => m.FireCalculator), { loading: () => <SkeletonPanel /> });
const CostBasisTracker = dynamic(() => import('./CostBasisTracker').then(m => m.CostBasisTracker), { loading: () => <SkeletonPanel /> });
const PlanComparison = dynamic(() => import('./PlanComparison').then(m => m.PlanComparison), { loading: () => <SkeletonPanel /> });
const FutureProjection = dynamic(() => import('./FutureProjection').then(m => m.FutureProjection), { loading: () => <SkeletonPanel /> });
const DrawdownCalculator = dynamic(() => import('./DrawdownCalculator').then(m => m.DrawdownCalculator), { loading: () => <SkeletonPanel /> });
import { TrendingUp, TrendingDown, DollarSign, Activity, Download, Share2, RefreshCw, ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

type Preset = { label: string; amount: number; frequency: Frequency; yearsBack?: number; startDate?: string };

/** Scenario chips a phone shows before "More scenarios". */
const VISIBLE_SCENARIOS = 3;

/**
 * Finger sizing for a control that is not a button: 44px tall, and 16px text
 * so iOS does not zoom the page when it takes focus. On a narrow screen and on
 * any coarse pointer above that (a tablet, a phone held sideways), the same
 * pair of conditions as the button floor in globals.css, which reaches buttons
 * only.
 */
const TOUCH_FIELD = 'max-sm:min-h-11 pointer-coarse:min-h-11 text-sm max-sm:text-base pointer-coarse:text-base';
/** The same height for a link that stands on its own line. */
const TOUCH_ROW = 'max-sm:min-h-11 pointer-coarse:min-h-11';
/** Width for a control whose face is narrower than a finger; the floor in globals.css sets height only. */
const TOUCH_WIDTH = 'max-sm:min-w-11 pointer-coarse:min-w-11';

/** The plan form's fields. */
const FIELD_CLASS =
    `w-full ${TOUCH_FIELD} py-2 rounded-lg border border-slate-200 dark:border-slate-700 ` +
    'bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors';
const DATE_FIELD_CLASS =
    `w-full min-w-0 max-w-full appearance-none box-border px-2 sm:px-3 py-2 min-h-[38px] ${TOUCH_FIELD} rounded-lg border ` +
    'bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-colors';
/** The price-scenario target, in the display currency. */
const PRICE_TARGET_LIMITS = { min: 0, max: URL_PARAM_LIMITS.maxAmount };
/** A field's "this was capped" line. Not an error: the value is accepted, at the limit. */
const FIELD_NOTE_CLASS = 'text-[11px] sm:text-xs text-slate-600 dark:text-slate-300';

/**
 * Which exchange a price series really came from, and whether it is an earlier
 * copy. Kept beside the series so the result can say so in one line when it is
 * not what the visitor asked for.
 */
export type PriceSourceMeta = Pick<
    PriceHistoryResult,
    'requestedProvider' | 'servedProvider' | 'fallback' | 'stale' | 'fetchedAt'
>;

/**
 * How old a server-seeded live price may be before the calculator re-quotes it
 * on arrival. The home page is served from a cache and regenerated in the
 * background, so the first visitor after a quiet spell is handed the price from
 * before it. Two minutes covers a normally fresh page (the quote is cached for
 * a minute and the page for half of one) without a request on every view.
 */
const SEEDED_PRICE_MAX_AGE_MS = 2 * 60_000;

/** The provenance fields of a history response, without holding on to its rows. */
const sourceOf = (history: PriceHistoryResult): PriceSourceMeta => ({
    requestedProvider: history.requestedProvider,
    servedProvider: history.servedProvider,
    fallback: history.fallback,
    stale: history.stale,
    fetchedAt: history.fetchedAt,
});

/** formatCurrency trims trailing zeros ("$2.5", "$0.5"); a fee is read as money, so pad a lone decimal digit back. */
const padCents = (formatted: string): string => formatted.replace(/\.\d$/, (cents) => `${cents}0`);

/** "0.5%", "0.22%": a percentage the visitor set, without float noise. */
const plainPercent = (value: number): string => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

const ordinal = (n: number): string => {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** "A" or "An" before a count written in digits: "An 83-month plan", "A 60-month plan". Good to 999. */
const articleFor = (n: number): string => (/^8/.test(String(n)) || n === 11 || n === 18 ? 'An' : 'A');

const isFrequency = (value: string): value is Frequency => Object.keys(EVERY).includes(value);

/** The ids of the hints that are on screen for a field, for aria-describedby. An id with no element behind it is left out. */
const describedBy = (...ids: (string | false | null | undefined)[]): string | undefined =>
    ids.filter(Boolean).join(' ') || undefined;

/** "1 purchase", "4,017 purchases". */
const countOf = (n: number, noun: string): string => `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`;

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
    active,
    onChange,
    compare,
    project,
    details,
}: {
    /**
     * Held by the calculator, not here. The results are unmounted whenever
     * there is nothing to show (a first load, a failed one), and a tab held
     * in this component would come back as Compare each time.
     */
    active: ResultTabId;
    onChange: (tab: ResultTabId) => void;
    compare: React.ReactNode;
    project: React.ReactNode;
    details: React.ReactNode;
}) {
    const setActive = onChange;
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
                            aria-describedby={`${baseId}-hint-${t.id}`}
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
                which touch users and screen readers never see. One element per
                tab, so each tab is described by its own hint; `hidden` keeps
                the other two out of the reading order, and a display utility
                on them would undo it. */}
            {RESULT_TABS.map((t) => (
                <p
                    key={t.id}
                    id={`${baseId}-hint-${t.id}`}
                    hidden={t.id !== active}
                    className="-mt-2 text-xs text-slate-500 dark:text-slate-400 px-1"
                >
                    {t.hint}
                </p>
            ))}

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

/** The bare BTC figure where the label already says BTC: four decimals under one coin, two from there up. */
const btcShort = (btc: number): string =>
    (btc < 1 ? btc.toFixed(4) : btc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** How long the screen-reader status waits for a change to settle before it is said. */
const STATUS_SETTLE_MS = 700;

/**
 * The calculator's screen-reader status, said once it has stopped changing.
 * An amount typed digit by digit is a different result at every digit, and
 * written straight into a live region each of them is read out in full.
 *
 * `immediate` skips the wait while the region is hidden for a link's plan
 * (data-plan-figure), so that what it holds when it is shown again is that
 * plan's text and not the one before.
 */
function ResultStatus({ text, immediate, pendingMark }: { text: string; immediate: boolean; pendingMark: '' | undefined }) {
    const [said, setSaid] = useState(text);
    const [wasImmediate, setWasImmediate] = useState(immediate);
    if (immediate !== wasImmediate) setWasImmediate(immediate);
    if ((immediate || wasImmediate) && said !== text) setSaid(text);
    useEffect(() => {
        const timer = setTimeout(() => setSaid(text), STATUS_SETTLE_MS);
        return () => clearTimeout(timer);
    }, [text]);
    return (
        <div role="status" aria-live="polite" className="sr-only" data-plan-figure={pendingMark}>
            {said}
        </div>
    );
}

/** Compact sats rendering for narrow columns. */
const satsShort = (btc: number): string => {
    const sats = btcToSats(btc);
    if (sats >= 1_000_000_000) return `${(sats / 1_000_000_000).toFixed(2)}B sats`;
    if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M sats`;
    return `${sats.toLocaleString('en-US')} sats`;
};

export interface DcaCalculatorProps {
    /**
     * The instant (ms) the server rendered the page this calculator sits in.
     *
     * The home page is a cached prerender: the HTML can be hours old, and for
     * the first visitor after UTC midnight it is yesterday's. The first render
     * in the browser has to produce that same HTML, so the default window and
     * "today" are derived from this instant on both sides instead of each side
     * reading its own clock. After mount the calculator moves to the real UTC
     * day (see the arrival effect below).
     */
    seededAt?: number;
    /**
     * Prices for the default window, fetched on the server so the first paint
     * already shows a real result instead of a skeleton. Must cover exactly the
     * default date range as of `seededAt` — both sides derive it with
     * defaultPlanWindow. Packed for the trip (see priceSeed): one price per
     * UTC day, with its observed/estimated markers.
     */
    initialPrices?: PackedDailyPrices;
    /** Whose series the seed is, and whether it is a fallback or an earlier copy. */
    initialPriceSource?: PriceSourceMeta;
    initialLivePrice?: number | null;
    /** ms epoch the seeded live price was quoted. */
    initialLivePriceAsOf?: number;
    /** The "same plan, every start date" card for the default plan, computed on the server. */
    initialOutcomeRange?: OutcomeRangeResult | null;
}

/** What stands in for a result while there is none to compute: the engine's own empty one. */
const EMPTY_RESULT: DcaResult = emptyDcaResult();

/**
 * A plan bought and valued at one price nets to exactly minus its fees on
 * paper, and to a hair either side of that in floating point. With no fee the
 * hair is all there is, and left in it reads "-$0 (-0.0%)" in the loss colour.
 * Measured against the money put in, so a real gain on a one-cent plan stays.
 */
const withoutFloatNoise = (result: DcaResult): DcaResult =>
    result.profit !== 0 && Math.abs(result.profit) < result.totalInvested * 1e-9
        ? { ...result, profit: 0, roi: 0 }
        : result;

/** What the Manual-mode price field holds until a price is typed or a link brings one. */
const DEFAULT_MANUAL_PRICE = 50_000;

/** The settings a link carries, as the form holds them. The currency is kept apart: it is a stored preference as well as a setting. */
interface PlanSettings {
    amount: number;
    frequency: Frequency;
    startDate: string;
    endDate: string;
    feePercentage: number;
    flatFee: number;
    priceMode: PriceMode;
    provider: PriceProvider;
    manualPrice: number;
    startingBtc: number;
    startingAvgCost: number;
    annualEscalationPct: number;
}

/** True when two sets of settings make the same link: a price typed for Manual mode does not count while prices are live. */
const samePlan = (a: PlanSettings, b: PlanSettings): boolean => encodeParams(a) === encodeParams(b);

export const DcaCalculator = ({
    seededAt,
    initialPrices,
    initialPriceSource,
    initialLivePrice,
    initialLivePriceAsOf,
    initialOutcomeRange,
}: DcaCalculatorProps = {}) => {
    const { currency, setCurrency, setSessionCurrency, currencyConfig, currencies, formatCurrency, formatCompact, denomination, setDenomination, formatBtcAmount, rateNote, ratesAsOf, ensureFxRates } = useCurrency();
    const isSats = denomination === 'SATS';
    const hasSeed = Boolean(initialPrices && initialPrices.prices.length > 0);

    // The clock this render starts from: the server's, when it handed one over.
    // Everything below that needs "now" for the first render reads it from here.
    const [mountClock] = useState(() => seededAt ?? Date.now());

    // UTC end to end: the engine buckets by UTC day and the default end date is
    // the UTC day, so a LOCAL calendar date here mislabelled the default view
    // as a "projection" for every user west of UTC in their evening (and put a
    // different date in the server HTML than the browser produced).
    //
    // Every child that needs "today" is handed this value. A child that read
    // the clock itself could disagree with the past-only run that is cut off
    // here, and with a cached page's HTML.
    const [todayUtcTs, setTodayUtcTs] = useState(() => utcDayStart(mountClock));

    useEffect(() => {
        const interval = setInterval(() => {
            const now = utcDayStart(Date.now());
            if (now !== todayUtcTs) {
                setTodayUtcTs(now);
            }
        }, 60_000);
        return () => clearInterval(interval);
    }, [todayUtcTs]);

    const [amount, setAmount] = useState<number>(DEFAULT_PLAN.amount);
    const deferredAmount = useDeferredValue(amount);
    const [frequency, setFrequency] = useState<Frequency>(DEFAULT_PLAN.frequency);
    // Advanced plan shape: coins already held, and income-style annual raises.
    const [startingBtc, setStartingBtc] = useState<number>(0);
    const deferredStartingBtc = useDeferredValue(startingBtc);
    const [startingAvgCost, setStartingAvgCost] = useState<number>(0);
    const deferredStartingAvgCost = useDeferredValue(startingAvgCost);
    const [annualEscalationPct, setAnnualEscalationPct] = useState<number>(0);
    const deferredEscalation = useDeferredValue(annualEscalationPct);
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    // The default window as of the mount clock, in UTC. Derived the same way on
    // the server (page.tsx) and here, from the same instant, so the seeded
    // prices cover exactly this range and the first render matches the HTML.
    const [startDate, setStartDate] = useState<string>(() => defaultPlanWindow(mountClock).startDate);
    const [endDate, setEndDate] = useState<string>(() => defaultPlanWindow(mountClock).endDate);
    const [feePercentage, setFeePercentage] = useState<number>(DEFAULT_PLAN.feePercentage);
    const deferredFee = useDeferredValue(feePercentage);
    // A fixed charge per buy, typed in the display currency like the amount.
    const [flatFee, setFlatFee] = useState<number>(0);
    const deferredFlatFee = useDeferredValue(flatFee);
    // The preset chip the visitor last tapped. Two platforms can publish the
    // same rate (Swan and Kraken both charge 1%), so the number alone cannot
    // say which chip is pressed.
    const [feePresetId, setFeePresetId] = useState<string | null>(null);
    const [priceMode, setPriceMode] = useState<PriceMode>('api');
    const [manualPrice, setManualPrice] = useState<number>(DEFAULT_MANUAL_PRICE);
    const deferredManualPrice = useDeferredValue(manualPrice);
    const [provider, setProvider] = useState<PriceProvider>(DEFAULT_PRICE_PROVIDER);
    const [priceData, setPriceData] = useState<PricePoint[]>(() => (hasSeed && initialPrices ? unpackDailyPrices(initialPrices) : []));
    const [priceSource, setPriceSource] = useState<PriceSourceMeta | null>(() => (hasSeed ? initialPriceSource ?? null : null));
    // The request the series in `priceData` was loaded for: which exchange and
    // which plan window. Not the bar coverage of priceData, which legitimately
    // starts later than requested for early dates. It is what tells "these
    // prices also answer the form as it stands" (see answersPriceRequest) apart
    // from "these are another window's prices, or another exchange's".
    const [loadedRequest, setLoadedRequest] = useState<PriceRequest | null>(() => {
        if (!hasSeed) return null;
        const seedWindow = defaultPlanWindow(mountClock);
        return { provider: DEFAULT_PRICE_PROVIDER, start: seedWindow.startDate, end: seedWindow.endDate };
    });
    // The last plan window the results were shown for as the form's own. When
    // the form moves on to one that cannot be shown yet, this is the window
    // that stays on screen in its place (see selectResultView).
    const [shownRequest, setShownRequest] = useState<PriceRequest | null>(() => {
        if (!hasSeed) return null;
        const seedWindow = defaultPlanWindow(mountClock);
        return { provider: DEFAULT_PRICE_PROVIDER, start: seedWindow.startDate, end: seedWindow.endDate };
    });
    const [livePrice, setLivePrice] = useState<number | null>(initialLivePrice ?? null);
    // The instant `livePrice` was quoted. The engine dates its XIRR by it, so it
    // is state, not a clock read during render: the same inputs then give the
    // same result on the server, in the first client render, and a minute later.
    const [priceAsOf, setPriceAsOf] = useState<number>(() => initialLivePriceAsOf ?? mountClock);
    // True when the last attempt to load the form's prices failed.
    const [loadFailed, setLoadFailed] = useState(false);
    const [retryToken, setRetryToken] = useState(0);
    const firstFetchRef = useRef(true);
    const urlAppliedRef = useRef(false);
    // `loadedRequest` again, for the effects: the request the series in
    // `priceData` answers, or null when nothing is loaded. The fetch effect
    // skips a request it already holds the answer to: the server-seeded window
    // on mount, a window the arrival effect has just loaded itself, and a later
    // start date inside a window that was loaded moments ago. A ref, because
    // the arrival effect has to record its load before the state it sets
    // re-runs the fetch effect.
    const loadedRef = useRef<PriceRequest | null>(
        hasSeed
            ? { provider: DEFAULT_PRICE_PROVIDER, start: defaultPlanWindow(mountClock).startDate, end: defaultPlanWindow(mountClock).endDate }
            : null,
    );
    // Set while Manual mode is on: coming back to live prices asks again, for a
    // current quote, even when the series in hand still covers the dates.
    const requoteRef = useRef(false);
    // When the series in `priceData` was fetched (the server's clock, for a
    // seeded one). See `seriesIsFresh` in the fetch effect.
    const loadedAtRef = useRef(mountClock);
    // Counts price loads started by anything, so a slower one that finishes
    // after a newer one began can tell it has been overtaken.
    const priceLoadRef = useRef(0);
    // How the last copy of the share link went, for two seconds after it.
    const [shareStatus, setShareStatus] = useState<'copied' | 'failed' | null>(null);
    const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The S&P 500, gold and CPI series, with the plan window they were fetched
    // for. Kept together so the window can be checked before they are used:
    // held as three loose values, the series for the previous dates would go
    // on being compared with the bitcoin result for the new ones until the
    // refetch lands. A series that failed to load is null inside the object.
    const [comparison, setComparison] = useState<{
        key: string;
        sp500: [number, number][] | null;
        gold: [number, number][] | null;
        cpi: [number, number][] | null;
    } | null>(null);
    const [comparisonRetry, setComparisonRetry] = useState(0);
    // Which stretch of history the every-start-date card draws on. Held here,
    // not in the card: the results are unmounted when there is nothing to show
    // (a first load, a failed one), and the choice has to outlive that. The
    // open tab and the chart's switches are held here for the same reason.
    const [outcomeEra, setOutcomeEra] = useState<PriceEra>('all');
    const [resultTab, setResultTab] = useState<ResultTabId>('compare');
    // Undefined until a switch is touched: the chart then uses its own defaults.
    const [chartView, setChartView] = useState<DcaChartView>();
    // Phones fold the less-used fields and scenarios away so the answer sits
    // within a thumb's scroll of the amount. sm and up always show them.
    const [showMoreFields, setShowMoreFields] = useState(false);
    const [showMoreScenarios, setShowMoreScenarios] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);
    const headlineRef = useRef<HTMLParagraphElement>(null);
    const resultsRef = useRef<HTMLDivElement>(null);
    // The arrival effect below sets `arrived` when it has put something into
    // the form that the server's render did not have: a link's settings, or
    // the real day's dates. The render that carries them has it true. An
    // effect from the render before (the ref is set, the state is not yet)
    // would act on the default plan, and stands aside. A plain visit sets
    // neither, and costs no second render.
    const [arrived, setArrived] = useState(false);
    const arrivalPendingRef = useRef(false);
    // True once the figures have followed the form there (see pendingMark).
    const [planShown, setPlanShown] = useState(false);
    // The settings the visit opened on: the link's, over the defaults.
    const openedPlanRef = useRef<PlanSettings | null>(null);
    // Set once the visitor has changed the plan or picked a currency. Until
    // then the address bar is left exactly as the visit found it.
    const addressOwnedRef = useRef(false);
    // The height of the results a link is about to replace, kept under the
    // placeholder that stands in while the link's prices load.
    const [heldHeight, setHeldHeight] = useState<number | null>(null);

    // The latest inputs, for async work that must not overwrite a choice the
    // visitor made while it was in flight.
    const latestRef = useRef({ startDate, endDate, provider, priceMode, priceAsOf });
    useEffect(() => {
        latestRef.current = { startDate, endDate, provider, priceMode, priceAsOf };
    });

    const applyPreset = useCallback((preset: Preset) => {
        // An event handler, so it may read the clock. "Today" moves with it:
        // activePresetLabel compares against todayUtcTs, and a chip a user had
        // just clicked must highlight even across UTC midnight.
        const now = Date.now();
        setTodayUtcTs(utcDayStart(now));
        setAmount(preset.amount);
        setFrequency(preset.frequency);
        setEndDate(utcIsoToday(now));
        if (preset.startDate) {
            setStartDate(preset.startDate);
        } else if (preset.yearsBack) {
            setStartDate(utcIsoYearsAgo(preset.yearsBack, now));
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
                    // The same day /dca/lost-decade-test starts on (app/dca/scenarios).
                    { label: `${s}50/week from 2013 peak`, amount: 50, frequency: 'weekly', startDate: '2013-11-30' },
                    { label: `${s}50/week from 2017 peak`, amount: 50, frequency: 'weekly', startDate: '2017-12-17' },
                    { label: `${s}50/week from 2021 peak`, amount: 50, frequency: 'weekly', startDate: '2021-11-10' },
                ] as Preset[],
            },
        ];
    }, [currencyConfig.symbol]);

    /**
     * Arrival: apply a shared link's settings, then catch up with the clock.
     *
     * The first render used the server's instant (`seededAt`) so it would match
     * the cached HTML. That HTML can be old, so once mounted the calculator
     * checks the real time and does one of three things:
     *
     *  - Same UTC day, recent price: nothing.
     *  - Same UTC day, old price: re-quote the price. The figures move to the
     *    live price in place.
     *  - A later UTC day (the first visitor after midnight is served
     *    yesterday's page): load the default window for the real day and switch
     *    to it in one step, dates, "today", prices and quote together. Until
     *    that lands the server's result stays on screen, coherent with its own
     *    dates. Changing the dates first and waiting for the prices would swap
     *    the whole result for a skeleton and reload the ad inside it.
     *
     * Dates that came from the link are the sharer's and are never rolled.
     *
     * A layout effect: what it sets is rendered before the browser paints
     * again, in the commit after the one that hydrated the form. React
     * hydrates this part of the page at its lowest priority, and an update
     * made from that commit's passive effects inherits it: a link's settings
     * would then wait behind every Server Action in flight, with the default
     * plan's result on screen under the link's address.
     */
    const arrivedRef = useRef(false);
    useLayoutEffect(() => {
        if (arrivedRef.current) return;
        arrivedRef.current = true;

        const sp = new URLSearchParams(window.location.search);
        const params = decodeParams(Object.fromEntries(sp.entries()));

        const now = Date.now();
        const realToday = utcDayStart(now);
        const staleDay = realToday !== utcDayStart(mountClock);
        const seedWindow = defaultPlanWindow(mountClock);
        const realWindow = defaultPlanWindow(now);
        const linkSetsWindow = Boolean(params?.startDate || params?.endDate || params?.provider || params?.priceMode);

        // What the calculator will be showing once the link's settings land.
        const arriving = {
            priceMode: params?.priceMode ?? 'api',
            provider: params?.provider ?? DEFAULT_PRICE_PROVIDER,
            startDate: params?.startDate ?? (staleDay && linkSetsWindow ? realWindow.startDate : seedWindow.startDate),
            endDate: params?.endDate ?? (staleDay && linkSetsWindow ? realWindow.endDate : seedWindow.endDate),
        };
        const seedAnswersIt = hasSeed
            && arriving.priceMode === 'api'
            && answersPriceRequest(loadedRef.current, { provider: arriving.provider, start: arriving.startDate, end: arriving.endDate });
        // The seeded default result, on a page from an earlier UTC day: it
        // stays on screen while the real day's window loads (below).
        const rollsSeededResult = staleDay && hasSeed && !linkSetsWindow;
        // Otherwise a default date the link left out (or every date, with no
        // seeded result to protect) moves to the real day at once, and the
        // fetch effect loads it.
        const datesMoveToRealDay = staleDay && !rollsSeededResult && !seedAnswersIt;

        const opened: PlanSettings = {
            amount: params?.amount ?? DEFAULT_PLAN.amount,
            frequency: params?.frequency ?? DEFAULT_PLAN.frequency,
            startDate: params?.startDate ?? (datesMoveToRealDay ? realWindow.startDate : seedWindow.startDate),
            endDate: params?.endDate ?? (datesMoveToRealDay ? realWindow.endDate : seedWindow.endDate),
            feePercentage: params?.feePercentage ?? DEFAULT_PLAN.feePercentage,
            flatFee: params?.flatFee ?? 0,
            priceMode: arriving.priceMode,
            provider: arriving.provider,
            manualPrice: params?.manualPrice ?? DEFAULT_MANUAL_PRICE,
            startingBtc: params?.startingBtc ?? 0,
            startingAvgCost: params?.startingAvgCost ?? 0,
            annualEscalationPct: params?.annualEscalationPct ?? 0,
        };
        openedPlanRef.current = opened;

        // A plain visit on the server's own day has nothing to apply, and is
        // left without an update: one made here re-renders the panels under
        // the result before their code has loaded, and React then drops
        // their server markup for a placeholder. A marked document always
        // gets one, so that what the mark hides is shown again.
        if (params !== null || planLinkMarked() || (staleDay && !rollsSeededResult)) {
            arrivalPendingRef.current = true;
            setArrived(true);
            // Session-only override: the sharer's currency should shape THIS
            // visit, not silently overwrite the visitor's saved preference. A
            // link that carries an amount but no currency means USD, so a
            // recipient with a saved JPY preference does not read 50 as ¥50.
            const linkCurrency = impliedSessionCurrency(params);
            if (linkCurrency) setSessionCurrency(linkCurrency);
            setAmount(opened.amount);
            setFrequency(opened.frequency);
            setStartDate(opened.startDate);
            setEndDate(opened.endDate);
            setFeePercentage(opened.feePercentage);
            setFlatFee(opened.flatFee);
            setPriceMode(opened.priceMode);
            setProvider(opened.provider);
            setManualPrice(opened.manualPrice);
            setStartingBtc(opened.startingBtc);
            setStartingAvgCost(opened.startingAvgCost);
            setAnnualEscalationPct(opened.annualEscalationPct);
            if (params?.startingBtc !== undefined || params?.annualEscalationPct !== undefined) setShowMoreOptions(true);
        }

        if (linkSetsWindow && !seedAnswersIt) {
            // A shared link is a single programmatic change, not typing — skip
            // the fetch debounce so the recipient isn't parked on a skeleton.
            urlAppliedRef.current = true;
            // And the seeded result is not what the link is about. Nobody has
            // seen it as "their" result yet, so it gives way to a placeholder
            // rather than standing in, dimmed, for the sharer's plan. The
            // placeholder keeps the height the result had: a reload or Back
            // restores the reader's scroll position against the page as it
            // was, and a page that has just lost two screens of height puts
            // them somewhere else.
            setHeldHeight(resultsRef.current?.offsetHeight ?? null);
            setShownRequest(null);
        }
        const unchangedSince = (expected: { startDate: string; endDate: string }) => {
            const latest = latestRef.current;
            return latest.priceMode === 'api'
                && latest.provider === arriving.provider
                && latest.startDate === expected.startDate
                && latest.endDate === expected.endDate;
        };

        if (rollsSeededResult) {
            const load = ++priceLoadRef.current;
            getPriceHistoryAndSpot(realWindow.startTs, realWindow.endTs + DAY_MS, DEFAULT_PRICE_PROVIDER).then(({ history, spot }) => {
                if (load !== priceLoadRef.current || !unchangedSince(seedWindow)) {
                    // The visitor changed the window while this was loading; their
                    // request is the one that counts. The date is still the date.
                    setTodayUtcTs(realToday);
                    return;
                }
                if (history === null || history.data.length === 0) throw new Error('no price history');
                // Recorded before the state lands, so the fetch effect that the
                // new dates re-run finds its request already answered.
                const rolled: PriceRequest = { provider: DEFAULT_PRICE_PROVIDER, start: realWindow.startDate, end: realWindow.endDate };
                loadedRef.current = rolled;
                loadedAtRef.current = Date.now();
                // Still the plan the visit opened on, a day later.
                openedPlanRef.current = { ...opened, startDate: realWindow.startDate, endDate: realWindow.endDate };
                setTodayUtcTs(realToday);
                setStartDate(realWindow.startDate);
                setEndDate(realWindow.endDate);
                setPriceData(withPriceKinds(history.data, history.kinds));
                setPriceSource(sourceOf(history));
                setLoadedRequest(rolled);
                setLivePrice(spot?.price ?? null);
                setPriceAsOf(spot?.asOf ?? Date.now());
            }).catch(() => {
                if (load !== priceLoadRef.current) return;
                // Nothing newer could be loaded. Keep the server's result, which
                // is a true backtest of its own window, and say how old its
                // prices are rather than swap it for an error.
                setTodayUtcTs(realToday);
                setPriceSource((source) => (source ? { ...source, stale: true } : source));
            });
            return;
        }

        if (staleDay) {
            // The date is the date, whatever is on screen.
            setTodayUtcTs(realToday);
            if (datesMoveToRealDay) urlAppliedRef.current = true;
        }

        // The seeded series is the one being shown (a plain visit, or a link
        // that names the same window). Its history is right; its quote may be
        // old.
        const quoteAge = now - (initialLivePriceAsOf ?? mountClock);
        if (seedAnswersIt && (initialLivePrice == null || quoteAge > SEEDED_PRICE_MAX_AGE_MS)) {
            const load = ++priceLoadRef.current;
            const shown = { startDate: opened.startDate, endDate: opened.endDate };
            getBitcoinSpot(arriving.provider).then((spot) => {
                if (!spot || load !== priceLoadRef.current || !unchangedSince(shown)) return;
                setLivePrice(spot.price);
                setPriceAsOf(spot.asOf);
            }).catch(() => { /* keep the seeded quote: the result states the price it used */ });
        }
    }, [setSessionCurrency, mountClock, hasSeed, initialLivePrice, initialLivePriceAsOf]);

    /**
     * What the visitor set in the server's HTML before this code had loaded.
     *
     * On a slow connection the form is on screen and usable seconds before it
     * is hydrated. React keeps what was typed or picked in the fields through
     * hydration but reports none of it. Left at that, the state stays on the
     * default plan, the result under the form is for a plan the form does not
     * show, and the next render puts the fields back. Read once, after the
     * arrival above so that the visitor's own change outranks a link's. The
     * number fields do the same for themselves (useNumericInput). The currency
     * is left out: choosing one saves it as the visitor's preference, and a
     * browser that restores form fields on reload would save a link's.
     */
    const formAdoptedRef = useRef(false);
    useLayoutEffect(() => {
        if (formAdoptedRef.current) return;
        formAdoptedRef.current = true;
        const changed = (id: string, rendered: string): string | null => {
            const field = formRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
            return field && field.value !== rendered ? field.value : null;
        };
        const pickedFrequency = changed('dca-frequency', frequency);
        if (pickedFrequency !== null && isFrequency(pickedFrequency)) setFrequency(pickedFrequency);
        const pickedStart = changed('dca-start-date', startDate);
        if (pickedStart !== null) setStartDate(pickedStart);
        const pickedEnd = changed('dca-end-date', endDate);
        if (pickedEnd !== null) setEndDate(pickedEnd);
        const pickedProvider = changed('dca-provider', provider);
        if (pickedProvider !== null && isPriceProvider(pickedProvider)) setProvider(pickedProvider);
    }, [frequency, startDate, endDate, provider]);

    /** Label of the preset the current inputs correspond to, if any. */
    const activePresetLabel = useMemo(() => {
        if (endDate !== utcIsoToday(todayUtcTs)) return null;
        // Advanced fields change the numbers, so a chip must not claim the match.
        if (startingBtc > 0 || annualEscalationPct > 0) return null;
        for (const group of presetGroups) {
            for (const preset of group.presets) {
                if (preset.amount !== amount || preset.frequency !== frequency) continue;
                const presetStart = preset.startDate
                    ? preset.startDate
                    : preset.yearsBack
                        ? utcIsoYearsAgo(preset.yearsBack, todayUtcTs)
                        : null;
                if (presetStart === startDate) return preset.label;
            }
        }
        return null;
    }, [presetGroups, amount, frequency, startDate, endDate, startingBtc, annualEscalationPct, todayUtcTs]);

    const dateError = useMemo(() => {
        // Timestamps, not string comparison. A date field can hand over a
        // five-digit year: '20300-01-01' sorts before '2100-12-31' as text, and
        // as a Date it is invalid, which the date formatter throws on.
        const startTs = parseUtcDate(startDate);
        const endTs = parseUtcDate(endDate);
        if (!startDate || !endDate) return 'Pick a start date and an end date.';
        // The only way a date field hands over text that is not a date is a
        // year of five or six digits, or a browser with no date picker, where
        // the field is plain text.
        if (!Number.isFinite(startTs)) return 'The start date needs a four-digit year. If you are typing it out, use YYYY-MM-DD.';
        if (!Number.isFinite(endTs)) return 'The end date needs a four-digit year. If you are typing it out, use YYYY-MM-DD.';
        if (startTs > endTs) return 'The start date has to come before the end date.';
        // `min` on a date input is not enforced for typed values in every browser,
        // so guard here too rather than let the engine price the gap.
        if (startTs < EARLIEST_PRICE_TS) return 'Bitcoin price data starts on 18 August 2010. Pick a later start date.';
        // Same for `max`. Past this the yearly increase compounds to infinity
        // and a daily plan runs into the engine's purchase limit.
        if (!(endTs <= MAX_END_TS)) return 'The end date can be 31 December 2100 at the latest.';
        return null;
    }, [startDate, endDate]);

    useEffect(() => {
        // Not from the render before the arrival's changes: this is still
        // the default plan's window there, whatever the address asks for.
        if (arrivalPendingRef.current && !arrived) return;
        if (priceMode !== 'api' || dateError) {
            // A fetch cancelled mid-flight never reports back, so the flag is
            // cleared here or Manual mode (and date errors) could inherit a
            // failed state that nothing would ever dismiss. There is no
            // "loading" flag to clear: that state is read off whether the
            // prices in hand answer the form (see selectResultView), so it
            // cannot get stuck.
            setLoadFailed(false);
            // Coming back from Manual mode asks again, for a current quote.
            if (priceMode !== 'api') requoteRef.current = true;
            return;
        }
        const request: PriceRequest = { provider, start: startDate, end: endDate };
        const held = loadedRef.current;
        // The series in hand also prices this request when it is for the same
        // exchange and end date and an earlier start (see answersPriceRequest):
        // the results are already on screen from it, with nothing to wait for.
        const covered = answersPriceRequest(held, request);
        // It is only left at that while it is recent. The quote is how every
        // figure is valued, and a series from a cached page, or from an earlier
        // UTC day, has neither a current quote nor today's row.
        const seriesIsFresh = () => {
            const now = Date.now();
            return utcDayStart(loadedAtRef.current) === utcDayStart(now)
                && now - latestRef.current.priceAsOf <= SEEDED_PRICE_MAX_AGE_MS;
        };
        // Nothing to ask for: exactly the request already answered (the
        // server's seed on mount, the window the arrival effect loaded, a
        // setting changed and changed back), or one the series covers while it
        // is still fresh.
        if (!requoteRef.current && (samePriceRequest(held, request) || (covered && seriesIsFresh()))) {
            firstFetchRef.current = false;
            setLoadFailed(false);
            return;
        }
        // A covered request refreshes the window that is held, not the narrower
        // one: the wider series stays in hand, so the start date can go on
        // moving inside it without a request each time.
        const toLoad = covered && held ? held : request;
        // A new request starts clean. Left set through the debounce below, an
        // earlier failure would be reported against dates it was never tried for.
        setLoadFailed(false);
        let cancelled = false;
        const fetchPrices = async () => {
            const load = ++priceLoadRef.current;
            try {
                const startTs = parseUtcDate(toLoad.start);
                const endTs = parseUtcDate(toLoad.end);
                const now = Date.now();
                // One request for both: Next sends a browser's Server Actions
                // one at a time, so two made together are two round trips.
                // A missing quote does not sink the history: the engine then
                // values the stack at the last bar (correctly dated for XIRR),
                // which beats an error card.
                const { history, spot } = await getPriceHistoryAndSpot(
                    // Never later than today: a plan that starts in the future
                    // still needs the latest price to be projected at, and a
                    // window that begins after the last bar comes back empty.
                    Math.min(startTs, utcDayStart(now)),
                    endTs + DAY_MS,
                    toLoad.provider,
                );
                if (cancelled || load !== priceLoadRef.current) return;
                if (history === null || history.data.length === 0) throw new Error('no price history');
                loadedRef.current = toLoad;
                loadedAtRef.current = now;
                requoteRef.current = false;
                setPriceData(withPriceKinds(history.data, history.kinds));
                setPriceSource(sourceOf(history));
                setLoadedRequest(toLoad);
                setLivePrice(spot?.price ?? null);
                setPriceAsOf(spot?.asOf ?? now);
                // The quote and "today" move together, or the past-only run
                // could be cut off on a different day than the labels use.
                setTodayUtcTs(utcDayStart(now));
            } catch {
                if (cancelled || load !== priceLoadRef.current) return;
                if (answersPriceRequest(loadedRef.current, request)) {
                    // Only a refresh was wanted, and the series in hand still
                    // prices this plan. Keep the result and say how old its
                    // prices are, as the arrival effect does.
                    requoteRef.current = false;
                    setPriceSource((source) => (source ? { ...source, stale: true } : source));
                    return;
                }
                // The series already in memory is kept. It cannot price the new
                // request, and nothing is ever computed from it for one it does
                // not answer (selectResultView), but it still prices the plan
                // that was on screen, which stays there, marked as the earlier
                // one, next to the message and a way to try again.
                setLoadFailed(true);
            }
        };
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
    }, [arrived, startDate, endDate, priceMode, provider, dateError, retryToken]);

    /**
     * Which plan window the results describe: the form's own, or the last one
     * that could be shown.
     *
     * Swapping the whole results area for a placeholder on every change of
     * dates or exchange would build it again each time: the open tab back to
     * Compare, the chart back to its defaults, about two screens of height
     * lost and regained (taking the reader's place with them), and the ad
     * inside the results requested again. So the earlier result stays where
     * it is, dimmed and labelled, until its replacement is ready. It is the
     * earlier PLAN, dates and all, priced with the series that was loaded for
     * it: never the new dates on old prices. Only a first load, or a failed
     * one with nothing to fall back on, still shows a placeholder.
     */
    const formRequest = useMemo<PriceRequest>(
        () => ({ provider, start: startDate, end: endDate }),
        [provider, startDate, endDate],
    );
    const resultView = selectResultView({
        priceMode,
        datesValid: dateError === null,
        form: formRequest,
        shown: shownRequest,
        loaded: priceData.length > 0 ? loadedRequest : null,
        failed: loadFailed,
    });
    // "Adjust state during render": remember the form's window as the one on
    // screen the moment it can be shown.
    if (resultView.kind === 'current' && !samePriceRequest(shownRequest, formRequest)) {
        setShownRequest(formRequest);
    }
    const hasView = resultView.kind !== 'none';
    /** True while the results are for an earlier window than the form's. */
    const showingEarlier = resultView.kind === 'earlier';
    /** Why the form's own window is not the one shown; null when it is. */
    const viewHold = resultView.kind === 'current' ? null : resultView.because;
    // The height held under a link's placeholder goes when the placeholder
    // does: the result has mounted, or the wait ended in a message instead.
    if (heldHeight !== null && (hasView || viewHold !== 'loading')) {
        setHeldHeight(null);
    }
    // The window every figure below is computed for. With nothing to show the
    // form's own stands in; every computation is skipped in that case.
    const { provider: planProvider, start: planStart, end: planEnd } =
        resultView.kind === 'none' ? formRequest : resultView.request;

    // The comparison series are for one plan window. Null when there is nothing
    // to compare: Manual mode, or no result on screen.
    const comparisonKey = priceMode === 'api' && hasView ? `${planStart}|${planEnd}` : null;
    const comparisonReady = comparison !== null && comparison.key === comparisonKey;
    const sp500Data = comparisonReady ? comparison.sp500 : null;
    const goldData = comparisonReady ? comparison.gold : null;
    const cpiData = comparisonReady ? comparison.cpi : null;
    // "Loading" is the honest state from the moment a window is on screen until
    // its series answer. Derived, so there is no flag to get stuck, and the S&P
    // and gold cards never read "Data unavailable" while a request is pending.
    const comparisonLoading = comparisonKey !== null && !comparisonReady;

    useEffect(() => {
        if (comparisonKey === null) return;
        let cancelled = false;
        const fetchComparison = async () => {
            try {
                const startTs = parseUtcDate(planStart);
                const endTs = parseUtcDate(planEnd) + DAY_MS;
                // Three requests, which Next sends one after another.
                // getComparisonSeries would be one, but it stands the
                // price-only index in for a missing total-return one and does
                // not say which it returned.
                const [sp500, gold, cpi] = await Promise.all([
                    // ^SP500TR is the TOTAL RETURN index — it reinvests dividends.
                    // ^GSPC is price-only, which understated the S&P by roughly
                    // 1.5-2%/yr compounded and quietly flattered Bitcoin in every
                    // comparison. There is no falling back to it: the card is
                    // labelled total return, and without that series it says
                    // the data is unavailable.
                    getAssetPriceHistory('^SP500TR', startTs, endTs),
                    getAssetPriceHistory('GC=F', startTs, endTs),
                    // CPI alone is read through TODAY, not the window end: the
                    // stack is valued at today's price, so the inflation it is
                    // measured against has to run to today as well. The S&P and
                    // gold series stop at the window end on purpose (see
                    // windowRun below).
                    getCpiData(startTs, Math.max(endTs, todayUtcTs + DAY_MS)),
                ]);
                if (cancelled) return;
                setComparison({ key: comparisonKey, sp500, gold, cpi });
            } catch {
                if (cancelled) return;
                setComparison({ key: comparisonKey, sp500: null, gold: null, cpi: null });
            }
        };
        const timer = setTimeout(fetchComparison, 600);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // Keyed on the window on screen, not the form's: these series are
        // compared with the bitcoin result, and have to be for the same dates.
    }, [comparisonKey, comparisonRetry, planStart, planEnd, todayUtcTs]);

    // A series that did not arrive is asked for again when the connection
    // comes back. Nothing else would ask, short of a change of dates.
    const comparisonIncomplete = comparison !== null && comparison.key === comparisonKey
        && (comparison.sp500 === null || comparison.gold === null || comparison.cpi === null);
    useEffect(() => {
        if (!comparisonIncomplete) return;
        const retry = () => {
            setComparison(null);
            setComparisonRetry((n) => n + 1);
        };
        window.addEventListener('online', retry);
        return () => window.removeEventListener('online', retry);
    }, [comparisonIncomplete]);

    const amountUsd = useMemo(() => deferredAmount / currencyConfig.rate, [deferredAmount, currencyConfig.rate]);
    // The flat fee is typed in the display currency, like the amount, and the
    // engine works in USD.
    const flatFeeUsd = useMemo(
        () => (deferredFlatFee > 0 ? deferredFlatFee / currencyConfig.rate : 0),
        [deferredFlatFee, currencyConfig.rate],
    );

    const isFutureEndDate = parseUtcDate(planEnd) > todayUtcTs;
    const todayIso = utcIsoToday(todayUtcTs);

    // Starting-stack cost is entered per-BTC in the display currency.
    const startingAvgCostUsd = useMemo(
        () => (deferredStartingAvgCost > 0 ? deferredStartingAvgCost / currencyConfig.rate : undefined),
        [deferredStartingAvgCost, currencyConfig.rate],
    );

    // The plan as the engine takes it. One object, so the runs below cannot
    // drift apart in what they are asked to compute.
    const planParams = useMemo(() => ({
        amount: amountUsd,
        frequency,
        startDate: new Date(parseUtcDate(planStart)),
        endDate: new Date(parseUtcDate(planEnd)),
        feePercentage: deferredFee,
        flatFee: flatFeeUsd,
        priceMode,
        manualPrice: deferredManualPrice,
        startingBtc: deferredStartingBtc,
        startingAvgCost: startingAvgCostUsd,
        annualEscalationPct: deferredEscalation,
    }), [amountUsd, frequency, planStart, planEnd, deferredFee, flatFeeUsd, priceMode, deferredManualPrice, deferredStartingBtc, startingAvgCostUsd, deferredEscalation]);

    const spotPrice = priceMode === 'api' ? livePrice : undefined;
    // The price the Project tab's panels start from: the one the stack above
    // them is valued at. In Manual mode that is the typed price. Handed the
    // live quote there, they would value coins bought at the typed price at
    // the market's, a return that neither price produces.
    const panelPrice = priceMode === 'manual' ? deferredManualPrice : livePrice;
    // The instant the stack is valued at: when the live price was quoted, and
    // never before today began. It is also the engine's "today" for the
    // past-only run, so that run and `isFutureEndDate` cut at the same day.
    const valuedAt = Math.max(priceAsOf, todayUtcTs);

    // The whole plan, to its end date. When that is in the future the engine
    // prices the buys still to come at the last known price, so these figures
    // are a projection and every label that shows them says so.
    const results = useMemo(() => {
        if (!hasView) return EMPTY_RESULT;
        return withoutFloatNoise(calculateDca(planParams, priceData, spotPrice, valuedAt));
    }, [hasView, planParams, priceData, spotPrice, valuedAt]);

    // The plan as it stands today: only purchases dated on or before today.
    // Every panel that says what happened, or what "you have", reads this one:
    // the stats strip, the comparisons, stacking goals, FIRE, the spend-down
    // planner, the share card and the CSV. Handing any of them the full-range
    // figures presents coins that have not been bought as held, and FIRE and
    // Future Projection then add the same future buys a second time.
    const pastResults = useMemo(() => {
        if (!hasView || !isFutureEndDate) return results;
        return withoutFloatNoise(calculateDcaToDate(planParams, priceData, spotPrice, valuedAt));
    }, [results, hasView, isFutureEndDate, planParams, priceData, spotPrice, valuedAt]);

    // Schedule-only view of the past-only result, for panels whose comparison
    // has no "coins already held" analogue (savings, lump sum, exchange fees).
    // Stack value separates exactly: it owns startingBtc/totalBtc of the coins.
    const stackCost = pastResults.stats?.startingStackCost ?? 0;
    const stackShare = deferredStartingBtc > 0 && pastResults.btcAccumulated > 0
        ? Math.min(1, deferredStartingBtc / pastResults.btcAccumulated)
        : 0;
    const scheduledOnly = useMemo(() => {
        const invested = Math.max(0, pastResults.totalInvested - stackCost);
        const value = pastResults.currentValue * (1 - stackShare);
        return {
            invested,
            value,
            roi: invested > 0 ? ((value - invested) / invested) * 100 : 0,
            profit: value - invested,
        };
    }, [pastResults.totalInvested, pastResults.currentValue, stackCost, stackShare]);

    const lumpSumResult = useMemo(() => {
        if (priceMode !== 'api' || !priceData.length || !livePrice || !hasView) return null;
        // Schedule money only: lump-summing the stack's cost at the WINDOW-START
        // price against stack coins bought years earlier hands the DCA side all
        // the pre-window appreciation and decides the panel by the stack.
        // A lump sum is one order, so the engine charges it the flat fee once.
        return calculateLumpSum(scheduledOnly.invested, new Date(parseUtcDate(planStart)), priceData, livePrice, deferredFee, flatFeeUsd);
    }, [priceMode, priceData, livePrice, scheduledOnly.invested, planStart, hasView, deferredFee, flatFeeUsd]);

    // The asset comparison describes what happened, so for a plan that runs
    // past today all three assets stop at today. Left to run on, each would
    // just repeat its own last price for every buy still to come.
    const comparisonEnd = useMemo(
        () => new Date(Math.min(parseUtcDate(planEnd), todayUtcTs)),
        [planEnd, todayUtcTs],
    );

    const sp500Result: AssetDcaResult | null = useMemo(() => {
        if (!sp500Data || !hasView) return null;
        return calculateAssetDca(amountUsd, frequency, new Date(parseUtcDate(planStart)), comparisonEnd, deferredFee, sp500Data, '^SP500TR', 'S&P 500 (total return)', deferredEscalation, flatFeeUsd);
    }, [sp500Data, hasView, amountUsd, frequency, planStart, comparisonEnd, deferredFee, deferredEscalation, flatFeeUsd]);

    const goldResult: AssetDcaResult | null = useMemo(() => {
        if (!goldData || !hasView) return null;
        return calculateAssetDca(amountUsd, frequency, new Date(parseUtcDate(planStart)), comparisonEnd, deferredFee, goldData, 'GC=F', 'Gold', deferredEscalation, flatFeeUsd);
    }, [goldData, hasView, amountUsd, frequency, planStart, comparisonEnd, deferredFee, deferredEscalation, flatFeeUsd]);

    // The buying schedule alone, valued at the series' own last bar: no
    // starting stack and no live price. Two panels need exactly this run.
    //
    // The comparison panel's BTC row: the same semantics calculateAssetDca
    // gives S&P/gold. Reusing the headline figures there valued BTC at TODAY's
    // spot against comparators frozen at the window-end close, so a 2017→2019
    // backtest was "won" by years of post-window appreciation only one side
    // received. The comparators have no analogue of "coins already held"
    // either, so including the stack would decide the panel by the stack, not
    // the plan. Escalation IS passed: all three assets get the same deposits.
    //
    // And "your start" in the every-start-date card, which ranks this plan
    // among runs that are valued on their own last day.
    //
    // The series is fetched through the day after the end date, and with no
    // live price the engine values the stack at the series' last row. Cut to
    // the end day, bitcoin is valued on the same day as the S&P and gold.
    const windowRun = useMemo(() => {
        if (!hasView) return EMPTY_RESULT;
        return calculateDca(
            { ...planParams, endDate: comparisonEnd, startingBtc: 0, startingAvgCost: undefined },
            seriesThroughDay(priceData, comparisonEnd.getTime()),
            undefined,
            valuedAt,
        );
    }, [hasView, planParams, comparisonEnd, priceData, valuedAt]);

    const btcAssetResult: AssetDcaResult = useMemo(() => ({
        asset: 'BTC', label: 'Bitcoin', totalInvested: windowRun.totalInvested, currentValue: windowRun.currentValue,
        profit: windowRun.profit, roi: windowRun.roi,
        breakdown: windowRun.breakdown.map(b => ({ date: b.date, portfolioValue: b.portfolioValue })),
    }), [windowRun]);

    // Scheduled market buys only. The starting stack's breakdown row is a
    // position, not a purchase — counting it made every "N purchases" surface,
    // the fee panel's per-buy math, and the share receipt over-count by one.
    const purchaseCount = results.breakdown.length > 0 && results.breakdown[0].isStartingStack
        ? results.breakdown.length - 1
        : results.breakdown.length;
    // The same count for the purchases already made.
    const pastPurchaseCount = pastResults.breakdown.length > 0 && pastResults.breakdown[0].isStartingStack
        ? pastResults.breakdown.length - 1
        : pastResults.breakdown.length;

    // With escalation, "keep buying" projections must start from what the plan
    // pays TODAY, not the year-one amount.
    const currentAmountUsd = useMemo(() => {
        if (deferredEscalation <= 0) return amountUsd;
        const startTs = parseUtcDate(planStart);
        if (!Number.isFinite(startTs) || startTs >= todayUtcTs) return amountUsd;
        return amountUsd * Math.pow(1 + deferredEscalation / 100, utcFullYearsBetween(startTs, todayUtcTs));
    }, [amountUsd, deferredEscalation, planStart, todayUtcTs]);

    const durationText = useMemo(() => {
        if (results.breakdown.length < 2) return null;
        // The plan's window, in whole months and in UTC like its dates. Not
        // the span from the first buy to the last: a weekly plan's last buy
        // can fall six days short of the end date, which is a month fewer.
        const totalMonths = utcMonthsBetween(parseUtcDate(planStart), parseUtcDate(planEnd));
        // Under a month there is no length worth stating.
        if (!(totalMonths > 0)) return null;
        const years = Math.floor(totalMonths / 12);
        const months = totalMonths % 12;
        if (years > 0 && months > 0) return `${years}y ${months}mo`;
        if (years > 0) return `${years}y`;
        return `${months}mo`;
    }, [results.breakdown.length, planStart, planEnd]);

    // Inflation-adjusted return of the purchases made so far. The method (each
    // purchase restated from its own month, CPI read through the day the stack
    // is valued) is in utils/realReturn.
    const inflationStats = useMemo(() => {
        if (priceMode !== 'api' || !hasView) return null;
        // The same instant the engine valued the stack at: the live quote, or
        // the series' last bar when there is none.
        const lastBarTs = priceData.length > 0 ? priceData[priceData.length - 1][0] : NaN;
        return calculateRealReturn(pastResults.breakdown, pastResults.currentValue, cpiData, livePrice ? valuedAt : lastBarTs);
    }, [priceMode, hasView, cpiData, pastResults.breakdown, pastResults.currentValue, livePrice, valuedAt, priceData]);

    // The plan's own length and return, measured the way the every-start-date
    // card measures its runs: purchases through today at the latest, valued at
    // the price on the last day. Null when the plan is not like those runs.
    const ownRun = useMemo(() => {
        const startTs = parseUtcDate(planStart);
        const throughTs = comparisonEnd.getTime();
        if (!hasView || !Number.isFinite(startTs) || !(throughTs > startTs)) return null;
        const durationDays = Math.round((throughTs - startTs) / DAY_MS);
        // The runs buy a fixed amount and pay a percentage fee only, so a plan
        // with a yearly increase or a flat fee has no place among them.
        const comparable = deferredEscalation <= 0 && flatFeeUsd <= 0 && windowRun.totalInvested > 0;
        let returnPercent: number | null = null;
        if (comparable) {
            // The series can run a day past the window (it is fetched through
            // the day after the end date), so take the last bar inside it.
            let endPrice = 0;
            for (let i = priceData.length - 1; i >= 0; i--) {
                if (priceData[i][0] < throughTs + DAY_MS) {
                    endPrice = priceData[i][1];
                    break;
                }
            }
            if (endPrice > 0) returnPercent = (windowRun.btcAccumulated * endPrice / windowRun.totalInvested - 1) * 100;
        }
        return { durationDays, returnPercent };
    }, [planStart, comparisonEnd, hasView, deferredEscalation, flatFeeUsd, windowRun, priceData]);

    const isProfit = results.profit >= 0;

    // Fee presets resolve for the calculator's own "today", so a dated
    // promotion lapses on its end date for the server render and the browser
    // alike. See data/exchangeFees.
    const feePresets = useMemo(() => feePresetsAsOf(todayUtcTs), [todayUtcTs]);
    const presetMatches = useCallback(
        // The flat fee field is in the display currency, to the cent.
        (preset: FeePreset) => feePercentage === preset.feePercentage
            && Math.abs(flatFee - preset.flatFee * currencyConfig.rate) < 0.005,
        [feePercentage, flatFee, currencyConfig.rate],
    );
    // Pressed: the chip the visitor tapped, while the fields still hold its
    // numbers. A fee that was typed or came from a link lights a chip only when
    // exactly one platform publishes it.
    const activeFeePreset = useMemo(() => {
        const matching = feePresets.filter(presetMatches);
        return matching.find((preset) => preset.id === feePresetId)
            ?? (matching.length === 1 ? matching[0] : null);
    }, [feePresets, presetMatches, feePresetId]);

    const applyFeePreset = useCallback((preset: FeePreset) => {
        setFeePresetId(preset.id);
        setFeePercentage(preset.feePercentage);
        // Presets are in USD; the field is in the display currency.
        setFlatFee(Math.round(preset.flatFee * currencyConfig.rate * 100) / 100);
    }, [currencyConfig.rate]);

    // What one buy pays, for the line under the fee fields. Same arithmetic
    // as the engine: the percentage plus the flat fee, never more than the
    // buy. The buy is the amount as typed: every buy of a plan with no yearly
    // increase, and the first year's buys of one that has it, which the line
    // then says.
    const spreadOnly = activeFeePreset?.includes === 'spread';
    const perBuyFee = useMemo(() => {
        const buy = amountUsd;
        if (!(buy > 0)) return null;
        const fee = Math.min(buy, buy * (Math.min(100, Math.max(0, deferredFee)) / 100) + flatFeeUsd);
        const firstYear = deferredEscalation > 0;
        const nothingBought = fee >= buy;
        if (nothingBought) {
            return { nothingBought, text: `${firstYear ? 'In the first year no bitcoin is bought' : 'No bitcoin is bought'}: the fee is at least the purchase amount.` };
        }
        if (!(fee > 0)) return { nothingBought, text: 'No fee is taken from each buy.' };
        // A platform that charges no fee and takes a spread is named for what
        // it takes: its chip's note, two lines down, says "no fee".
        const taker = spreadOnly ? 'the spread takes' : 'fees take';
        const lead = firstYear ? `In the first year, ${taker}` : `${taker[0].toUpperCase()}${taker.slice(1)}`;
        const share = plainPercent((fee / buy) * 100);
        const buyText = padCents(formatCurrency(buy, 2));
        // To the cent, or the whole yen, like the fee table. The amount is
        // left out when that rounding would be more than a twentieth off: a
        // quarter of a yen is neither "¥0" nor "¥1", and the share alone is
        // then the true statement.
        const minor = currencyConfig.code === 'JPY' ? 0 : 2;
        const feeShown = fee * currencyConfig.rate;
        const printable = Math.abs(Number(feeShown.toFixed(minor)) - feeShown) <= feeShown * 0.05;
        return {
            nothingBought,
            text: printable
                ? `${lead} ${feeCostLabel(feeShown, currencyConfig.symbol, minor)} of each ${buyText} buy, which is ${share} of it.`
                : `${lead} ${share} of each ${buyText} buy.`,
        };
    }, [amountUsd, deferredFee, flatFeeUsd, deferredEscalation, spreadOnly, formatCurrency, currencyConfig.code, currencyConfig.rate, currencyConfig.symbol]);

    const handleExportCsv = useCallback(() => {
        // Purchases made so far. A CSV is read on its own, away from the
        // "projected" labels on this page, and a row dated next year would be
        // a transaction that never happened. With none made there is no
        // file: a starting stack alone is a position, not a transaction.
        if (pastPurchaseCount === 0) return;
        const csv = generateCsvContent(pastResults.breakdown, { code: currencyConfig.code, rate: currencyConfig.rate, asOf: ratesAsOf });
        downloadCsv(csv, `bitcoin-dca-${planStart}-to-${isFutureEndDate ? todayIso : planEnd}.csv`);
    }, [pastResults.breakdown, pastPurchaseCount, planStart, planEnd, isFutureEndDate, todayIso, currencyConfig.code, currencyConfig.rate, ratesAsOf]);

    const handleShare = useCallback(async () => {
        // The plan on screen. That is the form's own, except while the form
        // holds dates that cannot be run or prices that are still loading,
        // when the link should open the result the sharer is looking at.
        const paramStr = encodeParams({ amount, frequency, startDate: planStart, endDate: planEnd, feePercentage, flatFee, priceMode, provider: planProvider, manualPrice, currency: currencyConfig.code, startingBtc, startingAvgCost, annualEscalationPct });
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
            setShareStatus('copied');
        } catch {
            setShareStatus('failed');
        }
        shareTimerRef.current = setTimeout(() => setShareStatus(null), 2000);
    }, [amount, frequency, planStart, planEnd, feePercentage, flatFee, priceMode, planProvider, manualPrice, currencyConfig.code, startingBtc, startingAvgCost, annualEscalationPct]);

    /**
     * Mirror the settings into the address bar, once the visitor has changed
     * them.
     *
     * Copying the URL is how people actually share a result, so a plan the
     * visitor has set is in the address. replaceState (not pushState) so
     * configuring the calculator never fills up the back button.
     *
     * Until then the address stays exactly as the visit found it. Written on
     * every visit, the default plan would carry that day's dates, and a
     * restored tab or a bookmark would reopen a window that has stopped
     * moving, under a headline that still says "the last 5 years". A link
     * keeps the address it arrived with, campaign tags and all.
     */
    const pendingAddressWrite = useRef<{ timer: ReturnType<typeof setTimeout>; write: () => void } | null>(null);
    useEffect(() => {
        const opened = openedPlanRef.current;
        if (opened === null || (arrivalPendingRef.current && !arrived) || dateError) return;
        // A picked currency is shown once its rate is in hand (see
        // CurrencyContext). The address waits with it, so it never names the
        // currency that is on its way out.
        if (currency !== currencyConfig.code) return;
        const plan: PlanSettings = {
            amount, frequency, startDate, endDate, feePercentage, flatFee,
            priceMode, provider, manualPrice, startingBtc, startingAvgCost, annualEscalationPct,
        };
        if (!addressOwnedRef.current) {
            if (samePlan(plan, opened)) return;
            addressOwnedRef.current = true;
        }
        const write = () => {
            pendingAddressWrite.current = null;
            const query = encodeParams({ ...plan, currency: currencyConfig.code });
            window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
        };
        const timer = setTimeout(write, 400);
        pendingAddressWrite.current = { timer, write };
        return () => {
            clearTimeout(timer);
            if (pendingAddressWrite.current?.timer === timer) pendingAddressWrite.current = null;
        };
    }, [arrived, amount, frequency, startDate, endDate, feePercentage, flatFee, priceMode, provider, manualPrice, currency, currencyConfig.code, startingBtc, startingAvgCost, annualEscalationPct, dateError]);

    // A write still waiting out its 400ms is made at the start of any click,
    // before the click can begin a navigation. Next turns replaceState into a
    // router action of its own, and one that lands while a navigation is in
    // flight cancels it: a tap on a nav link within moments of an edit would
    // do nothing, or go to the page and come straight back. Capture phase on
    // the document, so it runs ahead of the link's own handler.
    useEffect(() => {
        const writeNow = () => {
            const pending = pendingAddressWrite.current;
            if (!pending) return;
            clearTimeout(pending.timer);
            pending.write();
        };
        document.addEventListener('click', writeNow, true);
        return () => document.removeEventListener('click', writeNow, true);
    }, []);

    const handleRetry = useCallback(() => setRetryToken(t => t + 1), []);

    const amountField = useNumericInput(amount, setAmount, { min: 0, max: URL_PARAM_LIMITS.maxAmount });
    const feeField = useNumericInput(feePercentage, setFeePercentage, { min: 0, max: URL_PARAM_LIMITS.maxFeePct });
    const flatFeeField = useNumericInput(flatFee, setFlatFee, { min: 0, max: URL_PARAM_LIMITS.maxFlatFee });
    const manualPriceField = useNumericInput(manualPrice, setManualPrice, { min: 1, max: URL_PARAM_LIMITS.maxAmount });
    const startingBtcField = useNumericInput(startingBtc, setStartingBtc, { min: 0, max: URL_PARAM_LIMITS.maxStartingBtc });
    const startingCostField = useNumericInput(startingAvgCost, setStartingAvgCost, { min: 0, max: URL_PARAM_LIMITS.maxAmount });
    const escalationField = useNumericInput(annualEscalationPct, setAnnualEscalationPct, { min: 0, max: URL_PARAM_LIMITS.maxEscalationPct });

    // A number typed past a field's range is replaced by the nearest value the
    // field takes. Each of these is the sentence saying so: under the field,
    // and in the screen-reader status, which is why each one names its field.
    const plainNumber = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 });
    const inDisplayCurrency = (n: number) => `${currencyConfig.symbol}${plainNumber(n)}`;
    const noteFor = (label: string, hit: LimitHit | null | false, format: (n: number) => string): string | null =>
        (hit ? limitMessage(label, hit, format) : null);
    // A field that is not in the form has no note: its limit outlives it in
    // the hook, and the status would go on naming a field nobody can see.
    const limitNotes = {
        amount: noteFor('The amount', amountField.limitHit, inDisplayCurrency),
        fee: noteFor('The fee', feeField.limitHit, (n) => `${plainNumber(n)}%`),
        flatFee: noteFor('The flat fee', flatFeeField.limitHit, inDisplayCurrency),
        // Typed in US dollars whatever the display currency: the label says so.
        manualPrice: noteFor('The price', priceMode === 'manual' && manualPriceField.limitHit, (n) => `$${plainNumber(n)}`),
        startingBtc: noteFor('The starting stack', showMoreOptions && startingBtcField.limitHit, (n) => `${plainNumber(n)} BTC`),
        startingCost: noteFor('Its average cost', showMoreOptions && startingCostField.limitHit, inDisplayCurrency),
        escalation: noteFor('The yearly increase', showMoreOptions && escalationField.limitHit, (n) => `${plainNumber(n)}%`),
    };

    const profitClass = isProfit ? 'text-gain' : 'text-loss';

    // Shown with the result when the prices on screen are not the ones that
    // were asked for: the other exchange's, an earlier copy, or both at once
    // (both exchanges down, and the only copy left is the other one's).
    const priceSourceNotice = priceMode === 'api' && priceSource
        ? [
            priceFallbackNotice(priceSource.requestedProvider, priceSource.servedProvider),
            priceSource.stale ? priceStaleNotice(priceSource.servedProvider, priceSource.fetchedAt) : null,
        ].filter(Boolean).join(' ') || null
        : null;

    // The home page's headline sentence states the default plan. It is told
    // whether the form still holds that plan, and it is kept equal to this
    // card whenever the two describe the same one. See HeroProofLine.
    const defaultWindow = defaultPlanWindow(todayUtcTs);
    const formIsDefaultPlan = priceMode === 'api'
        && provider === DEFAULT_PRICE_PROVIDER
        && currencyConfig.code === 'USD'
        && amount === DEFAULT_PLAN.amount
        && frequency === DEFAULT_PLAN.frequency
        && feePercentage === DEFAULT_PLAN.feePercentage
        && flatFee === 0 && startingBtc === 0 && annualEscalationPct === 0
        && startDate === defaultWindow.startDate && endDate === defaultWindow.endDate;
    const showingDefaultPlan = formIsDefaultPlan
        && deferredAmount === DEFAULT_PLAN.amount
        && deferredFee === DEFAULT_PLAN.feePercentage
        && deferredFlatFee === 0
        && deferredStartingBtc === 0 && deferredEscalation === 0
        // And that plan is the one on screen, not an earlier one standing in.
        && resultView.kind === 'current' && purchaseCount > 0;
    useEffect(() => {
        if (!showingDefaultPlan) return;
        publishDefaultPlanFigures({ invested: results.totalInvested, value: results.currentValue, roi: results.roi });
    }, [showingDefaultPlan, results.totalInvested, results.currentValue, results.roi]);
    // Layout effects, so the sentence changes in the same paint as the form.
    // Nothing is said from the render before the arrival's changes: the form
    // still holds the default plan there, whatever the address asks for.
    useLayoutEffect(() => {
        if (arrivalPendingRef.current && !arrived) return;
        publishShownPlan(formIsDefaultPlan ? 'default' : 'other');
    }, [arrived, formIsDefaultPlan]);
    useLayoutEffect(() => () => publishShownPlan(null), []);
    // The commit that sets planShown has taken the calculator's own marks off
    // (see pendingMark), so the document's can go, unless the sentence is
    // still waiting to hear.
    useLayoutEffect(() => {
        if (planShown) releasePlanLinkMark();
    }, [planShown]);

    // The price the headline value is struck at, in words. It is "today's
    // price" only with a live quote in hand. Without one the engine values the
    // stack at the last daily price of the fetched range, which for a backtest
    // that ended in 2019 is a 2019 price; and in Manual mode every figure is at
    // the price that was typed. "Worth today" over either of those is false.
    const lastBarTs = priceData.length > 0 ? priceData[priceData.length - 1][0] : NaN;
    const valuedAtLivePrice = priceMode === 'api' && !!livePrice;
    const priceWords = priceMode === 'manual'
        ? `${formatCurrency(deferredManualPrice)} per BTC`
        : valuedAtLivePrice || !Number.isFinite(lastBarTs)
            ? 'today’s price'
            : `the ${formatUtc(lastBarTs, 'full')} price`;
    // What the purchases still to come are priced at, for the chart and the
    // purchase table: their own default is "the last known price".
    const plannedPriceWords = priceMode === 'manual' ? 'the price you typed' : undefined;

    // The chart's last point is the last purchase, and the headline is valued
    // after it: at today's quote, or at the last daily price. So the chart
    // ends where the headline does, it is handed that valuation as a closing
    // point. Only within one buying interval of the last purchase: on a time
    // axis, a plan that ended years ago would get a long straight line to
    // today in place of the prices in between.
    const chartValuation = useMemo(() => {
        if (isFutureEndDate || priceMode !== 'api' || results.breakdown.length === 0 || !(results.btcAccumulated > 0)) return undefined;
        const markTs = valuedAtLivePrice ? todayUtcTs : utcDayStart(lastBarTs);
        const lastBuyTs = Date.parse(results.breakdown[results.breakdown.length - 1].date);
        const intervalDays = { daily: 1, weekly: 7, biweekly: 14, monthly: 31 }[frequency];
        if (!Number.isFinite(markTs) || !(markTs > lastBuyTs) || markTs - lastBuyTs > intervalDays * DAY_MS) return undefined;
        return { ts: markTs, price: results.currentValue / results.btcAccumulated, value: results.currentValue };
    }, [isFutureEndDate, priceMode, results, valuedAtLivePrice, todayUtcTs, lastBarTs, frequency]);

    // The day the savings comparison values both sides on. With a live quote,
    // or a typed price, that is today. With neither, the engine has valued the
    // bitcoin at the series' last bar, which for a backtest that ended in 2019
    // is a 2019 price: a savings balance compounded on to today would then be
    // set against bitcoin priced seven years earlier.
    const savingsMarkTs = priceMode === 'manual' || valuedAtLivePrice || !Number.isFinite(lastBarTs)
        ? todayUtcTs
        : Math.max(utcDayStart(lastBarTs), comparisonEnd.getTime());

    // An amount of zero buys nothing, and the engine then makes no purchases.
    // With no starting stack either there is no result to state: "$0, +0.0%"
    // is not one. Zero WITH a stack is a real plan, "I hold and buy no more":
    // it has a headline, and nothing that describes purchases.
    const buysNothing = hasView && !(amountUsd > 0);
    const nothingInvested = buysNothing && results.totalInvested === 0;
    const holdOnly = buysNothing && results.totalInvested > 0;
    const hasHeadline = hasView && (purchaseCount > 0 || holdOnly);
    // Figures that count purchases still to come. A stack that is only held
    // has none, whatever its end date.
    const isProjection = isFutureEndDate && !holdOnly;
    // From the start date on there is a past to describe. Before it there
    // are no days to measure: a starting stack is the only row.
    const planStarted = parseUtcDate(planStart) <= todayUtcTs;

    // The plan in words, for the sentence under the result. A starting stack
    // and a yearly increase change what was paid in and what is held, so the
    // sentence names them: "buying $50 every week would have bought 1.2 BTC"
    // is false when a whole bitcoin of that was there before the first buy.
    // Read off the run itself: the engine leaves out a stack it cannot cost.
    const heldAtStart = results.breakdown.length > 0 && results.breakdown[0].isStartingStack
        ? formatBtcAmount(results.breakdown[0].accumulated)
        : null;
    const buyWords = `${currencyConfig.symbol}${amount.toLocaleString('en-US')} of Bitcoin every ${EVERY[frequency]}`
        + (deferredEscalation > 0 ? `, raised ${plainPercent(deferredEscalation)} each year,` : '');

    // A result in another currency is the dollar result at one exchange rate:
    // every buy is converted at the rate dated `ratesAsOf`, whenever it was
    // made. The money paid in is exact. The bitcoin it bought, and so the
    // value and the return, are not what a plan paid in that currency day by
    // day came to, and the result says so where it stands rather than only on
    // the methodology page. Named by its date, not as "today's": the ECB
    // publishes on working days, and the fallback table is older still.
    const convertedCurrency = currencyConfig.code !== 'USD' ? currencyConfig.code : null;
    const fxRateWords = `one exchange rate for every buy, the one dated ${formatUtc(ratesAsOf, 'full')}`;
    const currencyNote = rateNote
        ?? (convertedCurrency ? `${convertedCurrency} figures use ${fxRateWords}, not the rate on the day of each buy.` : null);

    // The window on screen, in words, for when it is not the form's.
    const shownRange = hasView
        ? `${formatUtc(parseUtcDate(planStart), 'full')} to ${formatUtc(parseUtcDate(planEnd), 'full')}`
        : '';
    const shownSource = priceMode === 'api' ? `, on ${PRICE_PROVIDER_LABELS[planProvider].name} prices` : '';

    // What is said to a screen reader when the results change. One region, so
    // a change is announced once.
    const worthWords = valuedAtLivePrice
        ? `now worth ${formatCurrency(results.currentValue)}`
        : `worth ${formatCurrency(results.currentValue)} at ${priceWords}`;
    // The return as the screen prints it, in words: the same digits, and a
    // gain or a loss only when the printed figure carries a sign.
    const roiShown = signedPercent(results.roi);
    const returnWords = /^[+-]/.test(roiShown)
        ? `a ${roiShown.startsWith('+') ? 'gain' : 'loss'} of ${roiShown.slice(1, -1)} percent`
        : 'no gain or loss';
    const resultSentence = !hasView
        ? ''
        : nothingInvested
            ? 'Enter an amount above zero to see a result.'
            : holdOnly
                ? `No purchases. ${heldAtStart} held at a cost of ${formatCurrency(results.totalInvested)}, ${worthWords}, ${returnWords}.`
                : purchaseCount === 0
                    ? ''
                    : isFutureEndDate
                        // A plan that runs past today is a projection here too:
                        // "now worth" would claim coins not yet bought.
                        ? `${countOf(purchaseCount, 'planned purchase')}, ${pastPurchaseCount.toLocaleString('en-US')} made so far. Total to invest ${formatCurrency(results.totalInvested)}. Projected value at ${priceWords} ${formatCurrency(results.currentValue)}.`
                        : `${countOf(purchaseCount, 'purchase')}. Invested ${formatCurrency(results.totalInvested)}, ${worthWords}, ${returnWords}.`;
    const holdSentence = viewHold === null
        ? ''
        : viewHold === 'dates'
            ? `${dateError ?? ''}${showingEarlier ? ` The results shown are still for ${shownRange}.` : ''}`
            : viewHold === 'failed'
                ? showingEarlier
                    ? `The prices for your new settings could not be loaded. The results shown are still for ${shownRange}${shownSource}.`
                    : 'Price data unavailable.'
                : showingEarlier ? 'Updating prices…' : 'Calculating…';
    const statusText = [
        ...Object.values(limitNotes).filter((note): note is string => note !== null),
        viewHold === null ? resultSentence : holdSentence,
    ].filter(Boolean).join(' ');

    // The folded fields in one line, so that nothing the result depends on is
    // out of sight while they are closed.
    const settingsSummary = [
        flatFee > 0
            ? `${plainPercent(feePercentage)} + ${inDisplayCurrency(flatFee)} fee per buy`
            : feePercentage > 0 ? `${plainPercent(feePercentage)} fee` : 'No fee',
        priceMode === 'manual'
            ? `Fixed price of ${formatCurrency(manualPrice)} per BTC`
            : `${PRICE_PROVIDER_LABELS[provider].name} prices`,
        currencyConfig.code,
        startingBtc > 0 && `${formatBtcAmount(startingBtc)} starting stack`,
        annualEscalationPct > 0 && `${plainPercent(annualEscalationPct)} more each year`,
    ].filter(Boolean).join(' · ');

    // Until the arrival, every figure on screen is the default plan's, and for
    // a render or two after it: the results are computed from the deferred
    // copies of the typed numbers, which trail the form. A visit that opened
    // on a link has its document marked before first paint
    // (hooks/planLinkBootstrap), and globals.css hides whatever carries this
    // attribute while that mark is there: the default plan's result is never
    // shown as the answer to another plan's link. Latched, so that typing
    // later does not put the marks back. On a plain visit the attribute is
    // simply left where the server put it: nothing reads it there.
    const figuresFollowForm = deferredAmount === amount
        && deferredFee === feePercentage
        && deferredFlatFee === flatFee
        && deferredManualPrice === manualPrice
        && deferredStartingBtc === startingBtc
        && deferredStartingAvgCost === startingAvgCost
        && deferredEscalation === annualEscalationPct;
    if (arrived && figuresFollowForm && !planShown) {
        setPlanShown(true);
    }
    const pendingMark = planShown ? undefined : '';

    // The docked bar's one-line reading of the headline (see DockedResult).
    const dockLabel = isProjection ? 'Projected' : valuedAtLivePrice ? 'Worth today' : 'Value';
    const dockNote = holdOnly
        ? 'no purchases'
        : flatFeeUsd > 0
            ? 'after fees'
            : deferredFee > 0 ? `after ${plainPercent(deferredFee)} fee` : 'no fee';

    return (
        <div className="space-y-6 sm:space-y-8">
            {/*
              Results update silently for screen-reader users: changing an input
              re-renders the cards with no announcement, so there is no way to
              tell the calculation finished. This lives outside the results
              subtree, so it survives every state of it and is not re-announced
              wholesale on every re-render. It also carries what the screen shows
              in other ways: a field that was capped, a date that cannot be run,
              and that the results on screen are still the earlier ones.
            */}
            <ResultStatus text={statusText} immediate={arrived && !planShown} pendingMark={pendingMark} />

            {/* Input Section */}
            {/* scroll-mb on the controls, below md: a field focused at the foot of
                the screen is scrolled clear of the tab bar by the page's own
                scroll padding, and this keeps it clear of the docked result bar
                above the tab bar as well, with room for the note a field can
                show under itself. */}
            <div ref={formRef} className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden max-md:[&_:is(input,select,button)]:scroll-mb-24">
                <h2 className="text-lg sm:text-xl font-bold mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />
                    Your plan
                </h2>

                {/* Presets. Phones show the first three and keep the rest behind
                    "More scenarios": eight chips at the 44px touch height are
                    about 290px of form between the heading and the first field. */}
                <div className="space-y-3 mb-5 sm:mb-6">
                    {presetGroups.map((group, groupIndex) => {
                        const titleId = `dca-scenarios-${groupIndex}`;
                        return (
                            <div key={group.title} className={clsx(groupIndex > 0 && !showMoreScenarios && 'hidden sm:block')}>
                                <div id={titleId} className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                    {group.title}
                                </div>
                                <div role="group" aria-labelledby={titleId} className="flex flex-wrap gap-1.5 sm:gap-2">
                                    {group.presets.map((preset, presetIndex) => {
                                        // Reflect which preset the current inputs match, so
                                        // clicking one gives visible feedback instead of the
                                        // chips looking permanently inert.
                                        const isActive = activePresetLabel === preset.label;
                                        const folded = groupIndex === 0 && presetIndex >= VISIBLE_SCENARIOS && !showMoreScenarios;
                                        return (
                                            // `contents`: the wrapper only carries the phone-width
                                            // fold, and the chip stays the flex item.
                                            <span key={preset.label} className={folded ? 'hidden sm:contents' : 'contents'}>
                                                <button
                                                    type="button"
                                                    onClick={() => applyPreset(preset)}
                                                    aria-pressed={isActive}
                                                    className={chip(isActive)}
                                                >
                                                    {preset.label}
                                                </button>
                                            </span>
                                        );
                                    })}
                                    {groupIndex === 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowMoreScenarios((open) => !open)}
                                            aria-expanded={showMoreScenarios}
                                            className={clsx(chip(false), 'border-dashed sm:hidden')}
                                        >
                                            {showMoreScenarios ? 'Fewer scenarios' : 'More scenarios'}
                                            <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', showMoreScenarios && 'rotate-180')} aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 2-up on phones rather than 1-up: six full-width stacked fields
                    pushed the actual result most of a screen further down. The
                    four fields a plan cannot do without come first; on phones
                    everything after them is folded behind one row that states
                    its current values. The keyboard's focus ring is drawn inside
                    each control here: outside it, this grid and the date cells
                    clip it (`!` because the ring's own rule is unlayered). */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 overflow-hidden [&_:is(input,select,button)]:focus-visible:-outline-offset-2!">
                    {/* Amount */}
                    <div className="space-y-1.5">
                        <label htmlFor="dca-amount" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Amount ({currencyConfig.code})</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-sm" aria-hidden="true">{currencyConfig.symbol}</span>
                            <input
                                id="dca-amount"
                                type="number"
                                inputMode="decimal"
                                min={0}
                                aria-invalid={nothingInvested}
                                aria-describedby={nothingInvested || limitNotes.amount ? 'dca-amount-note' : undefined}
                                {...amountField.inputProps}
                                className={clsx(FIELD_CLASS, 'pl-7 pr-3')}
                            />
                        </div>
                        {/* A hint under the field, not a card swap: "0.5" passes
                            through 0 on its way in, and the result must not jump
                            about while it is typed. */}
                        {nothingInvested ? (
                            <p id="dca-amount-note" className="text-xs text-loss">Enter an amount above 0 to see a result.</p>
                        ) : limitNotes.amount && (
                            <p id="dca-amount-note" className={FIELD_NOTE_CLASS}>{limitNotes.amount}</p>
                        )}
                    </div>

                    {/* Frequency */}
                    <div className="space-y-1.5">
                        <label htmlFor="dca-frequency" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Frequency</label>
                        <select
                            id="dca-frequency"
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as Frequency)}
                            className={clsx(FIELD_CLASS, 'px-3')}
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Bi-weekly</option>
                            <option value="monthly">Monthly</option>
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
                            className={clsx(DATE_FIELD_CLASS, dateError ? "border-rose-400 dark:border-rose-600" : "border-slate-200 dark:border-slate-700")}
                        />
                    </div>

                    {/* End Date */}
                    <div className="space-y-1.5 min-w-0 overflow-hidden">
                        <label htmlFor="dca-end-date" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">End Date</label>
                        <input
                            id="dca-end-date"
                            type="date"
                            value={endDate}
                            max={MAX_END_DATE}
                            onChange={(e) => setEndDate(e.target.value)}
                            aria-invalid={!!dateError}
                            aria-describedby={dateError ? 'dca-date-error' : undefined}
                            className={clsx(DATE_FIELD_CLASS, dateError ? "border-rose-400 dark:border-rose-600" : "border-slate-200 dark:border-slate-700")}
                        />
                    </div>

                    {/* Its own row, under both date fields: the message is about
                        the pair, and in a half-width cell it wraps to five lines.
                        At lg the dates are the row's last two columns. */}
                    {dateError && (
                        <p id="dca-date-error" className="col-span-2 lg:col-start-3 -mt-1 sm:-mt-3 text-xs text-loss">{dateError}</p>
                    )}

                    {/* Phones only: the fold for everything below, with what it
                        is hiding spelled out on its face. */}
                    <div className="col-span-2 sm:hidden">
                        <button
                            type="button"
                            onClick={() => setShowMoreFields((open) => !open)}
                            aria-expanded={showMoreFields}
                            aria-controls="dca-more-fields"
                            className="flex w-full min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-left"
                        >
                            <span className="min-w-0">
                                <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Fees and more</span>
                                {!showMoreFields && (
                                    <span className="block text-xs text-slate-500 dark:text-slate-400">{settingsSummary}</span>
                                )}
                            </span>
                            <ChevronDown className={clsx('h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform', showMoreFields && 'rotate-180')} aria-hidden="true" />
                        </button>
                        {/* The one warning from inside the fold that cannot wait
                            for it to be opened. */}
                        {!showMoreFields && perBuyFee?.nothingBought && (
                            <p className="mt-1.5 text-xs text-loss">{perBuyFee.text}</p>
                        )}
                    </div>

                    {/* The same columns as the grid it sits in, so its cells line
                        up with the row above. */}
                    <div
                        id="dca-more-fields"
                        className={clsx(
                            'col-span-2 lg:col-span-4 grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5',
                            showMoreFields ? 'grid' : 'hidden sm:grid',
                        )}
                    >
                        {/* Fee: a percentage and a flat amount per buy, side by side. */}
                        <div className="space-y-1.5">
                            <label htmlFor="dca-fee" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Fee (%)</label>
                            <input
                                id="dca-fee"
                                type="number"
                                inputMode="decimal"
                                step="0.1"
                                min={0}
                                max={URL_PARAM_LIMITS.maxFeePct}
                                aria-describedby={describedBy(limitNotes.fee && 'dca-fee-note', perBuyFee && 'dca-fee-per-buy')}
                                {...feeField.inputProps}
                                className={clsx(FIELD_CLASS, 'px-3')}
                            />
                            {limitNotes.fee && <p id="dca-fee-note" className={FIELD_NOTE_CLASS}>{limitNotes.fee}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="dca-flat-fee" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">Flat fee per buy</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-sm" aria-hidden="true">{currencyConfig.symbol}</span>
                                <input
                                    id="dca-flat-fee"
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min={0}
                                    aria-describedby={describedBy(limitNotes.flatFee && 'dca-flat-fee-note', perBuyFee && 'dca-fee-per-buy')}
                                    {...flatFeeField.inputProps}
                                    className={clsx(FIELD_CLASS, 'pl-7 pr-3')}
                                />
                            </div>
                            {limitNotes.flatFee && <p id="dca-flat-fee-note" className={FIELD_NOTE_CLASS}>{limitNotes.flatFee}</p>}
                        </div>

                        {/* Exchange presets, beside the two fee fields on a wide
                            screen and on their own row under them on a phone. */}
                        <div className="col-span-2">
                            {/* What the two fields take out of one buy, in money. A flat
                                fee is small in dollars and can be large as a share of a
                                small buy; this is where that shows. */}
                            {perBuyFee && (
                                <p id="dca-fee-per-buy" className={clsx('mb-2 text-[11px] sm:text-xs tabular-nums', perBuyFee.nothingBought ? 'text-loss' : 'text-slate-500 dark:text-slate-400')}>
                                    {perBuyFee.text}
                                </p>
                            )}
                            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Exchange presets</div>
                            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Exchange fee presets">
                                {feePresets.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => applyFeePreset(p)}
                                        aria-pressed={activeFeePreset?.id === p.id}
                                        className={chip(activeFeePreset?.id === p.id)}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                            {/* Visible, not a title attribute: what the chip's figure is
                                made of differs by platform (a fee, a spread, or both),
                                and touch users never see a tooltip. */}
                            <p className="mt-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                {activeFeePreset
                                    ? `${activeFeePreset.label} (${activeFeePreset.note}).`
                                    : `Each chip sets the fee to the rate that platform publishes for a recurring buy, last checked ${formatUtc(feesLastVerified(), 'full')}.`}
                            </p>
                        </div>

                        {/* Currency */}
                        <div className="space-y-1.5">
                            <label htmlFor="dca-currency" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Currency</label>
                            {/* Bound to the currency that was asked for. The figures
                                follow once its rate is in hand (see CurrencyContext),
                                so every label reads currencyConfig, not this value.
                                Reaching for the picker is the first sign another
                                currency is wanted: asking for today's rates then means
                                they are usually there by the time one is chosen. */}
                            <select
                                id="dca-currency"
                                value={currency}
                                onChange={(e) => {
                                    // A setting the visitor chose, like any
                                    // other: the address bar carries it from
                                    // here on. (The currency on display also
                                    // changes when a saved preference loads,
                                    // which is not that.)
                                    addressOwnedRef.current = true;
                                    setCurrency(e.target.value as CurrencyCode);
                                }}
                                onPointerDown={ensureFxRates}
                                onFocus={ensureFxRates}
                                aria-describedby={currencyNote ? 'dca-currency-note' : undefined}
                                className={clsx(FIELD_CLASS, 'px-3')}
                            >
                                {currencies.map(c => (
                                    <option key={c.code} value={c.code}>{c.label}</option>
                                ))}
                            </select>
                            {/* Every converted figure below rests on one rate, so
                                the field that chose it says so, and says when
                                that rate is a dated one. */}
                            {currencyNote && <p id="dca-currency-note" className={FIELD_NOTE_CLASS}>{currencyNote}</p>}
                        </div>

                        {/* Price Mode + Provider */}
                        <div className="space-y-3">
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
                                        onChange={(e) => {
                                            if (isPriceProvider(e.target.value)) setProvider(e.target.value);
                                        }}
                                        aria-describedby="dca-provider-cadence"
                                        className={`w-full ${TOUCH_FIELD} px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:border-amber-500 transition-colors`}
                                    >
                                        {PRICE_PROVIDERS.map((p) => (
                                            <option key={p} value={p}>{PRICE_PROVIDER_LABELS[p].option}</option>
                                        ))}
                                    </select>
                                    {/* The option text is cut off in a narrow closed select,
                                        so what the series is made of is repeated below it. */}
                                    <p id="dca-provider-cadence" className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                        {PRICE_PROVIDER_LABELS[provider].name}: {PRICE_PROVIDER_LABELS[provider].cadence}.
                                    </p>
                                </div>
                            )}
                        </div>

                        {priceMode === 'manual' && (
                            <div className="space-y-1.5 fade-in">
                                <label htmlFor="dca-manual-price" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Avg. BTC Price (USD)</label>
                                <input
                                    id="dca-manual-price"
                                    type="number"
                                    inputMode="decimal"
                                    min={1}
                                    aria-describedby={limitNotes.manualPrice ? 'dca-manual-price-note' : undefined}
                                    {...manualPriceField.inputProps}
                                    className={clsx(FIELD_CLASS, 'px-3')}
                                />
                                {limitNotes.manualPrice && <p id="dca-manual-price-note" className={FIELD_NOTE_CLASS}>{limitNotes.manualPrice}</p>}
                            </div>
                        )}

                        {/* Advanced plan shape, collapsed by default: most visitors never
                            need it, and three extra fields would push the results further
                            down every phone screen. */}
                        <div className="col-span-2 lg:col-span-4">
                            <button
                                type="button"
                                onClick={() => setShowMoreOptions(v => !v)}
                                aria-expanded={showMoreOptions}
                                aria-controls="dca-more-options"
                                className="flex min-h-11 items-center gap-1.5 text-left text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                            >
                                <span aria-hidden="true" className={clsx('inline-block transition-transform text-[10px]', showMoreOptions && 'rotate-90')}>▶</span>
                                <span>
                                    More options
                                    <span className="font-normal text-slate-500 dark:text-slate-400">: starting stack, yearly increase</span>
                                </span>
                            </button>
                            {showMoreOptions && (
                                <div id="dca-more-options" className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 fade-in">
                                    <div className="space-y-1.5">
                                        <label htmlFor="dca-starting-btc" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Starting stack (BTC)</label>
                                        <input
                                            id="dca-starting-btc"
                                            type="number"
                                            inputMode="decimal"
                                            step="0.01"
                                            min={0}
                                            aria-describedby={limitNotes.startingBtc ? 'dca-starting-btc-note dca-starting-btc-hint' : 'dca-starting-btc-hint'}
                                            {...startingBtcField.inputProps}
                                            className={clsx(FIELD_CLASS, 'px-3')}
                                        />
                                        {limitNotes.startingBtc && <p id="dca-starting-btc-note" className={FIELD_NOTE_CLASS}>{limitNotes.startingBtc}</p>}
                                        <p id="dca-starting-btc-hint" className="text-[11px] text-slate-500 dark:text-slate-400">Coins you already hold</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor="dca-starting-cost" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Its avg. cost ({currencyConfig.code})</label>
                                        <input
                                            id="dca-starting-cost"
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            aria-describedby={limitNotes.startingCost ? 'dca-starting-cost-note dca-starting-cost-hint' : 'dca-starting-cost-hint'}
                                            {...startingCostField.inputProps}
                                            className={clsx(FIELD_CLASS, 'px-3')}
                                        />
                                        {limitNotes.startingCost && <p id="dca-starting-cost-note" className={FIELD_NOTE_CLASS}>{limitNotes.startingCost}</p>}
                                        <p id="dca-starting-cost-hint" className="text-[11px] text-slate-500 dark:text-slate-400">Per BTC. Zero means priced at your start date</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor="dca-escalation" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Yearly increase (%)</label>
                                        <input
                                            id="dca-escalation"
                                            type="number"
                                            inputMode="decimal"
                                            step="1"
                                            min={0}
                                            max={URL_PARAM_LIMITS.maxEscalationPct}
                                            aria-describedby={limitNotes.escalation ? 'dca-escalation-note dca-escalation-hint' : 'dca-escalation-hint'}
                                            {...escalationField.inputProps}
                                            className={clsx(FIELD_CLASS, 'px-3')}
                                        />
                                        {limitNotes.escalation && <p id="dca-escalation-note" className={FIELD_NOTE_CLASS}>{limitNotes.escalation}</p>}
                                        <p id="dca-escalation-hint" className="text-[11px] text-slate-500 dark:text-slate-400">Buy amount grows each year, like a raise</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer bar */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
                    {viewHold !== null ? (
                        // In the total's place, so nothing moves when it appears:
                        // why the results below are not for the form as it stands,
                        // or why there are none. (A total here would be the earlier
                        // plan's, or a "$0" for a plan that has not been run.)
                        <p className="flex min-w-0 flex-1 items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                            {viewHold === 'loading' && <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}
                            <span>
                                {viewHold === 'loading'
                                    ? showingEarlier ? 'Updating prices…' : 'Loading prices…'
                                    : viewHold === 'failed'
                                        ? showingEarlier ? 'The new prices did not load. The results below are the earlier ones.' : 'The prices did not load.'
                                        : showingEarlier ? 'The results below are for your last valid dates.' : 'These dates cannot be run yet.'}
                            </span>
                        </p>
                    ) : (
                        <div className="flex items-center gap-2" data-plan-figure={pendingMark}>
                            {/* Every other label in this component branches on the end
                                date; this one was hardcoded "Projected", so a historical
                                backtest — the default — labelled money already spent as a
                                forecast. */}
                            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                                {isProjection ? 'Total to Invest' : 'Total Invested'}
                            </span>
                            <span className="text-base sm:text-lg font-bold text-slate-800 dark:text-white tabular-nums">{formatCurrency(results.totalInvested)}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={handleShare}
                            className={`flex items-center justify-center p-2 ${TOUCH_WIDTH} rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300`}
                            title="Share calculator settings"
                            aria-label="Share calculator settings"
                        >
                            <Share2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                        {pastPurchaseCount > 0 && (
                            <button
                                type="button"
                                onClick={handleExportCsv}
                                className={`flex items-center justify-center p-2 ${TOUCH_WIDTH} rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300`}
                                title="Export to CSV"
                                aria-label="Export transaction history to CSV"
                            >
                                <Download className="w-4 h-4" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                </div>
                {/* The one announcement of a copied link, and what the icon
                    button above shows for it. The button in the result card
                    says so on its own face. */}
                <div role="status" aria-live="polite">
                    {shareStatus && (
                        <div className={clsx('mt-2 text-xs sm:text-sm fade-in', shareStatus === 'copied' ? 'text-gain' : 'text-loss')}>
                            {shareStatus === 'copied' ? 'Link copied to your clipboard' : "Couldn't copy the link"}
                        </div>
                    )}
                </div>
            </div>

            {/* Phones: the headline figure in one row above the tab bar, while
                the form is on screen and the result card is not. Not shown
                until the cookie banner has been answered (see DockedResult),
                nor while a link's figures have yet to follow its settings
                (pendingMark). And not while the dates cannot be run: the bar sits
                where the message about them appears, and its figure would be
                the earlier plan's with nothing on the way to replace it. */}
            <DockedResult
                formRef={formRef}
                figureRef={headlineRef}
                available={hasHeadline && !(arrived && !planShown) && viewHold !== 'dates'}
                label={dockLabel}
                value={formatCurrency(results.currentValue)}
                change={signedPercent(results.roi)}
                changeClassName={isProfit ? 'text-gain' : 'text-loss'}
                note={dockNote}
                dimmed={showingEarlier}
            />

            {/* Loading / Error / Results. One element around every state of
                them, so the height held for a link's placeholder (heldHeight)
                has an owner. It repeats the root's spacing, and the ad after
                it stays outside: never unmounted, never inside held space. */}
            <div
                ref={resultsRef}
                className="space-y-6 sm:space-y-8"
                style={heldHeight !== null && !hasView && viewHold === 'loading' ? { minHeight: heldHeight } : undefined}
            >
            {!hasView ? (
                viewHold === 'dates' ? (
                    // Nothing to fall back on, and no request in flight to wait
                    // for: say what is needed instead of showing a placeholder
                    // that would never resolve.
                    <Card className="p-6 sm:p-10 text-center fade-in">
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                            {dateError} The results appear here once the dates above can be run.
                        </p>
                    </Card>
                ) : viewHold === 'failed' ? (
                    <Card className="p-6 sm:p-10 text-center fade-in">
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                            We can&apos;t reach the live price data right now, so there are no results to show.
                            Try again, or switch to Manual mode.
                        </p>
                        <LoadFailedActions onRetry={handleRetry} onManual={() => setPriceMode('manual')} className="mt-5 justify-center" />
                    </Card>
                ) : (
                    <>
                        {/* The headline card's space, the Units row, then the four
                            figures and the chart. The same heights as the page's
                            own loading skeleton (see DcaCalculatorSkeleton). */}
                        <div className="h-[206px] min-[375px]:h-[186px] sm:h-[237px] lg:h-[258px] rounded-2xl border border-[var(--hairline)] bg-white dark:bg-slate-900 shadow-[var(--elev-1)] animate-pulse" aria-hidden="true" />
                        <div className="h-7 max-sm:h-12 pointer-coarse:h-12" aria-hidden="true" />
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" aria-hidden="true">
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                            <SkeletonCard />
                        </div>
                        <SkeletonChart />
                    </>
                )
            ) : (
                <>
                    {/* The earlier results are still on screen and their replacement
                        could not be loaded. Outside the dimmed groups below, so the
                        message and the way out are at full strength. */}
                    {showingEarlier && viewHold === 'failed' && (
                        <Card className="p-4 sm:p-5 fade-in">
                            <p className="text-sm text-slate-700 dark:text-slate-200">
                                We can&apos;t reach the live price data right now, so the results below are still
                                for {shownRange}{shownSource}. Try again, or switch to Manual mode.
                            </p>
                            <LoadFailedActions onRetry={handleRetry} onManual={() => setPriceMode('manual')} className="mt-3" />
                        </Card>
                    )}

                    {/* The results sit in two groups with the ad between them, so
                        that dimming an earlier result never dims the ad. No
                        pointer-events change: everything stays usable. The first
                        group is dimmed too while the plan buys nothing and holds
                        nothing: its figures are zeros, not a result. */}
                    <div
                        className={clsx('relative space-y-6 sm:space-y-8 transition-opacity', (showingEarlier || nothingInvested) && 'opacity-60')}
                        aria-busy={showingEarlier && viewHold === 'loading'}
                        data-plan-figure={pendingMark}
                    >
                    {/* What a visit that opened on a link sees in the headline
                        card's place until the link's plan is on screen: the
                        figures around it are hidden (pendingMark), and this is
                        shown only then (globals.css). Laid over the card, not
                        above it, so nothing moves when it goes. */}
                    {!planShown && (
                        <p
                            data-plan-pending
                            className="visible absolute inset-x-0 top-0 flex h-[206px] min-[375px]:h-[186px] sm:h-[237px] lg:h-[258px] items-center justify-center gap-2 rounded-2xl border border-[var(--hairline)] bg-white text-sm text-slate-600 shadow-[var(--elev-1)] dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                            Loading the plan in this link…
                        </p>
                    )}
                    {/* Hero result.
                        Four equal cards made the visitor hunt for the one number they
                        came for. This states it once, large, with the supporting
                        figures subordinate to it — and puts Share next to the result
                        instead of a thousand pixels further down the page. It is the
                        first thing under the form, ahead of the Units switch. */}
                    {hasHeadline && (
                        // @container establishes the query context the hero figure's
                        // cqw sizing resolves against.
                        <Card celebrated className="@container p-5 sm:p-8 text-center fade-in">
                            <p className="text-xs sm:text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {isProjection
                                    ? `Projected value at ${priceWords}`
                                    : valuedAtLivePrice ? 'Worth today' : `Worth at ${priceWords}`}
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
                                display end of Inter's curve.

                                Focusable from script only (tabIndex -1): the docked
                                bar on phones sends focus here when it is tapped. */}
                            <p
                                ref={headlineRef}
                                tabIndex={-1}
                                // break-words: a plan pushed to every limit at once
                                // runs to dozens of digits, which would otherwise run
                                // out of the card in one unbroken line.
                                className="mt-1.5 text-[clamp(2rem,9cqw,4.5rem)] leading-[1.05] tracking-[-0.022em] font-extrabold text-slate-900 dark:text-[var(--text-strong)] tabular-nums break-words"
                            >
                                {formatCurrency(results.currentValue)}
                            </p>
                            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
                                from <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{formatCurrency(results.totalInvested)}</span>{' '}
                                {/* Money a future-dated plan has not spent yet is not "invested". */}
                                {isProjection ? 'to be invested' : 'invested'}
                                {' · '}
                                <span className={clsx('font-semibold tabular-nums', profitClass)}>
                                    {results.profit >= 0 ? '+' : ''}{formatCurrency(results.profit)} ({signedPercent(results.roi)})
                                </span>
                            </p>
                            {convertedCurrency && (
                                <p className="mt-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                    In {convertedCurrency} at {fxRateWords}. Past exchange rates are not used.
                                </p>
                            )}
                            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                                {/* The label changes in place for a copied link: the
                                    message under the form can be a screen away from
                                    here. A fixed width, just over the longest label's,
                                    so the CSV button beside it does not move. */}
                                <button
                                    type="button"
                                    onClick={handleShare}
                                    className="inline-flex min-w-44 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
                                >
                                    {shareStatus === 'copied'
                                        ? <Check className="h-4 w-4" aria-hidden="true" />
                                        : <Share2 className="h-4 w-4" aria-hidden="true" />}
                                    {shareStatus === 'copied' ? 'Link copied' : shareStatus === 'failed' ? "Couldn't copy" : 'Share this result'}
                                </button>
                                {pastPurchaseCount > 0 && (
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

                    {/* Whose prices these are, when they are not the ones asked for:
                        the other exchange's series, or a copy fetched earlier. */}
                    {priceSourceNotice && (
                        <p className="rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-2 text-center text-xs text-slate-700 dark:border-amber-700/60 dark:bg-amber-950/25 dark:text-slate-300 sm:text-sm">
                            {priceSourceNotice}
                        </p>
                    )}

                    {/* Denomination — display only. Every bitcoin figure from here
                        down follows it: the cards, the chart, every panel in the
                        tabs. It sits above the first of them, not above the
                        headline, which is in money and does not change with it.
                        No negative margins here: they let this row collide with the result cards.
                        No min-height on the buttons either: the 44px floor in
                        globals.css is what makes them a touch target on phones, and
                        one set here would override it. */}
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
                                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                        TOUCH_WIDTH,
                                        denomination === d
                                            ? 'bg-white dark:bg-slate-700 shadow-sm text-amber-700 dark:text-amber-400'
                                            : 'text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                    )}
                                >
                                    {d === 'BTC' ? 'BTC' : 'sats'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Result Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        <ResultCard
                            label={isProjection ? "Total to Invest" : "Total Invested"}
                            value={results.totalInvested}
                            format={formatCurrency}
                            formatShort={formatCompact}
                        />
                        <ResultCard
                            label={isSats ? (isProjection ? "Sats to Accumulate" : "Sats Accumulated") : (isProjection ? "BTC to Accumulate" : "BTC Accumulated")}
                            value={results.btcAccumulated}
                            format={formatBtcAmount}
                            /* Sats strings blow out a half-width card on mobile — abbreviate below sm.
                               The BTC figure is the bare number there: the label
                               above it already says BTC, "0.3025 BTC" wraps at
                               360px, and a ₿ sign is not in the font's Latin
                               file, so phones would fetch a second font file to
                               draw that one character. */
                            formatShort={(n) => (isSats ? satsShort(n) : btcShort(n))}
                            subValue={isProjection ? `at ${priceWords}` : `Avg: ${formatCurrency(results.averageCost)}`}
                        />
                        <ResultCard
                            label={isProjection ? "Value at Current Price" : "Current Value"}
                            value={results.currentValue}
                            format={formatCurrency}
                            formatShort={formatCompact}
                            /* Always the price the value was struck at, so a card
                               headed "Current" never hides that it is not live. */
                            subValue={valuedAtLivePrice && livePrice ? `@ ${formatCurrency(livePrice)}` : `at ${priceWords}`}
                            subValueClassName="text-amber-700 dark:text-amber-400 font-medium"
                            /* Deliberately NOT `celebrated`. The accent rule means
                               "this is the answer", and the hero card above already
                               carries it — for the very same figure. Firing it twice
                               within 150px halves what it signals. */
                            icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />}
                        />
                        <ResultCard
                            label={isProjection ? "Projected Gain" : "Profit / Loss"}
                            value={results.profit}
                            format={(n) => `${n >= 0 ? '+' : ''}${formatCurrency(n)}`}
                            formatShort={(n) => `${n >= 0 ? '+' : ''}${formatCompact(n)}`}
                            valueClassName={profitClass}
                            icon={isProfit
                                ? <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-gain shrink-0" />
                                : <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-loss shrink-0" />}
                            subValue={isProjection ? "if the price holds" : `${signedPercent(results.roi)} ROI`}
                            subValueClassName={profitClass}
                        />
                    </div>

                    {/* One rule for a plan that runs past today, stated once where
                        the split begins: the headline and chart are the whole plan,
                        everything that describes what happened stops at today. */}
                    {isFutureEndDate && purchaseCount > 0 && (
                        <p className="text-center text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
                            {pastPurchaseCount === 0 ? (
                                // A plan whose first buy is still to come has its
                                // own wording: "the 0 purchases made through today"
                                // says nothing.
                                <>
                                    Your plan has not started: its first purchase is still to come. The figures above and
                                    the chart cover the whole plan, with every purchase priced at {priceWords}. Everything
                                    further down counts purchases made through today, of which there are none yet, unless a
                                    panel says it is a projection.
                                </>
                            ) : (
                                <>
                                    Your end date is in the future. The figures above and the chart cover the whole plan, with
                                    purchases still to come priced at {priceWords}. Everything further down counts only the{' '}
                                    {pastPurchaseCount.toLocaleString('en-US')} {pastPurchaseCount === 1 ? 'purchase' : 'purchases'} made
                                    through today, unless a panel says it is a projection.
                                </>
                            )}
                        </p>
                    )}

                    {/* Stats strip (historical figures — capped at today when the end date is in the future) */}
                    {pastResults.stats && pastResults.breakdown.length > 0 && planStarted && (
                        <StatsStrip stats={pastResults.stats} boughtNothing={pastResults.btcAccumulated <= 0} />
                    )}

                    {/* The same plan from every other start date */}
                    {pastPurchaseCount > 0 && priceMode === 'api' && ownRun && (
                        <OutcomeRangeCard
                            frequency={frequency}
                            durationDays={ownRun.durationDays}
                            feePercentage={deferredFee}
                            ownReturnPercent={ownRun.returnPercent}
                            hasFlatFee={flatFeeUsd > 0}
                            hasYearlyIncrease={deferredEscalation > 0}
                            era={outcomeEra}
                            onEraChange={setOutcomeEra}
                            seed={initialOutcomeRange ?? null}
                            // The server's copy describes the default plan as of its
                            // own day. On a later day it stays on screen while the
                            // current one is fetched, then gives way to it.
                            refreshSeed={todayUtcTs !== utcDayStart(mountClock)}
                        />
                    )}

                    {/* Stats Banner */}
                    {purchaseCount > 0 && (
                        <div className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 py-1">
                            <p className="flex flex-wrap justify-center gap-x-1 gap-y-0.5">
                                <span>
                                    {isFutureEndDate
                                        ? `${pastPurchaseCount.toLocaleString('en-US')} of ${countOf(purchaseCount, 'planned purchase')} made`
                                        : countOf(purchaseCount, 'purchase')}
                                    {durationText ? `${isFutureEndDate ? '; the plan runs' : ''} over ${durationText}` : ''}
                                </span>
                                {/* What is held today, never what a future-dated plan would add. */}
                                {pastResults.btcAccumulated > 0 && (
                                    <>
                                        <span className="hidden sm:inline mx-1">|</span>
                                        <span>
                                            <span className="font-medium text-amber-700 dark:text-amber-400 tabular-nums">
                                                {isSats
                                                    ? btcToSats(pastResults.btcAccumulated).toLocaleString('en-US')
                                                    : btcShort(pastResults.btcAccumulated)}
                                            </span> of {isSats ? '2.1 quadrillion sats' : '21M BTC'}
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    )}

                    {/* Result Explainer */}
                    {hasHeadline && (
                        <p className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto">
                            {holdOnly ? (
                                <>
                                    Holding {heldAtStart} from {formatUtc(parseUtcDate(planStart), 'monthYear')} and buying no more:
                                    counted at a cost of {formatCurrency(results.totalInvested)}, it is worth{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{formatCurrency(results.currentValue)}</span>{' '}
                                    {valuedAtLivePrice ? 'today' : `at ${priceWords}`}. That is a <span className={clsx("font-medium", isProfit ? "text-gain" : "text-loss")}>{signedPercent(results.roi)} return</span>.
                                </>
                            ) : isFutureEndDate ? (
                                <>
                                    {heldAtStart ? `Start with ${heldAtStart} and buy` : 'Buy'} {buyWords} from{' '}
                                    {formatUtc(parseUtcDate(planStart), 'monthYear')} to {formatUtc(parseUtcDate(planEnd), 'monthYear')} and you will{' '}
                                    {heldAtStart ? 'have put in' : 'spend'} {formatCurrency(results.totalInvested)}{heldAtStart && ', counting the starting stack'}.{' '}
                                    {convertedCurrency ? `Converted at ${fxRateWords}, that` : 'That'} {heldAtStart ? 'makes' : 'buys'}{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{formatBtcAmount(results.btcAccumulated)}</span>{heldAtStart && ' in all'},
                                    worth {formatCurrency(results.currentValue)} at {priceWords}.
                                    {convertedCurrency && ` The rates on the days of the buys are not used, so a plan paid in ${convertedCurrency} would buy a different amount of bitcoin.`}
                                </>
                            ) : (
                                <>
                                    {heldAtStart ? `Starting with ${heldAtStart} and buying` : 'Buying'} {buyWords} from{' '}
                                    {formatUtc(parseUtcDate(planStart), 'monthYear')} to {formatUtc(parseUtcDate(planEnd), 'monthYear')} would have cost you{' '}
                                    {formatCurrency(results.totalInvested)}{heldAtStart && ', counting the starting stack'}.{' '}
                                    {convertedCurrency
                                        ? `Converted at ${fxRateWords}, that is`
                                        : heldAtStart ? 'That would be' : 'It would have bought'}{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{formatBtcAmount(results.btcAccumulated)}</span>{heldAtStart && ' in all'},{' '}
                                    worth{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{formatCurrency(results.currentValue)}</span>{' '}
                                    {valuedAtLivePrice ? 'today' : `at ${priceWords}`}. That is a <span className={clsx("font-medium", isProfit ? "text-gain" : "text-loss")}>{signedPercent(results.roi)} return</span>.
                                    {convertedCurrency && ` Past exchange rates are not used, so a plan paid in ${convertedCurrency} would have bought a different amount of bitcoin.`}
                                </>
                            )}
                        </p>
                    )}

                    {/* Chart — moved up from below six analysis panels. It is the
                        second thing a visitor wants after the headline number, and it
                        was previously about 4,000px down the page. It draws one
                        point per purchase, so a stack that is only held has
                        none: its single row would be a dot on an empty plot. */}
                    {!holdOnly && (
                        <DcaChart
                            data={results.breakdown}
                            unit={denomination}
                            todayUtcTs={todayUtcTs}
                            view={chartView}
                            onViewChange={setChartView}
                            plannedPriceWords={plannedPriceWords}
                            valuation={chartValuation}
                            // The figure in the stats strip, for the chart's text
                            // summary. Only when the chart and the strip describe
                            // the same purchases: for a plan that runs past today
                            // the chart goes on to the end date and the strip does
                            // not, and the chart falls back to its own reading.
                            maxDrawdownPercent={isFutureEndDate ? undefined : results.stats?.maxDrawdownPercent}
                        />
                    )}
                    </div>

                    {/* Ad Slot (after the chart — never between the form and its results).
                        One of the home page's three A-ADS slots; /alternatives and
                        /author state that count in their copy. */}
                    <AdSlot className="min-h-[100px] flex justify-center" />

                    {/* Everything below is secondary analysis. Fifteen panels stacked
                        vertically buried the useful parts and forced every lazy chunk
                        to load at once; behind tabs, only the active panel mounts. */}
                    <div className={clsx('transition-opacity', showingEarlier && 'opacity-60')} aria-busy={showingEarlier && viewHold === 'loading'} data-plan-figure={pendingMark}>
                    <ResultTabs
                        active={resultTab}
                        onChange={setResultTab}
                        compare={
                            <>
                    {/* Inflation-Adjusted Returns. While the CPI series for these
                        dates is on its way its space is held, so the panels under
                        it do not move twice on every change of dates. Not held
                        once a load has come back without CPI: the card is not
                        coming, and a placeholder for it would be the thing that
                        moves. */}
                    {comparisonLoading && !inflationStats && (comparison === null || comparison.cpi !== null) && (
                        <div className="h-[220px] sm:h-[188px] lg:h-[169px] rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" aria-hidden="true" />
                    )}
                    {inflationStats && (
                        <div className="bg-white dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-slate-200 dark:border-slate-800 fade-in">
                            <div className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center mb-2">
                                After inflation (US consumer prices)
                            </div>
                            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center text-xs sm:text-sm">
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Real cost</div>
                                    <div className="font-semibold text-slate-800 dark:text-white break-words tabular-nums">
                                        <span className="sm:hidden">{formatCompact(inflationStats.realInvested)}</span>
                                        <span className="hidden sm:inline">{formatCurrency(inflationStats.realInvested)}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Real ROI</div>
                                    <div className={clsx("font-semibold tabular-nums", inflationStats.realRoiPercent >= 0 ? "text-gain" : "text-loss")}>
                                        {signedPercent(inflationStats.realRoiPercent)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Inflation</div>
                                    <div className="font-semibold text-slate-800 dark:text-white tabular-nums">
                                        {inflationStats.inflationPercent.toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                            {/* The method in one breath, and the two readings it used, so
                                the three figures can be checked against each other. */}
                            <p className="mt-2.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                Real cost is every purchase restated at {formatUtc(inflationStats.endObsTs, 'monthYear')} prices,
                                using the US consumer price index for the month it was made. Real ROI compares it
                                with {formatCurrency(pastResults.currentValue)}, the value of what has been bought. Inflation is
                                the index change from {formatUtc(inflationStats.startObsTs, 'monthYear')} to{' '}
                                {formatUtc(inflationStats.endObsTs, 'monthYear')}{livePrice ? ', the latest reading published' : ''}.
                                Money put in later was exposed to less of it, so real ROI is not simply ROI minus that
                                figure. Source: FRED series CPIAUCSL.
                            </p>
                        </div>
                    )}

                    {/* Lump Sum Comparison */}
                    {lumpSumResult && scheduledOnly.invested > 0 && (
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 fade-in">
                            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-800 dark:text-slate-100">Buying steadily vs all at once</h3>
                            <div className="grid grid-cols-2 gap-3 sm:gap-6">
                                <div className="p-3 sm:p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
                                    <div className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">DCA Strategy</div>
                                    {/* Schedule only, matching the lump-sum leg — see lumpSumResult.
                                        No figure in these two cards is ever cut short: a
                                        return of 610,406% that ends in an ellipsis after
                                        "6104" reads as a hundredth of itself. Phones give
                                        the percentage its own line, in both cards, so the
                                        two break alike. */}
                                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white break-words">
                                        <span className="sm:hidden">{formatCompact(scheduledOnly.value)}</span>
                                        <span className="hidden sm:inline">{formatCurrency(scheduledOnly.value)}</span>
                                    </div>
                                    <div className={clsx("text-xs sm:text-sm mt-1 tabular-nums", scheduledOnly.profit >= 0 ? "text-gain" : "text-loss")}>
                                        <span className="sm:hidden">
                                            <span className="block">{scheduledOnly.profit >= 0 ? '+' : '-'}{formatCompact(Math.abs(scheduledOnly.profit))}</span>
                                            <span className="block">({signedPercent(scheduledOnly.roi)})</span>
                                        </span>
                                        <span className="hidden sm:inline">{scheduledOnly.profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(scheduledOnly.profit))} ({signedPercent(scheduledOnly.roi)})</span>
                                    </div>
                                </div>
                                <div className="p-3 sm:p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50">
                                    <div className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Lump Sum</div>
                                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white break-words">
                                        <span className="sm:hidden">{formatCompact(lumpSumResult.currentValue)}</span>
                                        <span className="hidden sm:inline">{formatCurrency(lumpSumResult.currentValue)}</span>
                                    </div>
                                    <div className={clsx("text-xs sm:text-sm mt-1 tabular-nums", lumpSumResult.profit >= 0 ? "text-gain" : "text-loss")}>
                                        <span className="sm:hidden">
                                            <span className="block">{lumpSumResult.profit >= 0 ? '+' : '-'}{formatCompact(Math.abs(lumpSumResult.profit))}</span>
                                            <span className="block">({signedPercent(lumpSumResult.roi)})</span>
                                        </span>
                                        <span className="hidden sm:inline">{lumpSumResult.profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(lumpSumResult.profit))} ({signedPercent(lumpSumResult.roi)})</span>
                                    </div>
                                </div>
                            </div>
                            {/* The two sides are not charged alike once there is a flat
                                fee, and on a small buy that difference is most of the gap. */}
                            {flatFeeUsd > 0 && (
                                <p className="mt-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                    The lump sum is one order, so it pays your flat fee once. The schedule pays it
                                    on each of its {pastPurchaseCount.toLocaleString('en-US')} buys.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Asset Comparison. Needs at least one purchase made, with
                        money in it: for a plan that has not started, or one that
                        only holds a stack, there is nothing to compare. */}
                    {priceMode === 'api' && pastPurchaseCount > 0 && scheduledOnly.invested > 0 && (
                        <AssetComparison
                            btcResult={btcAssetResult}
                            sp500Result={sp500Result}
                            goldResult={goldResult}
                            loading={comparisonLoading}
                            excludesStartingStack={deferredStartingBtc > 0}
                            stopsAtToday={isFutureEndDate}
                        />
                    )}

                    {/* Exchange Fee Comparison — schedule only: exchanges never
                        charged a fee on coins the user already held. Rates resolve
                        for the calculator's own "today", like the preset chips. */}
                    <ExchangeFeeComparison totalInvested={scheduledOnly.invested} purchaseCount={pastPurchaseCount} asOf={todayUtcTs} />

                    {/* Savings Account Comparison — schedule only: a savings account
                        has no analogue of coins already held. Both sides stop at
                        today when the plan runs past it, and both are valued on
                        the day the bitcoin price is from (see savingsMarkTs). */}
                    <SavingsComparison
                        totalInvested={scheduledOnly.invested}
                        btcCurrentValue={scheduledOnly.value}
                        btcRoi={scheduledOnly.roi}
                        amount={amountUsd}
                        frequency={frequency}
                        startDate={planStart}
                        endDate={isFutureEndDate ? todayIso : planEnd}
                        stopsAtToday={isFutureEndDate}
                        valuationDate={utcIsoToday(savingsMarkTs)}
                        btcPriceWords={valuedAtLivePrice ? undefined : priceWords}
                        annualEscalationPct={deferredEscalation}
                    />

                    {/* Opportunity Cost Calculator */}
                    {priceMode === 'api' && priceData.length > 0 && livePrice && (
                        <OpportunityCostCalculator priceData={priceData} livePrice={livePrice} provider={planProvider} todayUtcTs={todayUtcTs} />
                    )}

                    {/* Plan-vs-plan comparison */}
                    {priceMode === 'api' && (
                        <PlanComparison
                            simplifiedBase={deferredStartingBtc > 0 || deferredEscalation > 0}
                            stopsAtToday={isFutureEndDate}
                            basePlan={{
                                amountUsd,
                                frequency,
                                startDate: planStart,
                                endDate: isFutureEndDate ? todayIso : planEnd,
                                feePercentage: deferredFee,
                                flatFeeUsd,
                                provider: planProvider,
                                livePrice: priceMode === 'api' ? livePrice : null,
                            }}
                        />
                    )}
                            </>
                        }
                        project={
                            <>
                    {/* Every panel here starts from bitcoin already bought, or
                        from buys still to come at a known price. With neither,
                        the tab says why it is empty. */}
                    {pastResults.btcAccumulated <= 0 && !(isFutureEndDate && panelPrice != null && panelPrice > 0) && (
                        <Card className="p-5 sm:p-6 text-center">
                            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                                {nothingInvested
                                    ? 'Nothing to project yet. Enter an amount above 0 and these panels appear.'
                                    : 'Nothing to project: these panels start from the bitcoin a plan has bought, and this plan has bought none.'}
                            </p>
                        </Card>
                    )}

                    {/* Future Projection (when end date is in the future). In
                        Manual mode the stack was not bought at market prices, so
                        the card leaves out what "the plan has returned so far". */}
                    {panelPrice != null && panelPrice > 0 && (
                        <FutureProjection
                            amount={amountUsd}
                            annualEscalationPct={deferredEscalation}
                            frequency={frequency}
                            startDate={planStart}
                            endDate={planEnd}
                            feePercentage={deferredFee}
                            flatFee={flatFeeUsd}
                            todayUtcTs={todayUtcTs}
                            currentPrice={panelPrice}
                            priceLabel={priceMode === 'manual' ? 'the price you typed' : undefined}
                            showRealizedRate={priceMode === 'api'}
                            currentBtc={pastResults.btcAccumulated}
                            currentInvested={pastResults.totalInvested}
                        />
                    )}

                    {/* Price scenarios — the past-only run: for future-dated plans
                        the full-range figures include purchases not yet made, which
                        overstated holdings and contradicted FutureProjection above. */}
                    {pastResults.btcAccumulated > 0 && (
                        <PriceScenarioCard btcAmount={pastResults.btcAccumulated} totalInvested={pastResults.totalInvested} />
                    )}

                    {/* Stacking Goals */}
                    <StackingGoalTracker
                        btcAccumulated={pastResults.btcAccumulated}
                        purchaseCount={pastPurchaseCount}
                        amount={currentAmountUsd}
                        frequency={frequency}
                        unit={denomination}
                        /* Project future sats at today's price, not at the average
                           price of a window the price already rose through. */
                        currentPrice={priceMode === 'api' ? livePrice ?? undefined : deferredManualPrice}
                        // In Manual mode that is the typed price, not today's.
                        priceLabel={priceMode === 'manual' ? 'the price you typed' : undefined}
                    />

                    {/* FIRE Calculator */}
                    <FireCalculator
                        btcAccumulated={pastResults.btcAccumulated}
                        totalInvested={pastResults.totalInvested}
                        livePrice={panelPrice}
                        amount={currentAmountUsd}
                        frequency={frequency}
                        learnMoreHref="/calculators/bitcoin-fire"
                    />

                    {/* Drawdown / spend-down planner */}
                    {panelPrice != null && panelPrice > 0 && pastResults.btcAccumulated > 0 && (
                        <DrawdownCalculator
                            btcAccumulated={pastResults.btcAccumulated}
                            livePrice={panelPrice}
                            unit={denomination}
                        />
                    )}
                            </>
                        }
                        details={
                            <>
                    {/* Transaction Table */}
                    <TransactionTable breakdown={results.breakdown} unit={denomination} todayUtcTs={todayUtcTs} plannedPriceWords={plannedPriceWords} />

                    {/* Cost Basis Tracker */}
                    <CostBasisTracker
                        priceData={priceData}
                        livePrice={livePrice}
                        priceAsOf={priceAsOf}
                        priceMode={priceMode}
                        provider={planProvider}
                        unit={denomination}
                    />

                    {/* Unit Bias Calculator */}
                    <UnitBiasCalculator btcAccumulated={pastResults.btcAccumulated} />

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
                        startDate={planStart}
                        endDate={isFutureEndDate ? todayIso : planEnd}
                        planEndDate={planEnd}
                        amount={amount}
                        frequency={frequency}
                        feePercentage={feePercentage}
                        flatFee={flatFee}
                        priceMode={priceMode}
                        provider={planProvider}
                        manualPrice={manualPrice}
                        startingBtc={startingBtc}
                        startingAvgCost={startingAvgCost}
                        annualEscalationPct={annualEscalationPct}
                        purchaseCount={pastPurchaseCount}
                        bestBuy={pastResults.stats?.bestBuy}
                        maxDrawdownPercent={pastResults.stats?.maxDrawdownPercent}
                        estimatedPrices={pastResults.stats?.estimatedPrices}
                    />
                            </>
                        }
                    />
                    </div>
                </>
            )}
            </div>

            {/* Mid-content Ad. Outside the results branch on purpose, so it is
                never unmounted by a loading state. The third of the home page's
                three A-ADS slots (see the note on the one after the chart). */}
            <AdSlot className="min-h-[100px] flex justify-center" />
        </div>
    );
};

/** The two ways on from a failed price load: ask again, or price the plan by hand. */
const LoadFailedActions = ({ onRetry, onManual, className }: { onRetry: () => void; onManual: () => void; className?: string }) => (
    <div className={clsx('flex flex-wrap gap-2', className)}>
        <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
        >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Retry
        </button>
        <button
            type="button"
            onClick={onManual}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
            Use Manual mode
        </button>
    </div>
);

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

const StatsStrip = memo(function StatsStrip({ stats, boughtNothing }: { stats: DcaStats; boughtNothing: boolean }) {
    const { formatCurrency } = useCurrency();
    const xirr = stats.xirrPercent;
    // The lowest price a buy was made at. When every buy went on fees there
    // is no best buy to name: no bitcoin was bought at any of them.
    const bestBuy = boughtNothing ? null : stats.bestBuy;
    const labelClass = "text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5";
    const valueClass = "text-sm sm:text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100";
    const subClass = "text-[11px] text-slate-500 dark:text-slate-400";
    // How much of the drawdown walk ran on estimated prices. Only a series
    // that marks its prices reports this; on daily closes it is zero.
    const estimated = stats.estimatedPrices;
    const drawdownEstimated = stats.maxDrawdownPercent !== null && estimated !== undefined && estimated.drawdownDays > 0;
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
                        {xirr === null ? '—' : signedPercent(xirr)}
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
                        {drawdownEstimated && <span className="ml-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">est.</span>}
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
                    <div className={valueClass}>
                        {bestBuy ? formatCurrency(bestBuy.price) : '—'}
                        {bestBuy?.priceKind === 'estimated' && <span className="ml-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">est.</span>}
                    </div>
                    {bestBuy && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{formatUtc(bestBuy.date, 'full')}</div>
                    )}
                </div>
                <div>
                    <div className={labelClass}>Fees paid</div>
                    <div className={valueClass}>{padCents(formatCurrency(stats.feesPaid, 2))}</div>
                    {/* The share of the money put into buys that went on fees. With
                        a flat fee it is no longer the percentage that was typed. */}
                    {stats.feesPaid > 0 && (
                        <div className={subClass}>{plainPercent(stats.feePercentOfBuy)} of what was paid in</div>
                    )}
                </div>
                {/* Said in words where the figures are, not only on the Methodology
                    page: a straight line through a week cannot fall as far as the
                    week did, so this is the direction the estimate is wrong in. */}
                {estimated !== undefined && (drawdownEstimated || bestBuy?.priceKind === 'estimated') && (
                    <p className="col-span-2 sm:col-span-4 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-600 dark:text-slate-300">est.</span>{' '}
                        {estimated.drawdownDays.toLocaleString('en-US')} of the {estimated.drawdownDaysWalked.toLocaleString('en-US')} days
                        checked for max drawdown
                        {estimated.purchases > 0 && `, and ${estimated.purchases.toLocaleString('en-US')} of the purchases,`}{' '}
                        are priced on estimates: a straight line between two real closes, or an earlier price
                        carried forward. A fall between those closes is not seen, so max drawdown can read too
                        small, and a best buy marked est. is a price that may never have traded.
                    </p>
                )}
            </div>
        </Card>
    );
});

/** One figure in the every-start-date card. */
const OutcomeCell = ({ label, value, className }: { label: string; value: number; className?: string }) => (
    <div className={clsx('rounded-xl bg-slate-50 p-2.5 text-center dark:bg-slate-800/50', className)}>
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
        <div className={clsx('mt-0.5 text-sm sm:text-base font-semibold tabular-nums', value >= 0 ? 'text-gain' : 'text-loss')}>
            {signedPercent(value)}
        </div>
    </div>
);

const OUTCOME_ERAS: PriceEra[] = ['all', 'exchange'];

/** Fewer runs than this and percentiles are noise: only the two ends are shown. */
const MIN_RUNS_TO_SUMMARISE = 20;

interface OutcomeRangeCardProps {
    frequency: Frequency;
    /** Days from the plan's start to its end, or to today if it ends later. */
    durationDays: number;
    /** The plan's percentage fee; applied to every run. */
    feePercentage: number;
    /** The plan's own return over that window, valued on its last day; null when it is not comparable. */
    ownReturnPercent: number | null;
    hasFlatFee: boolean;
    hasYearlyIncrease: boolean;
    /** The stretch of history the start dates come from (see PRICE_ERAS). */
    era: PriceEra;
    onEraChange: (era: PriceEra) => void;
    /** The server's answer for the default plan, used while it still describes this request. */
    seed: OutcomeRangeResult | null;
    /** True when the seed is from an earlier UTC day: show it, but fetch the current answer too. */
    refreshSeed: boolean;
}

/**
 * The same plan (its frequency and its length) from every start date in the
 * price history: how the worst, the middle and the best of those runs ended.
 *
 * One line such as "100% of every N-month run ended in profit · 582 runs"
 * counts runs that overlap almost entirely as if each were separate evidence,
 * and has no room for how far the worst fell. So this leads with the worst
 * case, says how many of the runs are independent, and describes past runs
 * only: nothing here is worded as what to expect.
 */
const OutcomeRangeCard = memo(function OutcomeRangeCard({
    frequency,
    durationDays,
    feePercentage,
    ownReturnPercent,
    hasFlatFee,
    hasYearlyIncrease,
    era,
    onEraChange,
    seed,
    refreshSeed,
}: OutcomeRangeCardProps) {
    const [fetched, setFetched] = useState<{ key: string; data: OutcomeRangeResult | null } | null>(null);

    // The server snaps the length to whole months. The same snap here keys the
    // request, and the snapped length is what is sent, so a plan a day longer
    // does not ask again for the same answer.
    const bucket = bucketDurationDays(durationDays);
    const bucketDays = bucket?.days ?? null;
    const fee = Math.min(100, Math.max(0, Number.isFinite(feePercentage) ? feePercentage : 0));
    const requestKey = bucketDays !== null ? `${frequency}|${bucketDays}|${fee}|${era}` : null;
    const seeded = seed !== null
        && requestKey === `${seed.frequency}|${seed.durationDays}|${seed.feePercentage}|${seed.era}`
        ? seed
        : null;

    // The debounce absorbs typing in the plan's fields. A tap on one of the
    // two history buttons is a single deliberate change, so it asks at once.
    const askedEraRef = useRef(era);
    useEffect(() => {
        if (requestKey === null || bucketDays === null || (seeded && !refreshSeed)) return;
        let cancelled = false;
        const delay = askedEraRef.current === era ? 800 : 0;
        askedEraRef.current = era;
        const timer = setTimeout(async () => {
            try {
                const result = await getOutcomeRange(frequency, bucketDays, fee, era);
                if (!cancelled) setFetched({ key: requestKey, data: result });
            } catch {
                if (!cancelled) setFetched({ key: requestKey, data: null });
            }
        }, delay);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // Every value the request is made from is in requestKey. The plan's
        // own length in days is deliberately not a dependency: it changes by
        // the day inside one bucket, and each change would ask again.
    }, [requestKey, seeded, refreshSeed, frequency, bucketDays, fee, era]);

    // Under 90 days there is no comparison to run, and nothing to hold space for.
    if (requestKey === null) return null;

    // undefined: on its way. null: not available (the plan is as long as the
    // history, or the daily closes could not be loaded). An answer fetched for
    // this request beats the seed; a failed refresh leaves the seed in place.
    const answered = fetched?.key === requestKey ? fetched.data : undefined;
    const data = answered ?? seeded ?? answered;
    // With nothing to show from all of history there is no card. On exchange
    // closes only it stays, so that the choice can be taken back.
    if (data === null && era === 'all') return null;

    // One return for every state, with the heading and the two history
    // buttons at the same place in each: a button that is pressed stays in
    // the page, and keeps the keyboard's focus, while its answer loads.
    return (
        <Card className="p-4 sm:p-5">
            <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100">Same plan, every start date</h3>
            {data === undefined ? (
                <>
                    <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400" role="status">
                        Running this plan from every start date in the price history…
                    </p>
                    {/* Roughly the height of the figures, so the chart below does
                        not jump when they arrive. */}
                    <div className="mt-3 h-[358px] sm:h-[172px] rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" aria-hidden="true" />
                </>
            ) : data === null ? (
                <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    There is nothing to show from exchange closes only. Either this plan is as long as that history,
                    which starts on {formatUtc(PRICE_ERAS.exchange.startTs, 'full')}, or the daily closes could not be loaded.
                </p>
            ) : (
                <OutcomeFigures
                    data={data}
                    ownReturnPercent={ownReturnPercent}
                    hasFlatFee={hasFlatFee}
                    hasYearlyIncrease={hasYearlyIncrease}
                />
            )}

            {/* Which stretch of history the start dates come from. Split by where
                the prices come from, never by price level. The dates are in the
                sentence above, so the phone labels can be short. */}
            <div role="group" aria-label="Price history to draw start dates from" className="mt-3 flex flex-wrap gap-1.5">
                {OUTCOME_ERAS.map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onEraChange(option)}
                        aria-pressed={era === option}
                        aria-label={PRICE_ERAS[option].label}
                        className={chip(era === option)}
                    >
                        <span className="sm:hidden">{option === 'all' ? 'All history' : 'Exchange closes only'}</span>
                        <span className="hidden sm:inline">{PRICE_ERAS[option].label}</span>
                    </button>
                ))}
            </div>

            {data && <OutcomeReadingGuide data={data} />}
        </Card>
    );
});

/** The figures of the every-start-date card, once its runs are in. */
function OutcomeFigures({
    data,
    ownReturnPercent,
    hasFlatFee,
    hasYearlyIncrease,
}: Pick<OutcomeRangeCardProps, 'ownReturnPercent' | 'hasFlatFee' | 'hasYearlyIncrease'> & { data: OutcomeRangeResult }) {
    const standing = ownReturnPercent !== null ? standingAmong(data, ownReturnPercent) : null;
    const below = data.shareBelowCostPercent;
    const belowText = below <= 0
        ? 'None of them'
        : below < 0.1 ? 'Under 0.1% of them' : `${below.toLocaleString('en-US', { maximumFractionDigits: 1 })}% of them`;
    const enoughRuns = data.runs >= MIN_RUNS_TO_SUMMARISE;
    const periods = data.independentPeriods;

    return (
        <div className="fade-in">
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {articleFor(data.months)} {data.months}-month plan buying every {EVERY[data.frequency]}, started on each day
                from {formatUtc(data.spanStart, 'full')} to {formatUtc(data.spanEnd - data.durationDays * DAY_MS, 'full')} and
                valued on its last day{data.feePercentage > 0 ? `, after a ${plainPercent(data.feePercentage)} fee` : ', with no fee'}.
                Past runs, not a forecast.
            </p>

            {/* The worst case leads and takes the full width on a phone; the
                other four sit two to a row. No scrolling, nothing on hover. */}
            {enoughRuns ? (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <OutcomeCell label="Worst" value={data.worst} className="col-span-2 sm:col-span-1" />
                    <OutcomeCell label="10th percentile" value={data.p10} />
                    <OutcomeCell label="Median" value={data.median} />
                    <OutcomeCell label="90th percentile" value={data.p90} />
                    <OutcomeCell label="Best" value={data.best} />
                </div>
            ) : (
                <>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <OutcomeCell label="Worst" value={data.worst} />
                        <OutcomeCell label="Best" value={data.best} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Only {data.runs.toLocaleString('en-US')} {data.runs === 1 ? 'run fits' : 'runs fit'}: too few runs to summarise.
                    </p>
                </>
            )}

            <div className="mt-3 space-y-1 text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                <p>
                    <span className="font-medium tabular-nums">{data.runs.toLocaleString('en-US')}</span> overlapping runs,
                    about <span className="font-medium tabular-nums">{periods}</span> independent{' '}
                    {periods === 1 ? 'period' : 'periods'}. {belowText} ended below what was paid in.
                </p>
                {standing !== null && ownReturnPercent !== null && (
                    <p>
                        Your start: <span className={clsx('font-medium tabular-nums', ownReturnPercent >= 0 ? 'text-gain' : 'text-loss')}>{signedPercent(ownReturnPercent)}</span>{' '}
                        valued the same way,{' '}
                        {standing === 'below'
                            ? 'below every one of these starts'
                            : standing === 'above'
                                ? 'above every one of these starts'
                                : `the ${ordinal(standing)} percentile of these starts`}.
                    </p>
                )}
                {(hasFlatFee || hasYearlyIncrease) && (
                    <p className="text-slate-500 dark:text-slate-400">
                        Your {[hasFlatFee && 'flat fee', hasYearlyIncrease && 'yearly increase'].filter(Boolean).join(' and ')}{' '}
                        {hasFlatFee && hasYearlyIncrease ? 'are' : 'is'} not part of these runs, so your own plan is not ranked among them.
                    </p>
                )}
            </div>
        </div>
    );
}

/** "How to read this", under the every-start-date card's figures. */
function OutcomeReadingGuide({ data }: { data: OutcomeRangeResult }) {
    const periods = data.independentPeriods;
    return (
        <details className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <summary className="flex cursor-pointer items-center font-medium text-amber-700 dark:text-amber-400">
                How to read this
            </summary>
            <div className="space-y-1.5 pb-1 leading-relaxed">
                <p>
                    Two runs that start a day apart share all but one of their days. The run count therefore says how
                    finely the history was sampled, not how much evidence there is. About {periods}{' '}
                    {periods === 1 ? 'window' : 'windows'} of this length {periods === 1 ? 'fits' : 'fit'} end to end in
                    these prices, and that is the number of separate periods behind every figure here.
                </p>
                <p>
                    Each run buys the same fixed amount and pays your percentage fee. The runs use the default daily
                    price series up to yesterday, whichever price source is selected above
                    {data.estimatedDays > 0 ? `; ${data.estimatedDays.toLocaleString('en-US')} of its days are filled-in estimates` : ''}.
                    {data.era === 'all'
                        ? ` Before ${formatUtc(PRICE_ERAS.exchange.startTs, 'full')} those prices are a daily market average, not an exchange close; the exchange-closes button leaves those years out.`
                        : ` Only exchange closes are used here, which start on ${formatUtc(PRICE_ERAS.exchange.startTs, 'full')}.`}
                </p>
                <p className="flex flex-wrap gap-x-4">
                    <Link href="/methodology" className={`inline-flex ${TOUCH_ROW} ${TOUCH_WIDTH} items-center text-amber-700 hover:underline dark:text-amber-400`}>
                        Method
                    </Link>
                    <Link href="/dca/start-date-heatmap" className={`inline-flex ${TOUCH_ROW} ${TOUCH_WIDTH} items-center text-amber-700 hover:underline dark:text-amber-400`}>
                        Start-date heatmap
                    </Link>
                    <Link href="/lump-sum-vs-dca" className={`inline-flex ${TOUCH_ROW} ${TOUCH_WIDTH} items-center text-amber-700 hover:underline dark:text-amber-400`}>
                        Lump sum vs DCA
                    </Link>
                </p>
            </div>
        </details>
    );
}

/** The quick-pick prices in the price-scenario card, in US dollars. The first is what the field opens on. */
const QUICK_TARGETS_USD = [100_000, 150_000, 250_000, 500_000, 1_000_000] as const;

const PriceScenarioCard = memo(function PriceScenarioCard({ btcAmount, totalInvested }: { btcAmount: number; totalInvested: number }) {
    const { currencyConfig, formatCurrency, formatCompact } = useCurrency();
    // Entered in the selected display currency; converted to USD before the math.
    const [targetPrice, setTargetPrice] = useState<number>(() => roundTo2Sig(QUICK_TARGETS_USD[0] * currencyConfig.rate));
    // The field keeps its own text while it is edited: bound to the number,
    // clearing it would write "0" back, with the next digits typed after it.
    const targetField = useNumericInput(targetPrice, setTargetPrice, PRICE_TARGET_LIMITS);

    // Re-denominate the entered target when the display currency changes so the
    // same USD scenario is preserved (a JPY user shouldn't inherit a $-shaped number).
    // The rate can also change under the same currency, when today's rates
    // arrive after the dated ones were shown. The quick-pick buttons move with
    // it, so a target that is one of them moves too and stays pressed; a typed
    // target is left as typed. See carryPriceAcrossRate.
    const prevCurrencyRef = useRef({ code: currencyConfig.code, rate: currencyConfig.rate });
    useEffect(() => {
        const prev = prevCurrencyRef.current;
        const next = { code: currencyConfig.code, rate: currencyConfig.rate };
        if (prev.code !== next.code || prev.rate !== next.rate) {
            setTargetPrice(p => carryPriceAcrossRate(p, prev, next, QUICK_TARGETS_USD));
        }
        prevCurrencyRef.current = next;
    }, [currencyConfig.code, currencyConfig.rate]);

    const targetPriceUsd = currencyConfig.rate > 0 ? targetPrice / currencyConfig.rate : targetPrice;
    const projectedValue = btcAmount * targetPriceUsd;
    const projectedProfit = projectedValue - totalInvested;
    const multiplier = totalInvested > 0 ? projectedValue / totalInvested : 0;

    const quickTargets = useMemo(
        () => QUICK_TARGETS_USD.map(usd => roundTo2Sig(usd * currencyConfig.rate)),
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
        return `${sym}${v.toLocaleString('en-US')}`;
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
                    <label htmlFor="price-scenario-target" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">If Bitcoin Price Hits... ({currencyConfig.code})</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">{currencyConfig.symbol}</span>
                        <input
                            id="price-scenario-target"
                            type="number"
                            inputMode="decimal"
                            min={PRICE_TARGET_LIMITS.min}
                            aria-describedby={targetField.limitHit ? 'price-scenario-target-note' : undefined}
                            {...targetField.inputProps}
                            className="w-full pl-7 pr-3 py-2.5 rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-lg font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-colors"
                        />
                    </div>
                    {/* Always mounted: a live region that arrives with its message is often not read out. */}
                    <p
                        id="price-scenario-target-note"
                        role="status"
                        className={targetField.limitHit ? FIELD_NOTE_CLASS : 'sr-only'}
                    >
                        {targetField.limitHit
                            ? limitMessage('The price', targetField.limitHit, (n) => `${currencyConfig.symbol}${n.toLocaleString('en-US')}`)
                            : ''}
                    </p>
                    <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Quick target prices">
                        {quickTargets.map((price, i) => (
                            <button
                                key={`${price}-${i}`}
                                type="button"
                                onClick={() => setTargetPrice(price)}
                                aria-pressed={targetPrice === price}
                                className={clsx(
                                    // "$1M" is a 42px chip without the width.
                                    "px-2.5 py-1.5 text-[11px] sm:text-xs font-medium rounded-full transition-colors",
                                    TOUCH_WIDTH,
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

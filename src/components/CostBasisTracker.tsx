'use client';

import { useState, useMemo, useCallback, useEffect, useId, useSyncExternalStore } from 'react';
import { DcaResult, Frequency, PriceMode, PricePoint } from '@/types';
import { calculateDcaToDate, priceSeriesCovers, withPriceKinds } from '@/utils/dca';
import {
    EARLIEST_PRICE_DATE, EARLIEST_PRICE_TS, MAX_END_DATE, MAX_END_TS, formatUtc, utcDayStart, utcIsoToday,
} from '@/utils/dates';
import type { PriceHistoryResult } from '@/utils/priceSeries';
import { getBitcoinPriceHistoryWithMeta } from '@/app/actions';
import { btcToSats, useCurrency, type Denomination } from '@/context/CurrencyContext';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { priceFallbackNotice, priceStaleNotice, type PriceProvider } from '@/data/priceSources';
import {
    MAX_POSITION_FEE_PERCENT,
    checkNewPosition,
    defaultPositionAmount,
    describePositionWindow,
    formatEnteredAmount,
    isTrackedPosition,
    positionAmountUsd,
    positionCurrency,
    positionSpan,
    type NewPositionCheck,
    type PositionWindow,
    type RequiredPositionField,
    type TrackedPosition,
} from '@/app/calculators/bitcoin-cost-basis/positions';
import { Card, CardHeader } from '@/components/ui/Card';
import { writeStorage } from '@/hooks/safeStorage';
import clsx from 'clsx';


interface CostBasisTrackerProps {
    /**
     * Prices already on the page. Used as they are when they cover the saved
     * positions; a calculator window that stops short of a position is never
     * used to price it (the engine would carry its last close forward and
     * report the result as history).
     */
    priceData: PricePoint[];
    livePrice: number | null;
    /** ms epoch `livePrice` was quoted. Shown beside the valuations when given, so a cached page says how old its price is. */
    priceAsOf?: number;
    /**
     * Set when `livePrice` is the newest row of the daily series and `priceAsOf`
     * is that row's UTC day, not the instant of a quote. The day is then printed
     * with no time: a daily price is not the price at 00:00.
     */
    priceAsOfIsDay?: boolean;
    priceMode: PriceMode;
    provider: PriceProvider;
    /** Unit for the bitcoin column. Defaults to BTC. */
    unit?: Denomination;
}

const STORAGE_KEY = 'btc-dca-cost-basis-positions';

/**
 * How often exchange rates that are still the dated ones are asked for again
 * while a non-USD plan is on screen. The same pace as the currency context's
 * own retry, which only runs while the display currency is not USD.
 */
const FX_RETRY_MS = 5 * 60_000;

const generateId = () => Math.random().toString(36).substring(2, 9);

const loadPositions = (): TrackedPosition[] => {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                return parsed.filter(isTrackedPosition);
            }
        }
    } catch { /* ignore */ }
    return [];
};

/** False when the browser refused the write: site data blocked, or storage full. */
const savePositions = (positions: TrackedPosition[]): boolean =>
    writeStorage('local', STORAGE_KEY, JSON.stringify(positions));

/**
 * localStorage as an external store, read through useSyncExternalStore.
 *
 * This component server-renders, and localStorage is client-only, so reading it
 * during the initial render made the server (no positions) disagree with the
 * client (positions) — a hydration mismatch for exactly the people who had used
 * the feature. Loading it in an effect fixes the mismatch but is a setState-in-
 * effect, which is the pattern useSyncExternalStore exists to replace.
 *
 * getSnapshot MUST return a stable reference or React re-renders forever, so the
 * parsed array is cached against the raw string it came from.
 */
const EMPTY: TrackedPosition[] = [];
let snapshotRaw: string | null = null;
let snapshotValue: TrackedPosition[] = EMPTY;
// The list after a change the browser refused to store. It is kept for the
// life of the page, so the change still shows, with a line saying it is not
// saved, and a plan just added does not vanish without a word. The next write
// that succeeds clears it.
let unsavedPositions: TrackedPosition[] | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const positionsStore = {
    subscribe(listener: () => void) {
        listeners.add(listener);
        // Another tab editing the same key should update this one.
        window.addEventListener('storage', emit);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) window.removeEventListener('storage', emit);
        };
    },
    getSnapshot(): TrackedPosition[] {
        if (unsavedPositions) return unsavedPositions;
        let raw: string | null = null;
        try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
        if (raw !== snapshotRaw) {
            snapshotRaw = raw;
            snapshotValue = loadPositions();
        }
        return snapshotValue;
    },
    /** The server has no localStorage, so it always renders the empty state. */
    getServerSnapshot: (): TrackedPosition[] => EMPTY,
    /** True while the list on screen is one the browser would not store. */
    getUnsaved: (): boolean => unsavedPositions !== null,
    getServerUnsaved: (): boolean => false,
    write(next: TrackedPosition[]) {
        unsavedPositions = savePositions(next) ? null : next;
        snapshotRaw = null; // force a re-read on the next snapshot
        emit();
    },
};

/** The whole history answered by the server, or the fact that it could not be. */
type OwnHistory =
    | { provider: PriceProvider; status: 'ready'; result: PriceHistoryResult }
    | { provider: PriceProvider; status: 'failed' };

const FIRST_PRICE_DAY = formatUtc(EARLIEST_PRICE_DATE, 'full');

/** Bare number for the bitcoin column; the unit is in the column header. */
const formatBtcBare = (btc: number, unit: Denomination): string => {
    if (!Number.isFinite(btc)) return '0';
    if (unit === 'SATS') return btcToSats(btc).toLocaleString('en-US');
    return btc.toFixed(8);
};

/** "Oct 12, 2026 at 04:50 UTC" */
const formatUtcMoment = (ts: number): string =>
    `${formatUtc(ts, 'full')} at ${new Date(ts).toISOString().slice(11, 16)} UTC`;

// 44px and 16px text on a touch screen: under 640px, and on a coarse pointer at
// any width (a tablet, a phone held sideways). A mouse keeps the compact field.
const fieldClass =
    'w-full px-2.5 py-1.5 text-sm max-sm:min-h-11 max-sm:text-base pointer-coarse:min-h-11 pointer-coarse:text-base rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-shadow';

// The same floor for the small text buttons: 36px for a mouse, 44px for a finger.
const touchButton = 'min-h-9 max-sm:min-h-11 pointer-coarse:min-h-11';

const removeButtonClass =
    'inline-flex items-center justify-center text-base leading-none rounded-md text-slate-500 dark:text-slate-400 hover:text-[var(--color-loss)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';

const roiClass = (roi: number | null): string =>
    roi === null ? 'text-slate-500 dark:text-slate-400' : roi >= 0 ? 'text-gain' : 'text-loss';

const formatRoi = (roi: number | null): string =>
    roi === null ? '—' : `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`;

const REQUIRED_FIELDS: Record<RequiredPositionField, { idSuffix: string; words: string }> = {
    label: { idSuffix: 'label', words: 'a label' },
    amount: { idSuffix: 'amount', words: 'an amount' },
    startDate: { idSuffix: 'start', words: 'a start date' },
    endDate: { idSuffix: 'end', words: 'an end date' },
};

/** "a label", "a label and an end date", "a label, a start date and an end date". */
const listWords = (words: string[]): string =>
    words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

/** The id suffix of the first field the form cannot be saved with: an empty one first, then a wrong value. */
const firstProblemField = (check: NewPositionCheck): string | null => {
    if (check.missing.length > 0) return REQUIRED_FIELDS[check.missing[0]].idSuffix;
    if (check.amountInvalid) return 'amount';
    if (check.startBeforeData || check.startInFuture) return 'start';
    if (check.endOutOfRange || check.datesInverted) return 'end';
    if (check.feeInvalid) return 'fee';
    return null;
};

/**
 * A plan's name, dates and entered amount, with a line for anything about it
 * that was not counted as the dates alone would suggest. Printed in the table
 * and in the phone list, so the two cannot say different things.
 */
function PlanSummary({
    position,
    status,
    result,
}: {
    position: TrackedPosition;
    status: PositionWindow;
    result: DcaResult | null;
}) {
    const buys = result ? result.breakdown.length : 0;
    return (
        <>
            <div className="font-medium text-slate-800 dark:text-white">{position.label}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{position.startDate} to {position.endDate}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {formatEnteredAmount(position)} {position.frequency}
                {position.feePercentage > 0 ? `, ${position.feePercentage}% fee` : ', no fee'}
            </div>
            {/* What was actually counted, when it is not the whole range
                printed above. Never left for the reader to guess. */}
            {!status.valid && (
                <div className="text-[11px] text-loss">These dates cannot be read, so nothing is counted.</div>
            )}
            {status.notStarted && (
                <div className="text-[11px] text-slate-600 dark:text-slate-300">Starts after today: no buys yet.</div>
            )}
            {status.endsInFuture && !status.notStarted && result && (
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    {buys.toLocaleString('en-US')} {buys === 1 ? 'buy' : 'buys'} so far, counted to today.
                </div>
            )}
            {status.endsBeforeData ? (
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    Price data starts {FIRST_PRICE_DAY}, after this plan ended: nothing can be priced.
                </div>
            ) : status.startsBeforeData && (
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    Price data starts {FIRST_PRICE_DAY}: buys before that are not counted.
                </div>
            )}
        </>
    );
}

/** Invested, bitcoin, value and ROI as labelled pairs: one plan, or all of them, in the phone list. */
function PhoneFigures({
    unit,
    invested,
    btc,
    value,
    roi,
}: {
    unit: Denomination;
    invested: string;
    btc: string;
    value: string;
    roi: number | null;
}) {
    const figures: { label: string; text: string; className?: string }[] = [
        { label: 'Invested', text: invested },
        { label: unit === 'SATS' ? 'Sats' : 'BTC', text: btc },
        { label: 'Value', text: value },
        { label: 'ROI', text: formatRoi(roi), className: clsx('font-medium', roiClass(roi)) },
    ];
    return (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
            {figures.map((figure) => (
                <div key={figure.label} className="min-w-0">
                    <dt className="font-normal text-slate-500 dark:text-slate-400">{figure.label}</dt>
                    <dd className={clsx('text-sm tabular-nums whitespace-nowrap', figure.className ?? 'text-slate-700 dark:text-slate-300')}>
                        {figure.text}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

export const CostBasisTracker = ({
    priceData,
    livePrice,
    priceAsOf,
    priceAsOfIsDay = false,
    priceMode,
    provider,
    unit = 'BTC',
}: CostBasisTrackerProps) => {
    const { formatCurrency, currencyConfig, currencies, ratesLive, ratesAsOf, ensureFxRates } = useCurrency();
    const positions = useSyncExternalStore(
        positionsStore.subscribe,
        positionsStore.getSnapshot,
        positionsStore.getServerSnapshot,
    );
    const unsaved = useSyncExternalStore(
        positionsStore.subscribe,
        positionsStore.getUnsaved,
        positionsStore.getServerUnsaved,
    );
    const [showForm, setShowForm] = useState(false);
    const formId = useId();

    // Form state. Amount and fee are held as strings so the field can be
    // cleared while editing (`Number('') === 0` used to snap it to 0); both
    // are checked as typed and parsed once on save. A null amount means "not
    // typed yet": the field shows the default for the active display currency.
    const [label, setLabel] = useState('');
    const [formStartDate, setFormStartDate] = useState('');
    const [formEndDate, setFormEndDate] = useState('');
    const [typedAmount, setTypedAmount] = useState<string | null>(null);
    const [formFrequency, setFormFrequency] = useState<Frequency>(DEFAULT_PLAN.frequency);
    const [formFee, setFormFee] = useState(String(DEFAULT_PLAN.feePercentage));

    // One reading of the clock per mount. "Today" (UTC) decides which buys have
    // happened; nothing on the server render depends on it, because the server
    // always renders the empty state. Kept below the form state on purpose:
    // the React Compiler lint stops treating setters declared after this
    // clock read as stable, and then rejects addPosition's dependency list.
    const [now] = useState(() => Date.now());
    const todayTs = utcDayStart(now);
    const todayIso = utcIsoToday(now);

    const formAmount = typedAmount ?? String(defaultPositionAmount(currencyConfig.rate));
    const amountNum = Number(formAmount);
    const check = checkNewPosition(
        { label, startDate: formStartDate, endDate: formEndDate, amount: formAmount, fee: formFee },
        todayTs,
    );
    const canAdd = check.canAdd;
    // Where the add button sends focus when it is pressed too early, and what
    // the line above it lists. Both are worked out here, above the hooks that
    // depend on the check: the React Compiler lint reads any later call that
    // is handed `check` as a possible change to it.
    const problemField = firstProblemField(check);
    const stillNeeded = check.missing.length > 0
        ? listWords(check.missing.map((field) => REQUIRED_FIELDS[field].words))
        : null;
    const endsInFuture = formEndDate > todayIso && !check.endOutOfRange;

    const addPosition = useCallback(() => {
        if (!canAdd) return;
        const newPosition: TrackedPosition = {
            id: generateId(),
            label: label.trim(),
            startDate: formStartDate,
            endDate: formEndDate,
            // Stored as typed, in the currency it was typed in. Converting to USD
            // here baked in whatever exchange rate was loaded at that moment, and
            // the amount invested then drifted on every later visit.
            amount: amountNum,
            currency: currencyConfig.code,
            frequency: formFrequency,
            // In range, or canAdd would be false. A blank fee is no fee.
            feePercentage: Number(formFee) || 0,
        };
        const updated = [...positions, newPosition];
        positionsStore.write(updated);
        setShowForm(false);
        setLabel('');
        setFormStartDate('');
        setFormEndDate('');
        setTypedAmount(null);
        setFormFrequency(DEFAULT_PLAN.frequency);
        setFormFee(String(DEFAULT_PLAN.feePercentage));
    }, [canAdd, label, formStartDate, formEndDate, amountNum, formFrequency, formFee, positions, currencyConfig.code]);

    const removePosition = useCallback((id: string) => {
        const updated = positions.filter(p => p.id !== id);
        positionsStore.write(updated);
    }, [positions]);

    // The button is never `disabled`: a disabled button is skipped by the Tab
    // key and cannot say why. Pressed too early, it moves to the field that
    // still needs attention.
    const submitForm = () => {
        if (canAdd) {
            addPosition();
            return;
        }
        if (problemField) document.getElementById(`${formId}-${problemField}`)?.focus();
    };

    // The currency context only fetches today's exchange rates once a non-USD
    // display currency is chosen, and only keeps asking after a failure for
    // one. A plan saved in euros needs them even while the page is showing
    // dollars. One request used to be made here on mount; when it failed, a
    // dollar-display visitor's euro plan stayed on the dated rates for as long
    // as the tab lived. So while the rates in hand are not today's, this asks
    // again when the tab is looked at, when the connection returns, and every
    // few minutes. ensureFxRates drops calls less than a minute apart and
    // does nothing once the rates are live. The request takes no arguments.
    const hasNonUsdPosition = positions.some(p => positionCurrency(p) !== 'USD');
    useEffect(() => {
        if (!hasNonUsdPosition || ratesLive) return;
        ensureFxRates();
        const retry = () => { if (!document.hidden) ensureFxRates(); };
        const interval = setInterval(retry, FX_RETRY_MS);
        document.addEventListener('visibilitychange', retry);
        window.addEventListener('online', retry);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', retry);
            window.removeEventListener('online', retry);
        };
    }, [hasNonUsdPosition, ratesLive, ensureFxRates]);

    /**
     * Where the prices come from, and what is never sent to get them.
     *
     * Saved positions have arbitrary dates, and the series handed down by the
     * parent may not reach them (the calculator's is only its own window). The
     * tracker used to ask the server for exactly the range its positions
     * spanned, which told the server the first and last date of the visitor's
     * buying on every page load.
     *
     * Now whether to ask at all depends on one thing about the positions,
     * that at least one is saved, and otherwise on the page: whether the
     * series it came with is the whole history and is up to date. When it is
     * not, the tracker asks for the WHOLE history with fixed arguments, the
     * same request for every visitor. No date, amount or label of a position
     * is part of it, and the action is cached server-side.
     */
    const seedIsWholeHistory = useMemo(
        () => priceSeriesCovers(priceData, EARLIEST_PRICE_TS, todayTs),
        [priceData, todayTs],
    );
    const [ownHistory, setOwnHistory] = useState<OwnHistory | null>(null);
    const [attempt, setAttempt] = useState(0);
    const own = ownHistory !== null && ownHistory.provider === provider ? ownHistory : null;
    const ownReady = own?.status === 'ready';
    const needsHistory = priceMode === 'api' && positions.length > 0 && !seedIsWholeHistory && !ownReady;

    useEffect(() => {
        if (!needsHistory) return;
        let cancelled = false;
        // MAX_END_TS, not "today": the action returns rows up to the newest it
        // has either way, and a constant keeps this visitor's clock out of it.
        getBitcoinPriceHistoryWithMeta(EARLIEST_PRICE_TS, MAX_END_TS, provider)
            .then(result => { if (!cancelled) setOwnHistory({ provider, status: 'ready', result }); })
            .catch(() => { if (!cancelled) setOwnHistory({ provider, status: 'failed' }); });
        return () => { cancelled = true; };
    }, [needsHistory, provider, attempt]);

    const ownSeries = useMemo(
        () => (own?.status === 'ready' ? withPriceKinds(own.result.data, own.result.kinds) : null),
        [own],
    );

    // While the whole history is on its way, the series on the page is used only
    // if it reaches every saved position. Otherwise the rows wait.
    const span = useMemo(() => positionSpan(positions, todayTs), [positions, todayTs]);
    const seedCoversPositions = useMemo(
        () => span !== null && priceSeriesCovers(priceData, span.min, span.max),
        [priceData, span],
    );
    const series = ownSeries ?? (seedCoversPositions ? priceData : null);
    const pricing: 'ready' | 'loading' | 'failed' | 'nothing-to-price' =
        span === null ? 'nothing-to-price'
            : series ? 'ready'
                : own?.status === 'failed' ? 'failed'
                    : 'loading';

    const positionResults = useMemo(() => {
        return positions.map(position => {
            const status = describePositionWindow(position, todayTs);
            if (!series || !status.valid) return { position, status, result: null };
            const unitsPerUsd = currencies.find(c => c.code === positionCurrency(position))?.rate ?? 1;
            // To today, never past it: a plan with a future end date is still
            // running, and the buys it has not made yet are not cost basis.
            const result = calculateDcaToDate(
                {
                    amount: positionAmountUsd(position, unitsPerUsd),
                    frequency: position.frequency,
                    startDate: new Date(status.startTs),
                    endDate: new Date(status.endTs),
                    feePercentage: position.feePercentage,
                    priceMode: 'api',
                    manualPrice: 0,
                },
                series,
                livePrice,
                now,
            );
            return { position, status, result };
        });
    }, [positions, series, livePrice, currencies, todayTs, now]);

    const totals = useMemo(() => {
        let totalInvested = 0;
        let totalBtc = 0;
        let totalValue = 0;
        for (const { result } of positionResults) {
            if (!result) continue;
            totalInvested += result.totalInvested;
            totalBtc += result.btcAccumulated;
            totalValue += result.currentValue;
        }
        const profit = totalValue - totalInvested;
        const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : null;
        const avgCost = totalBtc > 0 ? totalInvested / totalBtc : null;
        return { totalInvested, totalBtc, totalValue, profit, roi, avgCost };
    }, [positionResults]);

    if (priceMode !== 'api' || !priceData.length) return null;

    // Amounts are converted at one current exchange rate, which is exact only for USD.
    const usesFx = currencyConfig.code !== 'USD' || hasNonUsdPosition;
    // Positions from before `currency` was stored: converted to USD when saved.
    const hasLegacyUsd = currencyConfig.code !== 'USD' && positions.some(p => p.currency === undefined);
    const fallbackNotice = own?.status === 'ready'
        ? priceFallbackNotice(own.result.requestedProvider, own.result.servedProvider)
        : null;
    const staleNotice = own?.status === 'ready' && own.result.stale
        ? priceStaleNotice(own.result.servedProvider, own.result.fetchedAt)
        : null;

    const showCombined = positionResults.length > 1 && pricing === 'ready';
    const startInvalid = check.startBeforeData || check.startInFuture;
    const endInvalid = check.endOutOfRange || check.datesInverted;

    return (
        <Card className="p-4 sm:p-6">
            <CardHeader
                title="Cost Basis Tracker"
                className="mb-3 sm:mb-4"
                action={
                    <button
                        onClick={() => setShowForm(!showForm)}
                        aria-expanded={showForm}
                        aria-controls={`${formId}-form`}
                        className={clsx(
                            'inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200/60 dark:border-amber-800/40 transition-colors',
                            touchButton,
                        )}
                    >
                        {showForm ? 'Cancel' : '+ Add plan'}
                    </button>
                }
            />

            {/* Add Position Form */}
            {showForm && (
                <div id={`${formId}-form`} className="mb-4 p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label htmlFor={`${formId}-label`} className="text-xs text-slate-500 dark:text-slate-400">Label</label>
                            <input
                                id={`${formId}-label`}
                                type="text"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="e.g., Weekly DCA 2023"
                                aria-required="true"
                                className={fieldClass}
                            />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor={`${formId}-amount`} className="text-xs text-slate-500 dark:text-slate-400">Amount per buy ({currencyConfig.code})</label>
                            <input
                                id={`${formId}-amount`}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                value={formAmount}
                                onChange={(e) => setTypedAmount(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                aria-required="true"
                                aria-invalid={check.amountInvalid || undefined}
                                aria-describedby={check.amountInvalid ? `${formId}-amount-error` : undefined}
                                className={clsx(fieldClass, 'tabular-nums')}
                            />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <label htmlFor={`${formId}-start`} className="text-xs text-slate-500 dark:text-slate-400">Start Date</label>
                            <input
                                id={`${formId}-start`}
                                type="date"
                                min={EARLIEST_PRICE_DATE}
                                max={todayIso}
                                value={formStartDate}
                                onChange={(e) => setFormStartDate(e.target.value)}
                                aria-required="true"
                                aria-invalid={startInvalid || undefined}
                                aria-describedby={startInvalid ? `${formId}-start-error` : undefined}
                                className={clsx(fieldClass, 'min-w-0 appearance-none')}
                            />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <label htmlFor={`${formId}-end`} className="text-xs text-slate-500 dark:text-slate-400">End Date</label>
                            <input
                                id={`${formId}-end`}
                                type="date"
                                min={EARLIEST_PRICE_DATE}
                                max={MAX_END_DATE}
                                value={formEndDate}
                                onChange={(e) => setFormEndDate(e.target.value)}
                                aria-required="true"
                                aria-invalid={endInvalid || undefined}
                                aria-describedby={
                                    `${formId}-end-hint` +
                                    (check.endOutOfRange ? ` ${formId}-end-range` : '') +
                                    (check.datesInverted ? ` ${formId}-end-order` : '')
                                }
                                className={clsx(fieldClass, 'min-w-0 appearance-none')}
                            />
                            <p id={`${formId}-end-hint`} className="text-[11px] text-slate-500 dark:text-slate-400">
                                Still buying? Use a future end date. Only buys up to today are counted.
                            </p>
                        </div>
                        <div className="space-y-1">
                            <label htmlFor={`${formId}-frequency`} className="text-xs text-slate-500 dark:text-slate-400">Frequency</label>
                            <select
                                id={`${formId}-frequency`}
                                value={formFrequency}
                                onChange={(e) => setFormFrequency(e.target.value as Frequency)}
                                className={fieldClass}
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Bi-weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label htmlFor={`${formId}-fee`} className="text-xs text-slate-500 dark:text-slate-400">Fee (%)</label>
                            <input
                                id={`${formId}-fee`}
                                type="number"
                                inputMode="decimal"
                                step="0.1"
                                min={0}
                                max={MAX_POSITION_FEE_PERCENT}
                                value={formFee}
                                onChange={(e) => setFormFee(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                aria-invalid={check.feeInvalid || undefined}
                                aria-describedby={check.feeInvalid ? `${formId}-fee-error` : undefined}
                                className={clsx(fieldClass, 'tabular-nums')}
                            />
                        </div>
                    </div>
                    {check.startBeforeData && (
                        <p id={`${formId}-start-error`} className="text-xs text-loss">Bitcoin price data starts on 18 August 2010. Pick a later start date.</p>
                    )}
                    {check.startInFuture && (
                        <p id={`${formId}-start-error`} className="text-xs text-loss">
                            Start date can&apos;t be in the future. This tracks buying that has already happened.
                            Days here are UTC days, and today is {formatUtc(todayIso, 'full')}.
                        </p>
                    )}
                    {check.endOutOfRange && (
                        <p id={`${formId}-end-range`} className="text-xs text-loss">End date must be on or before 31 December 2100.</p>
                    )}
                    {check.datesInverted && (
                        <p id={`${formId}-end-order`} className="text-xs text-loss">End date must be on or after the start date.</p>
                    )}
                    {check.amountInvalid && (
                        <p id={`${formId}-amount-error`} className="text-xs text-loss">Amount must be more than zero.</p>
                    )}
                    {check.feeInvalid && (
                        <p id={`${formId}-fee-error`} className="text-xs text-loss">Fee must be between 0 and {MAX_POSITION_FEE_PERCENT}%.</p>
                    )}
                    {canAdd && endsInFuture && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                            This plan ends after today, so it is counted up to today and grows as buys come due.
                        </p>
                    )}
                    {/* Not an error: the form opens with these blank. */}
                    {stillNeeded !== null && (
                        <p id={`${formId}-needs`} className="text-xs text-slate-600 dark:text-slate-300">
                            Still needed: {stillNeeded}.
                        </p>
                    )}
                    <button
                        onClick={submitForm}
                        aria-disabled={!canAdd}
                        aria-describedby={stillNeeded !== null ? `${formId}-needs` : undefined}
                        className="flex h-11 w-full items-center justify-center py-2 text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-amber-500 transition-colors"
                    >
                        Add plan
                    </button>
                </div>
            )}

            {/* Positions List */}
            {positionResults.length > 0 ? (
                <div className="space-y-2">
                    {/* Under 640px: one block per plan. The six-column table is
                        520px wide, and on a phone that puts Value, ROI and the remove
                        button off the right edge with nothing to say they are there. */}
                    <ul className="sm:hidden border-t border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                        {positionResults.map(({ position, status, result }) => (
                            <li key={position.id} className="py-3 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 break-words">
                                        <PlanSummary position={position} status={status} result={result} />
                                    </div>
                                    <button
                                        onClick={() => removePosition(position.id)}
                                        className={clsx(removeButtonClass, 'shrink-0 w-11 h-11 -mt-2 -mr-2')}
                                        title="Remove plan"
                                        aria-label={`Remove plan ${position.label}`}
                                    >
                                        &times;
                                    </button>
                                </div>
                                <PhoneFigures
                                    unit={unit}
                                    invested={result ? formatCurrency(result.totalInvested) : '—'}
                                    btc={result ? formatBtcBare(result.btcAccumulated, unit) : '—'}
                                    value={result ? formatCurrency(result.currentValue) : '—'}
                                    roi={result && result.totalInvested > 0 ? result.roi : null}
                                />
                            </li>
                        ))}
                        {showCombined && (
                            <li className="py-3 text-xs font-semibold">
                                <div className="text-slate-800 dark:text-white">Combined</div>
                                <PhoneFigures
                                    unit={unit}
                                    invested={formatCurrency(totals.totalInvested)}
                                    btc={formatBtcBare(totals.totalBtc, unit)}
                                    value={formatCurrency(totals.totalValue)}
                                    roi={totals.roi}
                                />
                            </li>
                        )}
                    </ul>

                    {/* From 640px up the card is wide enough for the table (520px)
                        without scrolling. `relative` is load-bearing: the sr-only
                        "Actions" header is absolutely positioned, and without a
                        positioned ancestor here it escaped the scroller and made the
                        whole page scroll sideways. */}
                    <div className="relative hidden sm:block overflow-x-auto overscroll-x-contain">
                        <table className="w-full min-w-[520px] text-xs sm:text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                    <th scope="col" className="pb-2 pr-2 font-medium">Plan</th>
                                    <th scope="col" className="pb-2 pr-2 font-medium text-right whitespace-nowrap">Invested</th>
                                    <th scope="col" className="pb-2 pr-2 font-medium text-right whitespace-nowrap">{unit === 'SATS' ? 'Sats' : 'BTC'}</th>
                                    <th scope="col" className="pb-2 pr-2 font-medium text-right whitespace-nowrap">Value</th>
                                    <th scope="col" className="pb-2 pr-2 font-medium text-right whitespace-nowrap">ROI</th>
                                    <th scope="col" className="pb-2 font-medium"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {positionResults.map(({ position, status, result }) => {
                                    const roi = result && result.totalInvested > 0 ? result.roi : null;
                                    return (
                                        <tr key={position.id} className="border-b border-slate-100 dark:border-slate-800 align-top">
                                            <td className="py-2 pr-2">
                                                <PlanSummary position={position} status={status} result={result} />
                                            </td>
                                            <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">{result ? formatCurrency(result.totalInvested) : '—'}</td>
                                            <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">{result ? formatBtcBare(result.btcAccumulated, unit) : '—'}</td>
                                            <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">{result ? formatCurrency(result.currentValue) : '—'}</td>
                                            <td className={clsx('py-2 pr-2 text-right tabular-nums whitespace-nowrap font-medium', roiClass(roi))}>
                                                {formatRoi(roi)}
                                            </td>
                                            <td className="py-2 text-right">
                                                <button
                                                    onClick={() => removePosition(position.id)}
                                                    className={clsx(removeButtonClass, 'w-9 h-9 pointer-coarse:w-11 pointer-coarse:h-11')}
                                                    title="Remove plan"
                                                    aria-label={`Remove plan ${position.label}`}
                                                >
                                                    &times;
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {showCombined && (
                                <tfoot>
                                    <tr className="font-semibold border-t-2 border-slate-300 dark:border-slate-600">
                                        <td className="pt-2 pr-2 text-slate-800 dark:text-white">Combined</td>
                                        <td className="pt-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-800 dark:text-white">{formatCurrency(totals.totalInvested)}</td>
                                        <td className="pt-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-800 dark:text-white">{formatBtcBare(totals.totalBtc, unit)}</td>
                                        <td className="pt-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-800 dark:text-white">{formatCurrency(totals.totalValue)}</td>
                                        <td className={clsx('pt-2 pr-2 text-right tabular-nums whitespace-nowrap', roiClass(totals.roi))}>
                                            {formatRoi(totals.roi)}
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    {pricing === 'loading' && (
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300" role="status">
                            Loading price history&hellip;
                        </p>
                    )}
                    {pricing === 'failed' && (
                        <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300" role="status">
                            <p>
                                The price history could not be loaded, so these plans are not priced right now.
                                {!unsaved && ' They are still saved in this browser.'}
                            </p>
                            <button
                                onClick={() => { setOwnHistory(null); setAttempt(a => a + 1); }}
                                className={clsx('mt-1 inline-flex items-center font-medium text-amber-700 dark:text-amber-400 hover:underline', touchButton)}
                            >
                                Try again
                            </button>
                        </div>
                    )}

                    {pricing === 'ready' && (
                        <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 pt-1 space-y-1">
                            <p>
                                Average cost basis:{' '}
                                <span className="tabular-nums">{totals.avgCost === null ? '—' : formatCurrency(totals.avgCost)}</span> per BTC
                                {livePrice !== null && livePrice > 0 && (
                                    <>
                                        <span className="mx-1.5" aria-hidden="true">&middot;</span>
                                        Valued at <span className="tabular-nums">{formatCurrency(livePrice)}</span> per BTC
                                        {priceAsOf === undefined || !Number.isFinite(priceAsOf)
                                            ? ''
                                            : priceAsOfIsDay
                                                ? `, the newest daily price, dated ${formatUtc(priceAsOf, 'full')}`
                                                : `, the price on ${formatUtcMoment(priceAsOf)}`}
                                    </>
                                )}
                            </p>
                            {usesFx && (
                                <p>
                                    Each plan keeps the amount and currency it was entered in, shown under its name.
                                    Everything else is converted at one exchange rate, the one dated{' '}
                                    {formatUtc(ratesAsOf, 'full')}, not the rate on the day of each buy: the{' '}
                                    {unit === 'SATS' ? 'sats' : 'BTC'}, average
                                    cost and ROI of a plan not entered in US dollars, and any figure shown in a currency
                                    other than the plan&apos;s own. Those are approximate and move when exchange rates
                                    do.
                                    {hasLegacyUsd && ' A plan showing a dollar amount you did not type was saved by an earlier version of this tracker, which converted it to US dollars at the time.'}
                                </p>
                            )}
                            {fallbackNotice && <p>{fallbackNotice}</p>}
                            {staleNotice && <p>{staleNotice}</p>}
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                    Nothing saved yet. Add a plan to see what you paid per BTC.
                </p>
            )}

            {/* Outside the list: removing the last plan can be the change that was refused. */}
            {unsaved && (
                <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300" role="status">
                    This browser would not let the tracker save your last change. It will be gone when you close
                    or reload this tab.
                </p>
            )}
        </Card>
    );
};

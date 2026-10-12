import type { CostBasisPosition, Frequency } from '@/types';
import { CURRENCY_CODES, CURRENCY_SYMBOLS, type CurrencyCode } from '@/data/currencies';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { EARLIEST_PRICE_TS, MAX_END_TS, parseUtcDate, utcDayStart } from '@/utils/dates';
import { roundTo2Sig } from '@/utils/numericInput';
import { URL_PARAM_LIMITS } from '@/utils/urlParams';

/**
 * The cost-basis tracker's rules about a saved position: what one looks like in
 * storage, which of its dates can be priced, and what a new one has to satisfy.
 *
 * Kept out of the component so they can be tested. Nothing here reads the
 * clock: "today" is always an argument.
 */

/**
 * A position as stored in the browser.
 *
 * `amount` is the figure the visitor typed, in `currency`. It used to be
 * converted to USD at the moment of saving and stored as USD, then converted
 * back at whatever the rate was on each later visit, so a plan entered as
 * €100 a week showed a different amount invested every time the euro moved.
 *
 * Positions saved before `currency` existed do not have it. Their `amount`
 * really is USD (that is what was written), so a missing currency means USD.
 */
export interface TrackedPosition extends CostBasisPosition {
    currency?: CurrencyCode;
}

const FREQUENCIES: readonly Frequency[] = ['daily', 'weekly', 'biweekly', 'monthly'];

export const isTrackedPosition = (p: unknown): p is TrackedPosition => {
    if (!p || typeof p !== 'object') return false;
    const pos = p as Record<string, unknown>;
    return typeof pos.id === 'string' &&
           typeof pos.label === 'string' &&
           typeof pos.startDate === 'string' &&
           typeof pos.endDate === 'string' &&
           typeof pos.amount === 'number' && Number.isFinite(pos.amount) && pos.amount > 0 &&
           // An unknown cadence has no next purchase date, and the schedule
           // would run to the engine's hard stop instead of to its end date.
           (FREQUENCIES as readonly unknown[]).includes(pos.frequency) &&
           typeof pos.feePercentage === 'number' && Number.isFinite(pos.feePercentage) &&
           (pos.currency === undefined || (CURRENCY_CODES as readonly unknown[]).includes(pos.currency));
};

export const positionCurrency = (position: TrackedPosition): CurrencyCode => position.currency ?? 'USD';

/**
 * The per-buy amount in USD, which is what the engine works in. `unitsPerUsd`
 * is today's rate for the position's own currency.
 *
 * Today's rate, not the rate on each buy date: the site has no historical
 * exchange rates. For a position entered in USD this is exact. For any other
 * currency the amount invested is exact (it is the typed figure times the
 * number of buys) while the bitcoin bought is an approximation that moves with
 * the exchange rate, and the tracker says so beside the figures.
 */
export const positionAmountUsd = (position: TrackedPosition, unitsPerUsd: number): number =>
    unitsPerUsd > 0 ? position.amount / unitsPerUsd : position.amount;

/** "€100" / "¥7,900" / "$108.70": a stored amount in its own currency. */
export const formatEnteredAmount = (position: TrackedPosition): string =>
    `${CURRENCY_SYMBOLS[positionCurrency(position)]}${position.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * The amount the form opens on: the default plan's per-buy amount in the
 * display currency, as a round number. A bare "50" is ¥50, about 32 cents.
 */
export const defaultPositionAmount = (unitsPerUsd: number): number =>
    roundTo2Sig(DEFAULT_PLAN.amount * (unitsPerUsd > 0 ? unitsPerUsd : 1));

// ── Which of a position's dates can be counted ────────────────────────────────

export interface PositionWindow {
    /** The saved dates as UTC midnight ms. NaN when a date cannot be read. */
    startTs: number;
    endTs: number;
    /** False when a date cannot be read or the end comes before the start. Nothing is computed then. */
    valid: boolean;
    /** The plan runs past today. Only buys dated up to today have happened, so only those are counted. */
    endsInFuture: boolean;
    /** The plan starts after today: no buy has happened. */
    notStarted: boolean;
    /** The plan starts before the first day there is a price for. Buys before that day cannot be priced and are left out. */
    startsBeforeData: boolean;
    /** The whole plan lies before the first day there is a price for: none of it can be priced. */
    endsBeforeData: boolean;
}

/**
 * Where a saved position stands against today and against the start of the
 * price data. The tracker shows each of these beside the row it applies to:
 * a row that silently counted two years of buys that have not happened, or
 * showed $0 for a 2009 start with no explanation, read as a finished fact.
 */
export function describePositionWindow(position: TrackedPosition, todayTs: number): PositionWindow {
    const startTs = parseUtcDate(position.startDate);
    const endTs = parseUtcDate(position.endDate);
    const valid = Number.isFinite(startTs) && Number.isFinite(endTs) && endTs >= startTs;
    const today = utcDayStart(todayTs);
    return {
        startTs,
        endTs,
        valid,
        endsInFuture: valid && endTs > today,
        notStarted: valid && startTs > today,
        startsBeforeData: valid && startTs < EARLIEST_PRICE_TS,
        endsBeforeData: valid && endTs < EARLIEST_PRICE_TS,
    };
}

/**
 * The stretch of history the saved positions need prices for: from the
 * earliest start to the latest end, cut to the days that can be priced (the
 * first day of data to today). Null when no position has a usable window.
 *
 * Used only to decide, in the browser, whether the prices already on the page
 * are enough. It is never sent anywhere.
 */
export function positionSpan(
    positions: readonly TrackedPosition[],
    todayTs: number,
): { min: number; max: number } | null {
    const today = utcDayStart(todayTs);
    let min = Infinity;
    let max = -Infinity;
    for (const position of positions) {
        const status = describePositionWindow(position, todayTs);
        if (!status.valid || status.notStarted || status.endsBeforeData) continue;
        min = Math.min(min, Math.max(status.startTs, EARLIEST_PRICE_TS));
        max = Math.max(max, Math.min(status.endTs, today));
    }
    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

// ── What a new position has to satisfy ────────────────────────────────────────

/** The fields of the add-plan form that have to be filled in, in the order they appear. */
export type RequiredPositionField = 'label' | 'amount' | 'startDate' | 'endDate';

/** The largest fee a plan can carry, in percent: the same ceiling the calculator's own fee field has. */
export const MAX_POSITION_FEE_PERCENT = URL_PARAM_LIMITS.maxFeePct;

export interface NewPositionCheck {
    /**
     * Required fields still empty, in form order. A blank field raises none of
     * the errors below (the form opens blank), so this is what tells the
     * visitor why the plan cannot be added yet.
     */
    missing: RequiredPositionField[];
    amountInvalid: boolean;
    /** The fee is not a number from 0 to MAX_POSITION_FEE_PERCENT. A blank fee is no fee. */
    feeInvalid: boolean;
    datesInverted: boolean;
    /** Start is before the first day of price data (or is not a readable date). */
    startBeforeData: boolean;
    /** Start is after today: the tracker is for buying that has happened. */
    startInFuture: boolean;
    /** End is past the latest date a plan may have (or is not a readable date). */
    endOutOfRange: boolean;
    /** Every field is filled in and none of the above is true. */
    canAdd: boolean;
}

/**
 * Checks the add-plan form. Done in code as well as with min/max on the date
 * fields because browsers do not enforce those for a typed value.
 *
 * A start before the data is rejected, not moved forward: moving it would
 * shift which weekday (or day of the month) every later buy lands on. A future
 * END date is allowed. That is how a plan still running is entered, and the
 * tracker counts it only up to today.
 */
export function checkNewPosition(
    form: { label: string; startDate: string; endDate: string; amount: string; fee?: string },
    todayTs: number,
): NewPositionCheck {
    const amount = Number(form.amount);
    const hasAmount = form.amount.trim() !== '';
    const amountOk = hasAmount && Number.isFinite(amount) && amount > 0;
    const fee = Number(form.fee ?? '');
    // Refused, not clamped: clamping would save a plan typed with an 80% fee
    // at 50% without a word.
    const feeInvalid = !(fee >= 0 && fee <= MAX_POSITION_FEE_PERCENT);
    const startTs = parseUtcDate(form.startDate);
    const endTs = parseUtcDate(form.endDate);
    const hasLabel = form.label.trim() !== '';
    const hasStart = form.startDate !== '';
    const hasEnd = form.endDate !== '';

    const missing: RequiredPositionField[] = [];
    if (!hasLabel) missing.push('label');
    if (!hasAmount) missing.push('amount');
    if (!hasStart) missing.push('startDate');
    if (!hasEnd) missing.push('endDate');

    const startBeforeData = hasStart && !(startTs >= EARLIEST_PRICE_TS);
    const startInFuture = hasStart && startTs > utcDayStart(todayTs);
    const endOutOfRange = hasEnd && !(endTs <= MAX_END_TS);
    const datesInverted = hasStart && hasEnd && endTs < startTs;

    return {
        missing,
        amountInvalid: hasAmount && !amountOk,
        feeInvalid,
        datesInverted,
        startBeforeData,
        startInFuture,
        endOutOfRange,
        canAdd: missing.length === 0 && amountOk && !feeInvalid &&
            !startBeforeData && !startInFuture && !endOutOfRange && !datesInverted,
    };
}

import { CalculatorSearchParams, Frequency, PriceMode } from '@/types';
import { CURRENCY_CODES, type CurrencyCode } from '@/data/currencies';
import { isPriceProvider, type PriceProvider } from '@/data/priceSources';
import { EARLIEST_PRICE_DATE, MAX_END_DATE } from '@/utils/dates';

const VALID_FREQUENCIES: Frequency[] = ['daily', 'weekly', 'biweekly', 'monthly'];
const VALID_MODES: PriceMode[] = ['api', 'manual'];

function isValidDateString(s: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    // Built and read back in UTC, like every other date here: local-time
    // getters reject real dates in zones that once skipped a calendar day
    // (2011-12-30 under Pacific/Apia, 1994-12-31 under Pacific/Kiritimati).
    // setUTCFullYear rather than Date.UTC, which maps years 0-99 to 1900-1999.
    const [y, m, day] = s.split('-').map(Number);
    const d = new Date(0);
    d.setUTCFullYear(y, m - 1, day);
    // Verify it round-trips (catches things like Feb 30)
    return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}

/**
 * The numeric bounds decodeParams enforces, in one place so the docs and the
 * API's messages can quote the code instead of a copy of it.
 *
 * Two different behaviours, on purpose:
 *  - above a "clamped" bound the value is cut down to it and still used;
 *  - outside an "accepted" range the param is dropped, and the public API
 *    answers that with a 400.
 */
export const URL_PARAM_LIMITS = {
    // $1B per purchase / per coin is beyond any real plan but small enough that
    // every downstream product (value × the longest schedule) stays finite.
    /** amount, manualPrice and startingCost: clamped. */
    maxAmount: 1e9,
    /** fee (%): accepted from 0 to this. */
    maxFeePct: 50,
    /** flat (fee per buy): accepted from 0 to this. */
    maxFlatFee: 1e6,
    // 21M BTC is the hard supply cap — anything above is a crafted URL.
    /** startingBtc: clamped. */
    maxStartingBtc: 21_000_000,
    // 200%/yr escalation is already implausible; beyond it the compounding
    // explodes into meaningless numbers within a decade.
    /** esc (%/yr): clamped. */
    maxEscalationPct: 200,
} as const;

/** The currencies a link can name: every display currency (data/currencies). */
export type UrlCurrency = CurrencyCode;

/** Number() reads '' and whitespace as 0. In a link, a blank is not a number. */
const toNumber = (s: string): number => (String(s).trim() === '' ? NaN : Number(s));

export function encodeParams(params: {
    amount: number;
    frequency: Frequency;
    startDate: string;
    endDate: string;
    feePercentage: number;
    priceMode: PriceMode;
    provider: string;
    manualPrice: number;
    currency?: string;
    startingBtc?: number;
    startingAvgCost?: number;
    annualEscalationPct?: number;
    flatFee?: number;
}): string {
    const sp = new URLSearchParams();
    sp.set('amount', String(params.amount));
    sp.set('frequency', params.frequency);
    sp.set('startDate', params.startDate);
    sp.set('endDate', params.endDate);
    sp.set('fee', String(params.feePercentage));
    // Only when set — a plan with no flat fee keeps the link it always had.
    if (params.flatFee && params.flatFee > 0) {
        sp.set('flat', String(params.flatFee));
    }
    sp.set('mode', params.priceMode);
    sp.set('provider', params.provider);
    if (params.priceMode === 'manual') {
        sp.set('manualPrice', String(params.manualPrice));
    }
    if (params.startingBtc && params.startingBtc > 0) {
        sp.set('startingBtc', String(params.startingBtc));
        if (params.startingAvgCost && params.startingAvgCost > 0) {
            sp.set('startingCost', String(params.startingAvgCost));
        }
    }
    if (params.annualEscalationPct && params.annualEscalationPct > 0) {
        sp.set('esc', String(params.annualEscalationPct));
    }
    // Amounts are entered in the sharer's currency, so the link always says
    // which one, USD included. Left implicit, a recipient with a saved JPY or
    // EUR preference would read "amount=50" as ¥50 or €50: a different plan
    // from the one that was shared, with nothing on screen to show it.
    sp.set('currency', params.currency || 'USD');
    return sp.toString();
}

export function decodeParams(searchParams: CalculatorSearchParams): {
    amount?: number;
    frequency?: Frequency;
    startDate?: string;
    endDate?: string;
    feePercentage?: number;
    flatFee?: number;
    priceMode?: PriceMode;
    provider?: PriceProvider;
    manualPrice?: number;
    currency?: UrlCurrency;
    startingBtc?: number;
    startingAvgCost?: number;
    annualEscalationPct?: number;
} | null {
    if (!searchParams || Object.keys(searchParams).length === 0) return null;

    const result: ReturnType<typeof decodeParams> = {};

    if (searchParams.amount) {
        const n = toNumber(searchParams.amount);
        // Ceiling mirrors the fee's range check: a crafted ?amount=1e308 URL
        // must degrade to a large finite result, not NaN profit/ROI.
        // Zero is accepted: with a starting stack it is a real hold-only plan,
        // and the calculator writes amount=0 into its own address bar, which
        // must not come back as the $50 default on reload. Callers for whom
        // zero is an error (the public API) must check for it themselves.
        if (!isNaN(n) && n >= 0) result.amount = Math.min(n, URL_PARAM_LIMITS.maxAmount);
    }
    if (searchParams.frequency && VALID_FREQUENCIES.includes(searchParams.frequency as Frequency)) {
        result.frequency = searchParams.frequency as Frequency;
    }
    if (searchParams.startDate && isValidDateString(searchParams.startDate)) {
        // Clamp rather than reject: a shared link with an out-of-range start still
        // renders a real (if shifted) result instead of silently fabricating prices.
        // ISO dates compare correctly as strings.
        result.startDate = searchParams.startDate < EARLIEST_PRICE_DATE
            ? EARLIEST_PRICE_DATE
            : searchParams.startDate;
    }
    if (searchParams.endDate && isValidDateString(searchParams.endDate)) {
        // Same clamp at the far end: ?endDate=9999-12-31 would run the plan
        // into the engine's purchase limit (a daily plan stops in 2131 under
        // a "to Dec 9999" label) or, with a yearly raise, to Infinity.
        result.endDate = searchParams.endDate > MAX_END_DATE
            ? MAX_END_DATE
            : searchParams.endDate;
    }
    if (searchParams.fee) {
        const n = toNumber(searchParams.fee);
        if (!isNaN(n) && n >= 0 && n <= URL_PARAM_LIMITS.maxFeePct) result.feePercentage = n;
    }
    if (searchParams.flat) {
        const n = toNumber(searchParams.flat);
        // Range-checked like the percentage fee, not clamped: a fee is a small
        // number, and one outside the range is a mistake rather than a plan.
        if (!isNaN(n) && n >= 0 && n <= URL_PARAM_LIMITS.maxFlatFee) result.flatFee = n;
    }
    if (searchParams.mode && VALID_MODES.includes(searchParams.mode as PriceMode)) {
        result.priceMode = searchParams.mode as PriceMode;
    }
    if (isPriceProvider(searchParams.provider)) {
        result.provider = searchParams.provider;
    }
    if (searchParams.manualPrice) {
        const n = toNumber(searchParams.manualPrice);
        if (!isNaN(n) && n > 0) result.manualPrice = Math.min(n, URL_PARAM_LIMITS.maxAmount);
    }
    const currency = CURRENCY_CODES.find((code) => code === searchParams.currency);
    if (currency) result.currency = currency;
    // Zero is ACCEPTED for the plan-shape params (it means "none", and the
    // engine no-ops on it) — API callers legitimately serialize explicit zeros,
    // and rejecting a documented default as garbage is worse than a no-op.
    if (searchParams.startingBtc) {
        const n = toNumber(searchParams.startingBtc);
        if (!isNaN(n) && n >= 0) result.startingBtc = Math.min(n, URL_PARAM_LIMITS.maxStartingBtc);
    }
    if (searchParams.startingCost) {
        const n = toNumber(searchParams.startingCost);
        if (!isNaN(n) && n >= 0) result.startingAvgCost = Math.min(n, URL_PARAM_LIMITS.maxAmount);
    }
    if (searchParams.esc) {
        const n = toNumber(searchParams.esc);
        if (!isNaN(n) && n >= 0) result.annualEscalationPct = Math.min(n, URL_PARAM_LIMITS.maxEscalationPct);
    }

    return Object.keys(result).length > 0 ? result : null;
}

/** What decodeParams returns for a link that carried at least one valid param. */
export type DecodedCalculatorParams = NonNullable<ReturnType<typeof decodeParams>>;

/**
 * The currency a decoded link's money is written in, or undefined when the
 * link carries no money and the visitor's own preference should stand.
 *
 * `amount`, `startingCost` and `flat` are entered in the sharer's display
 * currency. A link that has one of them but no `currency` was written by hand
 * or before encodeParams spelled USD out, and an absent currency has always
 * meant USD there — the rule /share, /embed and the API apply on the server.
 * A link with only dates or a frequency says nothing about money and must not
 * switch the visitor's currency. `manualPrice` is always USD, so it does not
 * count.
 */
export function impliedSessionCurrency(decoded: DecodedCalculatorParams | null): UrlCurrency | undefined {
    if (!decoded) return undefined;
    if (decoded.currency) return decoded.currency;
    // `!== undefined`, not truthiness: amount=0 is a value.
    const carriesDisplayMoney = decoded.amount !== undefined
        || decoded.startingAvgCost !== undefined
        || decoded.flatFee !== undefined;
    return carriesDisplayMoney ? 'USD' : undefined;
}

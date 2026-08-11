import { CalculatorSearchParams, Frequency, PriceMode } from '@/types';
import { EARLIEST_PRICE_DATE } from '@/utils/dates';

const VALID_FREQUENCIES: Frequency[] = ['daily', 'weekly', 'biweekly', 'monthly'];
const VALID_MODES: PriceMode[] = ['api', 'manual'];
const VALID_PROVIDERS = ['kraken', 'coinbase'] as const;

function isValidDateString(s: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return false;
    // Verify it round-trips (catches things like Feb 30)
    const [y, m, day] = s.split('-').map(Number);
    return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
}

// $1B per purchase / per coin is beyond any real plan but small enough that
// every downstream product (value × 40k purchases) stays comfortably finite.
const MAX_URL_AMOUNT = 1e9;

const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'] as const;
export type UrlCurrency = typeof VALID_CURRENCIES[number];

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
}): string {
    const sp = new URLSearchParams();
    sp.set('amount', String(params.amount));
    sp.set('frequency', params.frequency);
    sp.set('startDate', params.startDate);
    sp.set('endDate', params.endDate);
    sp.set('fee', String(params.feePercentage));
    sp.set('mode', params.priceMode);
    sp.set('provider', params.provider);
    if (params.priceMode === 'manual') {
        sp.set('manualPrice', String(params.manualPrice));
    }
    // Only when set — the defaults keep every pre-existing link byte-identical.
    if (params.startingBtc && params.startingBtc > 0) {
        sp.set('startingBtc', String(params.startingBtc));
        if (params.startingAvgCost && params.startingAvgCost > 0) {
            sp.set('startingCost', String(params.startingAvgCost));
        }
    }
    if (params.annualEscalationPct && params.annualEscalationPct > 0) {
        sp.set('esc', String(params.annualEscalationPct));
    }
    // Amounts are entered in the sharer's currency — without it the recipient
    // would silently reinterpret them in their own.
    if (params.currency && params.currency !== 'USD') {
        sp.set('currency', params.currency);
    }
    return sp.toString();
}

export function decodeParams(searchParams: CalculatorSearchParams): {
    amount?: number;
    frequency?: Frequency;
    startDate?: string;
    endDate?: string;
    feePercentage?: number;
    priceMode?: PriceMode;
    provider?: 'kraken' | 'coinbase';
    manualPrice?: number;
    currency?: UrlCurrency;
    startingBtc?: number;
    startingAvgCost?: number;
    annualEscalationPct?: number;
} | null {
    if (!searchParams || Object.keys(searchParams).length === 0) return null;

    const result: ReturnType<typeof decodeParams> = {};

    if (searchParams.amount) {
        const n = Number(searchParams.amount);
        // Ceiling mirrors the fee's range check: a crafted ?amount=1e308 URL
        // must degrade to a large finite result, not NaN profit/ROI.
        if (!isNaN(n) && n > 0) result.amount = Math.min(n, MAX_URL_AMOUNT);
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
        result.endDate = searchParams.endDate;
    }
    if (searchParams.fee) {
        const n = Number(searchParams.fee);
        if (!isNaN(n) && n >= 0 && n <= 50) result.feePercentage = n;
    }
    if (searchParams.mode && VALID_MODES.includes(searchParams.mode as PriceMode)) {
        result.priceMode = searchParams.mode as PriceMode;
    }
    if (searchParams.provider && (VALID_PROVIDERS as readonly string[]).includes(searchParams.provider)) {
        result.provider = searchParams.provider as 'kraken' | 'coinbase';
    }
    if (searchParams.manualPrice) {
        const n = Number(searchParams.manualPrice);
        if (!isNaN(n) && n > 0) result.manualPrice = Math.min(n, MAX_URL_AMOUNT);
    }
    if (searchParams.currency && (VALID_CURRENCIES as readonly string[]).includes(searchParams.currency)) {
        result.currency = searchParams.currency as UrlCurrency;
    }
    // Zero is ACCEPTED for the three plan-shape params (it means "none", and the
    // engine no-ops on it) — API callers legitimately serialize explicit zeros,
    // and rejecting a documented default as garbage is worse than a no-op.
    if (searchParams.startingBtc) {
        const n = Number(searchParams.startingBtc);
        // 21M BTC is the hard supply cap — anything above is a crafted URL.
        if (!isNaN(n) && n >= 0) result.startingBtc = Math.min(n, 21_000_000);
    }
    if (searchParams.startingCost) {
        const n = Number(searchParams.startingCost);
        if (!isNaN(n) && n >= 0) result.startingAvgCost = Math.min(n, MAX_URL_AMOUNT);
    }
    if (searchParams.esc) {
        const n = Number(searchParams.esc);
        // 200%/yr escalation is already implausible; beyond it the compounding
        // explodes into meaningless numbers within a decade.
        if (!isNaN(n) && n >= 0) result.annualEscalationPct = Math.min(n, 200);
    }

    return Object.keys(result).length > 0 ? result : null;
}

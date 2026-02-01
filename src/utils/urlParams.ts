import { CalculatorSearchParams, Frequency, PriceMode } from '@/types';

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

export function encodeParams(params: {
    amount: number;
    frequency: Frequency;
    startDate: string;
    endDate: string;
    feePercentage: number;
    priceMode: PriceMode;
    provider: string;
    manualPrice: number;
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
} | null {
    if (!searchParams || Object.keys(searchParams).length === 0) return null;

    const result: ReturnType<typeof decodeParams> = {};

    if (searchParams.amount) {
        const n = Number(searchParams.amount);
        if (!isNaN(n) && n > 0) result.amount = n;
    }
    if (searchParams.frequency && VALID_FREQUENCIES.includes(searchParams.frequency as Frequency)) {
        result.frequency = searchParams.frequency as Frequency;
    }
    if (searchParams.startDate && isValidDateString(searchParams.startDate)) {
        result.startDate = searchParams.startDate;
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
        if (!isNaN(n) && n > 0) result.manualPrice = n;
    }

    return Object.keys(result).length > 0 ? result : null;
}

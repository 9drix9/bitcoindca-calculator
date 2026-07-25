import { CalculatorSearchParams, Frequency, PriceMode } from '@/types';
import { decodeParams, encodeParams, UrlCurrency } from '@/utils/urlParams';
import { calculateDca } from '@/utils/dca';
import { parseUtcDate, formatUtc, DAY_MS } from '@/utils/dates';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';

// Server-side share-card computation, used by both /share (metadata) and
// /api/og (image). Mirrors DcaCalculator semantics: `amount` is entered in the
// sharer's display currency (divided by the rate before USD math), while
// `manualPrice` and all engine math stay in USD.

// Hardcoded fallback rates copied from CurrencyContext — good enough for a
// share card; the client context (with live ECB rates) cannot run here.
const SHARE_CURRENCIES: Record<UrlCurrency, { symbol: string; rate: number }> = {
    USD: { symbol: '$', rate: 1 },
    EUR: { symbol: '€', rate: 0.92 },
    GBP: { symbol: '£', rate: 0.79 },
    CAD: { symbol: 'C$', rate: 1.36 },
    AUD: { symbol: 'A$', rate: 1.53 },
    JPY: { symbol: '¥', rate: 149.5 },
};

const FREQUENCY_TITLE_SUFFIX: Record<Frequency, string> = {
    daily: '/day',
    weekly: '/week',
    biweekly: ' every 2 weeks',
    monthly: '/month',
};

const FREQUENCY_PHRASE: Record<Frequency, string> = {
    daily: 'every day',
    weekly: 'every week',
    biweekly: 'every 2 weeks',
    monthly: 'every month',
};

export interface ResolvedShareParams {
    amount: number; // in the share currency's units
    frequency: Frequency;
    startDate: string; // yyyy-MM-dd
    endDate: string; // yyyy-MM-dd
    feePercentage: number;
    priceMode: PriceMode;
    provider: 'kraken' | 'coinbase';
    manualPrice: number; // USD
    currency: UrlCurrency;
}

export interface ShareCardData {
    title: string;
    description: string;
    /** e.g. "$19,683" — current portfolio value in the share currency */
    currentValueText: string;
    /** e.g. "+$6,633 (+50.8%)" */
    profitText: string;
    isProfit: boolean;
    /** e.g. "$50 every week · Jul 2021 → Jul 2026 · 0.3097 BTC stacked" */
    paramsLine: string;
}

/** Normalize Next.js searchParams (string | string[]) into the calculator's shape. */
export function toCalculatorParams(raw: Record<string, string | string[] | undefined>): CalculatorSearchParams {
    const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    return {
        amount: pick(raw.amount),
        frequency: pick(raw.frequency),
        startDate: pick(raw.startDate),
        endDate: pick(raw.endDate),
        fee: pick(raw.fee),
        mode: pick(raw.mode),
        provider: pick(raw.provider),
        manualPrice: pick(raw.manualPrice),
        currency: pick(raw.currency),
    };
}

/** Apply the calculator's defaults to whatever survived validation. */
export function resolveShareParams(sp: CalculatorSearchParams): ResolvedShareParams {
    const decoded = decodeParams(sp) ?? {};

    const endDate = decoded.endDate ?? formatUtc(Date.now(), 'isoDay');
    let startDate = decoded.startDate;
    if (!startDate) {
        const end = new Date(parseUtcDate(endDate));
        startDate = formatUtc(
            Date.UTC(end.getUTCFullYear() - 5, end.getUTCMonth(), end.getUTCDate()),
            'isoDay',
        );
    }

    return {
        amount: decoded.amount ?? 50,
        frequency: decoded.frequency ?? 'weekly',
        startDate,
        endDate,
        feePercentage: decoded.feePercentage ?? 0.5,
        priceMode: decoded.priceMode ?? 'api',
        provider: decoded.provider ?? 'kraken',
        manualPrice: decoded.manualPrice ?? 0,
        currency: decoded.currency ?? 'USD',
    };
}

/** Canonical query string for the resolved params (redirect target + OG image URL). */
export function encodeShareQuery(p: ResolvedShareParams): string {
    return encodeParams({
        amount: p.amount,
        frequency: p.frequency,
        startDate: p.startDate,
        endDate: p.endDate,
        feePercentage: p.feePercentage,
        priceMode: p.priceMode,
        provider: p.provider,
        manualPrice: p.manualPrice,
        currency: p.currency,
    });
}

/** Format a USD value in the share currency (converted via the hardcoded rate). */
function formatShareCurrency(usd: number, currency: UrlCurrency): string {
    const cfg = SHARE_CURRENCIES[currency];
    const converted = usd * cfg.rate;
    const sign = converted < 0 ? '-' : '';
    const abs = Math.abs(converted);
    // Sub-unit values (early BTC history) would otherwise render as "$0"
    const digits = currency === 'JPY' ? 0 : abs > 0 && abs < 1 ? 4 : 0;
    return `${sign}${cfg.symbol}${abs.toLocaleString('en-US', { maximumFractionDigits: digits })}`;
}

/** Format an amount already denominated in the share currency (no conversion). */
function formatDisplayAmount(amount: number, currency: UrlCurrency): string {
    const cfg = SHARE_CURRENCIES[currency];
    return `${cfg.symbol}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatBtcAmount(btc: number): string {
    if (!Number.isFinite(btc) || btc <= 0) return '0 BTC';
    if (btc >= 1) return `${btc.toLocaleString('en-US', { maximumFractionDigits: 2 })} BTC`;
    if (btc < 1e-6) return `${btc.toFixed(8)} BTC`;
    return `${Number(btc.toPrecision(4))} BTC`;
}

/**
 * Run the DCA backtest server-side and produce the share-card copy.
 * Returns null when a meaningful result cannot be computed — callers fall back
 * to generic branded metadata/imagery. Never throws.
 */
export async function computeShareCard(p: ResolvedShareParams): Promise<ShareCardData | null> {
    try {
        const startTs = parseUtcDate(p.startDate);
        const endTs = parseUtcDate(p.endDate);
        if (isNaN(startTs) || isNaN(endTs) || startTs > endTs) return null;
        if (p.priceMode === 'manual' && p.manualPrice <= 0) return null;

        let priceData: [number, number][] | undefined;
        let currentPrice: number | null = null;
        if (p.priceMode === 'api') {
            const [history, price] = await Promise.all([
                getBitcoinPriceHistory(startTs, endTs + DAY_MS, p.provider),
                getCurrentBitcoinPrice(p.provider).catch(() => null),
            ]);
            if (!history || history.length === 0) return null;
            priceData = history;
            currentPrice = price && price > 0 ? price : null;
        }

        const cfg = SHARE_CURRENCIES[p.currency];
        const amountUsd = p.amount / cfg.rate;

        const result = calculateDca(
            {
                amount: amountUsd,
                frequency: p.frequency,
                startDate: new Date(startTs),
                endDate: new Date(endTs),
                feePercentage: p.feePercentage,
                priceMode: p.priceMode,
                manualPrice: p.manualPrice,
            },
            priceData,
            p.priceMode === 'api' ? currentPrice : undefined,
        );

        if (
            !(result.totalInvested > 0) ||
            !(result.btcAccumulated > 0) ||
            !(result.currentValue > 0) ||
            !Number.isFinite(result.roi)
        ) {
            return null;
        }

        const currentValueText = formatShareCurrency(result.currentValue, p.currency);
        const investedText = formatShareCurrency(result.totalInvested, p.currency);
        const amountText = formatDisplayAmount(p.amount, p.currency);
        const btcText = formatBtcAmount(result.btcAccumulated);
        const since = formatUtc(startTs, 'monthYear');
        const until = formatUtc(endTs, 'monthYear');

        const isProfit = result.profit >= 0;
        const roiSign = result.roi >= 0 ? '+' : '';
        const roiWhole = `${roiSign}${Math.round(result.roi)}%`;
        const roiFull = `${roiSign}${result.roi.toFixed(1)}%`;

        const profitAbs = formatShareCurrency(Math.abs(result.profit), p.currency);
        const profitText = `${isProfit ? '+' : '-'}${profitAbs} (${roiFull})`;

        return {
            title: `${amountText}${FREQUENCY_TITLE_SUFFIX[p.frequency]} in Bitcoin since ${since} → ${currentValueText} (${roiWhole})`,
            description: `Invested ${investedText} since ${since}, now worth ${currentValueText} (${roiFull} ROI) with ${btcText} stacked — backtest your own Bitcoin DCA strategy at btcdollarcostaverage.com.`,
            currentValueText,
            profitText,
            isProfit,
            paramsLine: `${amountText} ${FREQUENCY_PHRASE[p.frequency]} · ${since} → ${until} · ${btcText} stacked`,
        };
    } catch (error) {
        console.error('[computeShareCard] failed:', error);
        return null;
    }
}

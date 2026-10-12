import type { CurrencyCode } from '@/data/currencies';
import { formatUtc } from '@/utils/dates';

// The decisions CurrencyContext makes, as plain functions: which currency
// figures are shown in, what is said about its rate, and how a large amount is
// shortened. Kept apart from the provider so they can be tested without one.

/**
 * The currency figures are shown in while `chosen` is what the visitor asked
 * for.
 *
 * A currency picked in the picker is held in USD until its rates are in hand
 * (`ratesSettled`), so the currency and its rate change in one step: shown at
 * the dated rate first and corrected a moment later, every figure jumps twice,
 * and anything rescaled on the switch keeps the first rate's number.
 *
 * A currency that arrived with a link is never held. The link's amounts are
 * written in it, and read as dollars for even a moment they are a different
 * plan, on screen and in the address the calculator writes back.
 */
export function shownCurrencyFor(
    chosen: CurrencyCode,
    ratesSettled: boolean,
    arrived: CurrencyCode | null,
): CurrencyCode {
    return chosen === 'USD' || ratesSettled || chosen === arrived ? chosen : 'USD';
}

/**
 * One sentence for beside converted figures while the display currency's rate
 * is not today's; null for USD, for live rates, and until the request for them
 * has answered, failed or been waited out (`settled`). Before that the request
 * is normally a few hundred milliseconds from answering, and the sentence
 * would appear on five surfaces only to vanish.
 *
 * `answered` is whether a request has come back at all. Until one has, the
 * rates are not known to be unavailable, only late.
 */
export function rateNoteFor(rates: {
    shown: CurrencyCode;
    live: boolean;
    settled: boolean;
    answered: boolean;
    /** 'yyyy-MM-dd' the rates in use are dated. */
    asOf: string;
}): string | null {
    const { shown, live, settled, answered, asOf } = rates;
    // USD is never approximate, whatever the rate provider is doing.
    if (shown === 'USD' || live || !settled) return null;
    const dated = formatUtc(asOf, 'full');
    return answered
        ? `Today's ${shown} exchange rate is not available, so ${shown} figures use the rate from ${dated} and are approximate.`
        : `Today's ${shown} exchange rate is still loading. Until it arrives, ${shown} figures use the rate from ${dated} and are approximate.`;
}

/**
 * An amount already in the display currency, shortened for a phone: "$13.1K",
 * "¥1.8T". Whole units below 10,000.
 */
export function compactMoney(converted: number, currency: { code: CurrencyCode; symbol: string }): string {
    const sign = converted < 0 ? '-' : '';
    // To the currency's smallest unit first: 13,050 dollars turned into euros
    // and back is 13049.999999999989, which would read "13.0K" beside "13,050".
    const minor = currency.code === 'JPY' ? 1 : 100;
    const abs = Math.round(Math.abs(converted) * minor) / minor;
    // Tenths of `unit`, rounded half up from a whole number: toFixed works on
    // the binary fraction, which rounds 12.85 down and 13.05 up.
    const tenths = (unit: number): number => Math.round(abs / (unit / 10)) / 10;
    const prefix = `${sign}${currency.symbol}`;
    // Each tier starts where the one below would round up into it: 999,960 is
    // "1.0M", not "1000.0K".
    if (abs >= 999_950_000_000) {
        // The top tier, so its number can pass 1,000 and keeps separators.
        return `${prefix}${tenths(1e12).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}T`;
    }
    if (abs >= 999_950_000) return `${prefix}${tenths(1e9).toFixed(1)}B`;
    if (abs >= 999_950) return `${prefix}${tenths(1e6).toFixed(1)}M`;
    if (abs >= 10_000) return `${prefix}${tenths(1e3).toFixed(1)}K`;
    // 'en-US' like every other formatter here. Left to the browser's locale, a
    // German visitor's $9,135 rendered as "$9.135", and the text no longer
    // matched the server's HTML at hydration.
    return `${prefix}${Math.round(abs).toLocaleString('en-US')}`;
}

/**
 * How long until a request for today's rates may start: 0 means now.
 * `minGapMs` is the least time between two requests, whatever asks.
 */
export function fxRequestWaitMs(
    request: { inFlight: boolean; lastTry: number },
    now: number,
    minGapMs: number,
): number {
    const sinceLastTry = now - request.lastTry;
    if (!request.inFlight && sinceLastTry >= minGapMs) return 0;
    // At least a second, so a caller that waits this long and asks again
    // cannot spin while a request is still in flight past the gap.
    return Math.max(1_000, minGapMs - sinceLastTry);
}

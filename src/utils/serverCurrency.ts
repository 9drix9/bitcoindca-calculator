import { getFxRates } from '@/app/actions';
import type { UrlCurrency } from '@/utils/urlParams';

/**
 * Currency display config for SERVER-rendered surfaces (/share cards, /embed).
 *
 * The client's CurrencyContext refreshes its rates from the ECB and cannot run
 * in a server component, so these two surfaces each used to carry their own
 * hardcoded copy of the rate table. Both copies drifted about 18 months out of
 * date, which is not cosmetic: the rate divides the user's contribution to get
 * USD before any BTC math (`amount / rate`), so an AUD embed understated BTC
 * stacked by ~7.2% and overstated average cost by ~7.7% — numbers that
 * contradicted the calculator one click away, on the exact surfaces people
 * screenshot and third parties embed.
 *
 * One table now, live rates preferred, constants only as a provider-outage
 * fallback.
 */

export const CURRENCY_SYMBOLS: Record<UrlCurrency, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CAD: 'C$',
    AUD: 'A$',
    JPY: '¥',
};

/** Last-resort rates, used only when the FX provider is unreachable. */
const FALLBACK_RATES: Record<UrlCurrency, number> = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    CAD: 1.36,
    AUD: 1.53,
    JPY: 149.5,
};

export interface ServerCurrencyConfig {
    symbol: string;
    /** USD -> display currency. Divide a display-currency amount by this for USD. */
    rate: number;
    /** False when the FX provider was unreachable and a stale constant was used. */
    live: boolean;
}

/**
 * Resolve one currency against live ECB rates, falling back to the constants.
 * `getFxRates` is cached for 12h and coalesced, so calling this per render is cheap.
 */
export async function resolveServerCurrency(code: UrlCurrency): Promise<ServerCurrencyConfig> {
    const symbol = CURRENCY_SYMBOLS[code] ?? '$';
    if (code === 'USD') return { symbol, rate: 1, live: true };

    try {
        const rates = await getFxRates();
        const live = rates?.[code as Exclude<UrlCurrency, 'USD'>];
        if (Number.isFinite(live) && (live as number) > 0) {
            return { symbol, rate: live as number, live: true };
        }
    } catch {
        // fall through to the constant
    }
    return { symbol, rate: FALLBACK_RATES[code] ?? 1, live: false };
}

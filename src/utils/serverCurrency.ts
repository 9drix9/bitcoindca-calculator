import { getFxSnapshot } from '@/app/actions';
import { CURRENCY_SYMBOLS, type CurrencyCode } from '@/data/currencies';

/**
 * Currency display config for SERVER-rendered surfaces (/share cards, /embed).
 *
 * The client's CurrencyContext refreshes its rates from the ECB and cannot run
 * in a server component, so these surfaces resolve the same rates here. The
 * rate is not cosmetic: it divides the user's contribution to get USD before
 * any BTC math (`amount / rate`), so a stale one misstates the BTC stacked and
 * the average cost on exactly the surfaces people screenshot and third parties
 * embed.
 *
 * Live rates preferred; the dated constants in data/currencies are the only
 * fallback table, and a rate taken from them comes back flagged.
 */

export { CURRENCY_SYMBOLS };

export interface ServerCurrencyConfig {
    symbol: string;
    /** USD -> display currency. Divide a display-currency amount by this for USD. */
    rate: number;
    /**
     * False when the FX provider was unreachable and `rate` is the constant
     * from data/currencies. Figures converted with it are approximate and
     * should be labelled so, with `asOf`.
     */
    live: boolean;
    /**
     * 'yyyy-MM-dd' the rate is dated: the ECB's publication day, or the day the
     * constant was taken. Set by resolveServerCurrency for every currency that
     * has a rate; left out for USD, which has none to date.
     */
    asOf?: string;
}

/**
 * Resolve one currency against live ECB rates, falling back to the constants.
 * The rates are cached for 12h, so calling this per render is cheap.
 */
export async function resolveServerCurrency(code: CurrencyCode): Promise<ServerCurrencyConfig> {
    const symbol = CURRENCY_SYMBOLS[code] ?? '$';
    // USD needs no rate, so it is never "approximate" whatever the provider is
    // doing, and a US-dollar share card or embed does not wait on rates for a
    // conversion it never makes.
    if (code === 'USD') return { symbol, rate: 1, live: true };
    const snapshot = await getFxSnapshot();
    const rate = snapshot.rates[code];
    return Number.isFinite(rate) && rate > 0
        ? { symbol, rate, live: snapshot.live, asOf: snapshot.asOf }
        : { symbol: '$', rate: 1, live: false, asOf: snapshot.asOf };
}

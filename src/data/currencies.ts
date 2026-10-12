/**
 * The display currencies, their symbols, and the last-resort exchange rates.
 *
 * One table for the client's CurrencyContext and the server's serverCurrency,
 * so the two cannot hold different rates. The rate is not cosmetic: it divides
 * a visitor's contribution to get USD before any bitcoin math, so a rate that
 * is 5% out misstates the BTC stacked by 5%.
 *
 * Safe to import from client components: constants and types only.
 */

export const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'] as const;
export type CurrencyCode = typeof CURRENCY_CODES[number];

/** Every currency that needs a rate, i.e. all of them but USD. */
export const FX_QUOTE_CODES = ['EUR', 'GBP', 'CAD', 'AUD', 'JPY'] as const;
export type FxQuoteCode = typeof FX_QUOTE_CODES[number];

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CAD: 'C$',
    AUD: 'A$',
    JPY: '¥',
};

/** Picker wording, e.g. "EUR (€)". */
export const currencyLabel = (code: CurrencyCode): string => `${code} (${CURRENCY_SYMBOLS[code]})`;

/**
 * Units of each currency per 1 USD, used only when the live rates cannot be
 * fetched. A figure converted with these is approximate and has to be shown as
 * such (see FxSnapshot.live).
 *
 * Source: European Central Bank euro reference rates of FX_FALLBACK_AS_OF,
 * rebased to USD (each rate divided by that day's EUR/USD of 1.1181), as
 * served by api.frankfurter.dev/v2/providers/ecb/rates and checked against the
 * ECB's own eurofxref-daily.xml on 2026-10-12.
 *
 * These go stale by design. Refresh the numbers and the date together whenever
 * this file is touched; the date is shown to visitors beside any figure that
 * used them, so an old one is at least visible.
 */
export const FX_FALLBACK_AS_OF = '2026-10-12';

export const FX_FALLBACK_RATES: Record<CurrencyCode, number> = {
    USD: 1,
    EUR: 0.89437,
    GBP: 0.75555,
    CAD: 1.4262,
    AUD: 1.4339,
    JPY: 158.6,
};

/**
 * Exchange rates plus where they came from.
 *
 * `live` is the flag to act on. True: ECB reference rates published on `asOf`,
 * no more than a week ago (the ECB publishes once per working day, so over a
 * weekend `asOf` is the Friday). False: the provider could not be reached and
 * these are either the FX_FALLBACK_RATES above or ECB rates more than a week
 * old; anything converted with them should be labelled approximate, as of
 * `asOf`.
 */
export interface FxSnapshot {
    /** Units per 1 USD, for every code including USD (always 1). */
    rates: Record<CurrencyCode, number>;
    live: boolean;
    /** 'yyyy-MM-dd' the rates are dated. */
    asOf: string;
}

export const FX_FALLBACK_SNAPSHOT: FxSnapshot = {
    rates: FX_FALLBACK_RATES,
    live: false,
    asOf: FX_FALLBACK_AS_OF,
};

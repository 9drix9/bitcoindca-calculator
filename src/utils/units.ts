/** Satoshis in one bitcoin. */
export const SATS_PER_BTC = 100_000_000;

/**
 * Whole satoshis in a BTC amount. Rounded, not floored: 0.29 * 1e8 is
 * 28999999.999999996 in floating point, so flooring would show a stack typed
 * as 0.29 BTC as 28,999,999 sats while BTC mode (toFixed, which rounds) shows
 * 0.29. `|| 0` turns -0 and NaN into 0, which would otherwise print as "-0"
 * or "NaN".
 *
 * Lives here, not in the currency context, so server pages can use it too.
 */
export const btcToSats = (btc: number): number => Math.round(btc * SATS_PER_BTC) || 0;

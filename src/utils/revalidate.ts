/**
 * Cache lifetimes for the price fetches, shared by the server actions and the
 * routes that call them.
 *
 * These live outside `src/app/actions.ts` on purpose: that file is `'use server'`,
 * and Next only permits async function exports from a server-actions module, so a
 * plain numeric export there is a build error.
 *
 * Why routes care about a *fetch* setting: Next lowers a route's effective
 * `revalidate` to the smallest revalidate of any fetch it performs. The daily SEO
 * pages declare `export const revalidate = 86400` and tell readers their figures
 * refresh once a day; at the default lifetimes they would regenerate every 60
 * seconds instead, re-running full-history backtests each time. Those pages pass
 * DAILY_PRICE_REVALIDATE explicitly.
 */

/** Spot-price default. Live widgets want a fresh number. */
export const DEFAULT_PRICE_REVALIDATE = 60;

/** Full-history default. The series only gains one candle a day. */
export const HISTORY_REVALIDATE = 3600;

/** For pages whose copy promises daily figures. */
export const DAILY_PRICE_REVALIDATE = 86_400;

/**
 * For candles that can no longer change: a Coinbase chunk whose last day closed
 * more than a day ago. A week, not forever, so a cached copy is still replaced
 * now and then. Longer than any route's own `revalidate`, so it never shortens
 * one.
 */
export const SEALED_HISTORY_REVALIDATE = 7 * 86_400;

/**
 * How long a page rendered WITHOUT its data (or on a fallback series) should be
 * cached before it is rendered again. See utils/isr.ts.
 */
export const FAILURE_REVALIDATE = 300;

/**
 * Clamp an untrusted revalidate argument.
 *
 * Every exported function in a `'use server'` file is a public HTTP endpoint that
 * anyone can call with arbitrary arguments, so an unclamped value of 0 would turn
 * these actions into an uncached proxy onto the upstream APIs.
 */
export function normalizeRevalidate(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(DAILY_PRICE_REVALIDATE, Math.max(DEFAULT_PRICE_REVALIDATE, Math.floor(value)));
}

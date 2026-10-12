'use client';

import { useSyncExternalStore } from 'react';
import {
    LIVE_LIFETIME_SECONDS,
    LIVE_TICKER_URL,
    liveFigureMaxAgeMs,
    type TickerQuote,
} from '@/app/api/live/contract';
import { PRICE_PROVIDERS } from '@/data/priceSources';
import { createPoller, type Accepted, type PollState } from './livePoller';

// The hero ticker's quote, from /api/live/ticker.

const POLL_MS = LIVE_LIFETIME_SECONDS.ticker * 1000;
/** A quote older than this is not a live price. */
export const TICKER_MAX_AGE_MS = liveFigureMaxAgeMs(LIVE_LIFETIME_SECONDS.ticker);

/**
 * The quote in an answer, or null when it is not one the pill can show as
 * live: a field missing or out of range, or a quote that was already too old
 * when it arrived.
 */
export function acceptTicker(body: Record<string, unknown>, serverNow: number): Accepted<TickerQuote | null> | null {
    const { price, open24h, provider, changeSince, asOf } = body as Partial<TickerQuote>;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
    if (typeof open24h !== 'number' || !Number.isFinite(open24h)) return null;
    if (typeof asOf !== 'number' || !Number.isFinite(asOf) || serverNow - asOf > TICKER_MAX_AGE_MS) return null;
    if (!PRICE_PROVIDERS.some((known) => known === provider)) return null;
    if (changeSince !== 'utc-midnight' && changeSince !== '24h-ago') return null;
    return { value: { price, open24h, provider: provider as TickerQuote['provider'], changeSince, asOf }, complete: true };
}

const ticker = createPoller<TickerQuote | null>({
    url: LIVE_TICKER_URL,
    initial: null,
    accept: (_previous, body, serverNow) => acceptTicker(body, serverNow),
});

// Due at once, whatever the page came with: the home page is served from a
// cache and rebuilt in the background, so the first visitor after a quiet
// spell gets the price from before it, and the pill would present it as live.
const subscribe = (listener: () => void) => ticker.subscribe({ pollMs: POLL_MS, dueIn: 0 }, listener);
const serverState = () => ticker.initialState;

/** The quote this page view has fetched (null until it has), and how the fetching is going. */
export const useLiveTicker = (): PollState<TickerQuote | null> =>
    useSyncExternalStore(subscribe, ticker.getState, serverState);

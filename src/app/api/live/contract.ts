import type { PriceProvider } from '@/data/priceSources';
import type { SpotQuote } from '@/utils/priceSeries';
import { DEFAULT_PRICE_REVALIDATE } from '@/utils/revalidate';

// What /api/live answers with: the two addresses the hero ticker and the
// sidebar cards poll, the shape of each response, and the rule for how old a
// figure may be. Server and client read the same definitions.
//
// Safe to import from client components: constants and types only.

export const LIVE_TICKER_URL = '/api/live/ticker';
export const LIVE_SIDEBAR_URL = '/api/live/sidebar';

/** A figure, and the moment (ms epoch) its provider's answer was fetched. Not when a cache was read. */
export interface LiveFigure<T> {
    data: T;
    fetchedAt: number;
}

export interface TickerQuote {
    price: number;
    /** The price the change is measured from; `changeSince` says which. */
    open24h: number;
    /** The exchange that answered: Kraken, or Coinbase when Kraken has no current quote. */
    provider: PriceProvider;
    /** Kraken reports today's 00:00 UTC open, Coinbase the price 24 hours ago. */
    changeSince: 'utc-midnight' | '24h-ago';
    /** ms epoch the quote was fetched from the exchange. */
    asOf: number;
}

export interface MempoolFees {
    highFee: number;
    mediumFee: number;
    lowFee: number;
}

export interface RecentBlock {
    height: number;
    /** Seconds since the epoch, as the block header has it. */
    timestamp: number;
    txCount: number;
    size: number;
}

export interface HashRateDifficulty {
    hashrate: number;
    difficulty: number;
    adjustmentPercent: number;
    blocksUntilAdjustment: number;
    /** ISO date-time, or '' when the provider sent none. */
    estimatedRetargetDate: string;
}

export interface LightningStats {
    nodeCount: number;
    channelCount: number;
    totalCapacityBtc: number;
    /**
     * UTC day (ms epoch) mempool.space dates these counts. It publishes one
     * row a day and some of its servers answer with an old one, so this can be
     * weeks behind the time the row was fetched.
     */
    asOf: number;
}

export interface BitcoinDominance {
    dominancePercent: number;
    btcMarketCap: number;
    totalMarketCap: number;
}

export interface FearGreed {
    value: number;
    classification: string;
}

export interface PurchasingPower {
    cpiStart: number;
    cpiNow: number;
    btcPriceStart: number;
    btcPriceNow: number;
}

/**
 * Everything the sidebar cards show, in one response. A figure whose provider
 * is failing, or whose latest answer is older than liveFigureMaxAgeMs allows,
 * is null: nothing here is older than that bound when the server answers.
 */
export interface LiveSidebar {
    mempoolFees: LiveFigure<MempoolFees> | null;
    blockHeight: LiveFigure<number> | null;
    recentBlocks: LiveFigure<RecentBlock[]> | null;
    hashRate: LiveFigure<HashRateDifficulty> | null;
    /** Bitcoin in circulation, in satoshis. */
    supplySats: LiveFigure<number> | null;
    lightning: LiveFigure<LightningStats> | null;
    dominance: LiveFigure<BitcoinDominance> | null;
    fearGreed: LiveFigure<FearGreed> | null;
    /** `fetchedAt` is the bitcoin quote's; the CPI readings in it are monthly. */
    purchasingPower: LiveFigure<PurchasingPower> | null;
    spot: SpotQuote | null;
}

/**
 * What a 200 adds to its figures: the moment (ms epoch) the response was put
 * together, on the same clock as every `fetchedAt` and `asOf` in it. The
 * difference is a figure's age when the server answered, with no reference to
 * the visitor's clock; a CDN that then held the response says for how long in
 * its Age header (seconds).
 */
export interface LiveStamp {
    generatedAt: number;
}

export type LiveTickerResponse = TickerQuote & LiveStamp;
export type LiveSidebarResponse = LiveSidebar & LiveStamp;

/** The body of a 503: nothing could be had. */
export interface LiveUnavailable {
    error: string;
}

/**
 * Seconds each figure is reused before its provider is asked again: how fast
 * the figure itself moves. Prices by the second, fees and blocks with every
 * block, the rest a few times an hour or once a day.
 */
export const LIVE_LIFETIME_SECONDS = {
    ticker: 30,
    spot: DEFAULT_PRICE_REVALIDATE,
    /** Dated by the bitcoin quote in it. */
    purchasingPower: DEFAULT_PRICE_REVALIDATE,
    mempoolFees: 30,
    blockHeight: 30,
    recentBlocks: 30,
    hashRate: 300,
    supplySats: 300,
    lightning: 600,
    dominance: 300,
    fearGreed: 300,
} as const;

/**
 * How old a figure may be and still be shown as current: three of its
 * lifetimes, and never under five minutes. An entry that a single visitor
 * keeps refreshing can be two lifetimes old, so a tighter bound would flap.
 */
export const liveFigureMaxAgeMs = (lifetimeSeconds: number): number => Math.max(3 * lifetimeSeconds, 300) * 1000;

/**
 * Seconds a response may be held at the CDN: no longer than the fastest figure
 * in it is polled. No stale-while-revalidate is sent, because that would have
 * the first visitor after a quiet spell answered with the figures from before
 * it. Vercel's CDN does not do that unasked: measured on 2026-10-12, an entry
 * with only s-maxage was fetched afresh once it had expired.
 */
export const LIVE_CDN_SECONDS = {
    ticker: 15,
    sidebar: 30,
    /** The sidebar with a figure missing: short, so the figure is back soon after its provider is. */
    sidebarDegraded: 10,
} as const;

/** Cache-Control for a response that may be held at the CDN for `seconds`; 0 means not at all. */
export const liveCacheControl = (seconds: number): string =>
    (seconds > 0 ? `public, max-age=0, s-maxage=${seconds}` : 'no-store');

import {
    FIRST_EXCHANGE_CLOSE_DATE,
    PRICE_PROVIDER_LABELS,
    SNAPSHOT_END_DATE,
    priceFallbackNotice,
    priceStaleNotice,
    type PriceProvider,
} from '@/data/priceSources';
import {
    DEFAULT_YEARS_BACK,
    EARLIEST_PRICE_DATE,
    EARLIEST_PRICE_TS,
    defaultStartFor,
    formatUtc,
    hasHappenedUtc,
    parseUtcDate,
    utcDayStart,
    utcIsoToday,
} from '@/utils/dates';
import { PRICE_KIND_CODE } from '@/utils/dca';
import { FAILURE_REVALIDATE } from '@/utils/revalidate';

// The public contract of /api/v1 that is not HTTP plumbing: the numbers the
// routes enforce, the rules for which dates a request may ask about, and the
// words every response uses to say where its prices came from.
//
// Kept apart from shared.ts (which reaches the exchanges) so that /developers
// can quote these values instead of a copy of them, and so each rule can be
// tested without a network. Nothing here reads the clock: `now` is an argument.

// ── Limits and lifetimes ──────────────────────────────────────────────────────

/**
 * Full daily history for >5 years of purchases is a large payload; ~2000 rows
 * keeps the response under ~500KB while purchaseCount stays the true total.
 */
export const BREAKDOWN_CAP = 2000;

/** CDN lifetimes in seconds, as sent in Cache-Control. */
export const API_CACHE_SECONDS = {
    prices: 3600,
    dca: 1800,
    /**
     * How long past its lifetime a response may still be served while the CDN
     * refetches. Minutes, not a day: the first caller after a quiet spell is
     * the one who gets the old copy, and the natural client of a daily series
     * calls once a day.
     */
    staleWhileRevalidate: 300,
    /**
     * For a response built on something other than the requested exchange's
     * current series. Short, and with no stale-while-revalidate, so it is
     * replaced soon after the exchange is back.
     */
    degraded: FAILURE_REVALIDATE,
} as const;

export function cacheControl(kind: 'prices' | 'dca', degraded: boolean): string {
    if (degraded) return `public, s-maxage=${API_CACHE_SECONDS.degraded}`;
    return `public, s-maxage=${API_CACHE_SECONDS[kind]}, stale-while-revalidate=${API_CACHE_SECONDS.staleWhileRevalidate}`;
}

/**
 * Response headers a browser may read from another origin. Without
 * Access-Control-Expose-Headers a cross-origin fetch() gets the body but sees
 * null for every one of these, and the CSV's provenance travels only in them.
 */
export const EXPOSED_HEADERS = [
    'Content-Disposition',
    'X-Data-Note',
    'X-Data-Served',
    'X-Data-Fetched-At',
    'X-Data-Estimated-Rows',
] as const;

/** The word the CSV's optional `kind` column uses for each character of a `kinds` string. */
export function kindLabel(code: string | undefined): 'observed' | 'estimated' | '' {
    if (code === PRICE_KIND_CODE.observed) return 'observed';
    if (code === PRICE_KIND_CODE.estimated) return 'estimated';
    return '';
}

// ── Which dates a backtest may cover ──────────────────────────────────────────

export interface DcaWindow {
    startDate: string;
    startTs: number;
    /** The end date as asked for (today when none was given), before it is cut back to today. */
    endDate: string;
    endTs: number;
    /** True when no startDate was sent and the default was used. */
    startDefaulted: boolean;
}

/**
 * Resolve the window of a /api/v1/dca request, or say why it cannot be run.
 *
 * `start` and `end` are what decodeParams accepted: real 'yyyy-MM-dd' dates,
 * the start already raised to the first priceable day.
 *
 * Every refusal here is the caller's to fix, so each one is a 400 that says
 * what to change, decided before anything is fetched: a 503 would invite a
 * retry that can never succeed.
 *
 * A future END is not refused. The schedule is cut off at today by the caller
 * (calculateDcaToDate), which reports the cut in the response.
 */
export function resolveDcaWindow(
    start: string | undefined,
    end: string | undefined,
    now: number,
): DcaWindow | { error: string } {
    const today = utcIsoToday(now);
    const endDate = end ?? today;
    const endTs = parseUtcDate(endDate);

    // Checked first, on the end date alone: with the default start clamped
    // below, a window that ends in 2009 would otherwise be reported as "start
    // after end", naming a startDate the caller never sent.
    if (endTs < EARLIEST_PRICE_TS) {
        return {
            error: `The requested window ends (${endDate}) before the price data begins (${EARLIEST_PRICE_DATE}). `
                + 'Pick an endDate on or after it.',
        };
    }

    const startDefaulted = start === undefined;
    const startDate = start ?? defaultStartFor(endTs);
    const startTs = parseUtcDate(startDate);

    // Before the order check: a caller who sent only a future startDate would
    // otherwise be told it is after an endDate they never sent (today's).
    if (!hasHappenedUtc(startTs, now)) {
        const which = startDefaulted
            ? `No 'startDate' was sent, so it defaulted to ${DEFAULT_YEARS_BACK} years before 'endDate': ${startDate}, which`
            : `'startDate' (${startDate})`;
        return {
            error: `${which} is after today (${today}, UTC). This endpoint reports history only, and no purchase `
                + 'in that window has happened yet. Use a startDate on or before today.',
        };
    }

    if (startTs > endTs) {
        return { error: `'startDate' (${startDate}) must be on or before 'endDate' (${endDate}).` };
    }

    return { startDate, startTs, endDate, endTs, startDefaulted };
}

// ── Provenance ────────────────────────────────────────────────────────────────

export interface ProvenanceContext {
    /** The provider that was asked for. Named in the note only when another one answered. */
    requested?: PriceProvider;
    /** True when the exchange could not be reached and an earlier copy of the series was served. */
    stale?: boolean;
    /** ms epoch the series was fetched from the exchange. */
    fetchedAt?: number;
    /** UTC day (ms) of the newest price the response uses. */
    lastRowTs?: number;
    /** Price rows in the response, and how many of them are straight-line estimates. */
    rows?: number;
    estimatedRows?: number;
}

const utcClock = (ts: number): string => new Date(ts).toISOString().slice(11, 16);

/**
 * The sentences a response opens its note with when it is not what was asked
 * for: another exchange's series, or an earlier copy. Empty when the requested
 * exchange answered with its current series.
 */
export function degradedNotices(
    served: PriceProvider,
    context: Pick<ProvenanceContext, 'requested' | 'stale' | 'fetchedAt'>,
): string[] {
    const notices: string[] = [];
    const fallbackNotice = context.requested ? priceFallbackNotice(context.requested, served) : null;
    if (fallbackNotice) notices.push(fallbackNotice);
    if (context.stale && context.fetchedAt !== undefined) notices.push(priceStaleNotice(served, context.fetchedAt));
    return notices;
}

/**
 * What the prices in a response are, stated in the payload itself so a
 * downloaded series can never be mistaken for something it is not. Describes
 * the provider that actually `served` the data, which during an outage is not
 * always the one that was asked for.
 *
 * Plain ASCII on purpose: the CSV endpoint sends this as an HTTP header.
 *
 * The wording follows the data, not the other way round (see
 * data/btcHistorical.ts and utils/priceSeries.ts): the bundled rows are
 * start-of-day values, the exchange rows are closes of their own date, and
 * anything in between two observations is a straight line.
 */
export function provenanceNote(served: PriceProvider, context: ProvenanceContext = {}): string {
    const { fetchedAt, lastRowTs, rows, estimatedRows } = context;
    // A response that is not what was asked for says so before anything else.
    const parts = degradedNotices(served, context);

    parts.push(
        `All prices are USD, one value per UTC day, labelled by UTC date. ${EARLIEST_PRICE_DATE} through `
        + `${SNAPSHOT_END_DATE} are a bundled copy of blockchain.info's market-price series, which blockchain.info `
        + 'describes as an average across major bitcoin exchanges. They are not exchange closes: each value is stamped '
        + '00:00 UTC and, where it can be checked against exchange candles, tracks the close of the day before its date. '
        + `So a value dated up to ${SNAPSHOT_END_DATE} sits about one day earlier in market time than the exchange values that follow.`,
    );

    parts.push(served === 'coinbase'
        ? `From ${FIRST_EXCHANGE_CLOSE_DATE} each value is the close of Coinbase's BTC-USD daily candle for that UTC date. `
            + 'A day Coinbase has no candle for is filled along a straight line between its neighbours and counted as an estimate.'
        : `From ${FIRST_EXCHANGE_CLOSE_DATE} the observed values are Kraken's weekly closes, one a week, each dated on the `
            + 'last day of its week (a Wednesday). Every other day is a straight-line estimate between the observed values '
            + 'on either side of it, not a price that traded, so moves inside a week are smoothed out. '
            + 'The week in progress has no close yet: values dated after the newest completed weekly close lie on a '
            + 'straight line to the latest trade, so they change each time the series is refetched and are redrawn once '
            + 'more when that week closes. Values dated up to that completed close do not change. '
            + 'For a close on every day use provider=coinbase.');

    if (fetchedAt === undefined) {
        parts.push('A price for the current UTC day is the latest trade when the series was fetched, not a close.');
    } else if (lastRowTs !== undefined && utcDayStart(lastRowTs) === utcDayStart(fetchedAt)) {
        parts.push(
            `The price for ${formatUtc(lastRowTs, 'isoDay')} is not a close: it is the latest `
            + `${PRICE_PROVIDER_LABELS[served].name} trade at ${utcClock(fetchedAt)} UTC, when this series was fetched.`,
        );
    }

    if (rows !== undefined && estimatedRows !== undefined) {
        parts.push(estimatedRows === 0
            ? `None of the ${rows} rows in this response is an estimate.`
            : `${estimatedRows} of the ${rows} rows in this response are straight-line estimates.`);
    }

    parts.push(
        'When the requested exchange cannot be reached the server answers with an earlier copy of its series or with '
        + "the other exchange's series, and this note then begins by saying so.",
    );

    return parts.join(' ');
}

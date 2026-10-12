import type { PriceProvider } from '@/data/priceSources';
import { utcDayIndex, utcDayStart } from '@/utils/dates';

/**
 * Which price a scenario page values its stack at.
 *
 * The page holds two candidates. One is an exchange's quote, which every
 * scenario page shares for up to a day. The other is the newest row of the
 * price history it has just loaded: when that row is dated the day the history
 * was fetched, it is the exchange's latest trade at that moment, not a close.
 * On a page rebuilt late in the quote's day the row is the newer of the two,
 * and the stack is valued at whichever is newer.
 *
 * It lives here, apart from the page component, so the choice can be tested:
 * it decides the headline figure on every scenario page.
 */

export interface Valuation {
    /** USD per bitcoin. */
    price: number;
    /** The moment that price is from (ms). For `lastRow`, the start of the row's UTC day. */
    asOf: number;
    from:
        /** An exchange's ticker. */
        | { kind: 'quote'; provider: PriceProvider }
        /** The history's newest row, taken as that exchange's latest trade when the history was fetched. */
        | { kind: 'latestTrade'; provider: PriceProvider }
        /** The history's newest row, because no exchange could quote. A day's price, with no time. */
        | { kind: 'lastRow' };
}

export interface ValuationInputs {
    /** The exchange quote, or null when neither exchange answered. */
    quote: { price: number; asOf: number; provider: PriceProvider } | null;
    /** The price history's newest row: [UTC ms, USD price]. */
    lastRow: readonly [number, number];
    /** True when the source reported that row; false for one filled in, or of unknown kind. */
    lastRowObserved: boolean;
    /** When the history was fetched from the exchange (ms). */
    historyFetchedAt: number;
    /** Whose history it is. */
    historyProvider: PriceProvider;
}

export function chooseValuation({
    quote,
    lastRow,
    lastRowObserved,
    historyFetchedAt,
    historyProvider,
}: ValuationInputs): Valuation {
    const [rowTs, rowPrice] = lastRow;
    if (!quote) return { price: rowPrice, asOf: utcDayStart(rowTs), from: { kind: 'lastRow' } };

    // Only a reported row dated the day of the fetch is a trade from the moment
    // of the fetch. A row from an earlier day is that day's close, and when it
    // closed is not known to the minute, so it never displaces a quote.
    const rowIsLatestTrade = lastRowObserved
        && rowPrice > 0
        && utcDayIndex(rowTs) === utcDayIndex(historyFetchedAt);
    if (rowIsLatestTrade && historyFetchedAt > quote.asOf) {
        return { price: rowPrice, asOf: historyFetchedAt, from: { kind: 'latestTrade', provider: historyProvider } };
    }
    return { price: quote.price, asOf: quote.asOf, from: { kind: 'quote', provider: quote.provider } };
}

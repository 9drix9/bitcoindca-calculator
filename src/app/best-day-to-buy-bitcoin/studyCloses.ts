import { DAY_MS, utcDayStart } from '@/utils/dates';
import { countPriceKinds, type PriceHistoryResult, type PricePair } from '@/utils/priceSeries';

/**
 * The price series the three study pages are computed on
 * (/best-day-to-buy-bitcoin, /lump-sum-vs-dca, /dca/start-date-heatmap).
 *
 * Those pages tell readers, and search engines through Dataset markup, that
 * their figures come from daily closing prices. Two things used to make that
 * untrue without anything on the page changing:
 *
 *  - When Coinbase could not be reached the price action handed back Kraken's
 *    series instead, which is one close a week with the six days in between
 *    drawn as a straight line. Only one of the three pages checked for it, and
 *    a heatmap cell that reads +1,857% on real closes once read +2,235%.
 *  - The last row of the series is today, and today has not closed. Its price
 *    is the latest trade, so the newest purchase in every study was priced at
 *    whatever the market was doing when the page happened to rebuild.
 *
 * This is the one place both are decided. It is pure, so it has tests; the
 * loader that calls the price action is in loadStudyCloses.ts.
 */

/**
 * What the rows before the first exchange close are, measured rather than
 * assumed. blockchain.info describes its series only as the "Average USD
 * market price across major bitcoin exchanges" and stamps each value 00:00
 * UTC. Compared on 2026-10-12 with Coinbase's daily candles over the 4,101
 * days where both exist, a value sits a median 0.045% from Coinbase's close of
 * the day BEFORE and 1.47% from its close of the same day. So a row dated
 * Monday is in effect Sunday's close, which the pages have to say wherever a
 * date or a weekday carries meaning.
 */
export const SNAPSHOT_VS_COINBASE_CLOSE = {
    daysCompared: 4101,
    previousDayPercent: 0.05,
    sameDayPercent: 1.5,
    measuredOn: '2026-10-12',
} as const;

export interface StudyCloses {
    /** One row per UTC day, oldest first, no gaps. Every row is a finished day. */
    closes: PricePair[];
    /** UTC midnight of the last finished day, and its price. */
    lastCloseTs: number;
    lastClose: number;
    /**
     * Rows Coinbase had no candle for, filled in along a straight line between
     * the days either side. 0 in normal running; a page says so when it is not.
     */
    estimatedDays: number;
    /** When Coinbase's response was fetched (ms). */
    fetchedAt: number;
}

/** Why a study cannot be published from this series. */
export interface StudyClosesUnavailable {
    reason: string;
}

/**
 * Cut a price-history result down to finished daily closes, or say why it
 * cannot be used.
 *
 * "Finished" is judged against when the series was fetched, not against the
 * clock: a copy read from a cache yesterday evening holds yesterday's price as
 * it stood that evening, which is not yesterday's close either. Every row
 * dated before the fetch day is final.
 */
export function finishedDailyCloses(history: PriceHistoryResult): StudyCloses | StudyClosesUnavailable {
    if (history.servedProvider !== 'coinbase') {
        return { reason: `Coinbase daily closes unavailable; the ${history.servedProvider} series was served instead` };
    }
    if (history.kinds.length !== history.data.length) {
        return { reason: 'the series does not say which of its rows are estimates' };
    }

    const fetchDay = utcDayStart(history.fetchedAt);
    let end = history.data.length;
    while (end > 0 && history.data[end - 1][0] >= fetchDay) end--;
    const closes = history.data.slice(0, end);
    if (closes.length === 0) return { reason: 'the series holds no finished days' };

    // The studies index this array by day, so a hole or a bad price would move
    // every later purchase onto the wrong date without any error.
    for (let i = 0; i < closes.length; i++) {
        const [ts, price] = closes[i];
        if (!(price > 0) || !Number.isFinite(price)) return { reason: `no usable price on row ${i}` };
        if (i > 0 && ts - closes[i - 1][0] !== DAY_MS) return { reason: `the series skips a day before row ${i}` };
    }

    const last = closes[closes.length - 1];
    return {
        closes,
        lastCloseTs: last[0],
        lastClose: last[1],
        estimatedDays: countPriceKinds(history.kinds.slice(0, end)).estimated,
        fetchedAt: history.fetchedAt,
    };
}

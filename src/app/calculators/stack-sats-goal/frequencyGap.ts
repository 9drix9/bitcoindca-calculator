/**
 * How far apart daily and weekly buying have ended, measured on this site's own
 * price data. One constant, so every page that quotes the figure quotes the
 * same one with the same date.
 *
 * Method: every five-year stretch of Coinbase's daily closes from 2015-07-20,
 * the same money spent once a day or once a week, the weekly plan started on
 * each of the first seven days of the stretch. Compared by bitcoin bought per
 * dollar, with no fee.
 *
 * Last run on 2026-10-12 against /api/v1/prices.csv, closes through
 * 2026-10-11: 2,276 stretches and 15,932 comparisons, the weekly plan between
 * 1.31% behind and 1.52% ahead of the daily one.
 *
 * `withinPercent` and `measuredOn` change together: measure again before
 * editing either. The claim covers daily against weekly only. Over the same
 * stretches monthly buying ended further from daily than this.
 */
export const DAILY_VS_WEEKLY_GAP = {
    withinPercent: 2,
    windowYears: 5,
    seriesFrom: 'July 2015',
    measuredOn: 'October 12, 2026',
} as const;

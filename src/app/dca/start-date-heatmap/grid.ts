import { computeCell, type HeatmapCell } from '@/utils/heatmap';
import { makeDayPriceLookup } from '@/utils/datasets';
import { DAY_MS, formatUtc } from '@/utils/dates';
import type { PricePair } from '@/utils/priceSeries';

/**
 * The grid behind /dca/start-date-heatmap and the facts its prose states.
 *
 * Kept out of page.tsx so they can be tested: a Next page file can only export
 * the page. Each cell is computed by computeCell (utils/heatmap); this module
 * decides which cells exist and reads the finished grid column by column, so
 * every sentence on the page that describes the grid is a field here and
 * cannot drift from the table beside it.
 */

/** Column headers: holding period in whole years. */
export const HOLD_YEARS = [1, 2, 3, 5, 7, 10] as const;
/** First row. 2011-01-01 is comfortably after the first day of price data (2010-08-18). */
export const FIRST_START_YEAR = 2011;

type DoneCell = Extract<HeatmapCell, { state: 'done' }>;

export interface ColumnSummary {
    holdYears: number;
    /** Completed windows in the column. */
    count: number;
    /**
     * How many windows of this length fit end to end between the first start
     * and the last completed end, sharing no months. Ten-year windows that
     * start a year apart share nine of their ten years, so six of them are
     * nearer to one look at the market than to six.
     */
    separate: number;
    best: number;
    bestStartYear: number;
    worst: number;
    worstStartYear: number;
    spread: number;
    /** Completed windows that ended worth less than was paid in. */
    negative: number;
}

export interface Grid {
    startYears: number[];
    cells: HeatmapCell[][];
    /** One entry per column that has at least one completed window, shortest hold first. */
    columns: ColumnSummary[];
    /** Hold lengths whose spread is wider than the next shorter column's. */
    spreadWidensAt: number[];
    /** The latest start year that holds a column's best figure. */
    latestBestStartYear: number;
    /** Price on the first row's start date. */
    firstStartPrice: number | null;
    /**
     * The latest date a window in the grid ends on (January 1 after the last
     * start year) and the price that day. No figure in the grid uses a later
     * price, so the stretch of history it covers ends here, not at the last
     * close.
     */
    lastEndTs: number;
    lastEndPrice: number | null;
    /** The last finished day of the price series. */
    lastCloseTs: number;
}

/** Latest start year whose SHORTEST window (1 year) has already completed. */
function lastStartYear(lastCloseTs: number): number {
    const shortest = HOLD_YEARS[0];
    let year = new Date(lastCloseTs).getUTCFullYear();
    while (year > FIRST_START_YEAR && Date.UTC(year + shortest, 0, 1) > lastCloseTs) year--;
    return year;
}

/** The end date of the newest windows a series finishing on `lastCloseTs` can hold. */
const lastEndFor = (lastCloseTs: number): number => Date.UTC(lastStartYear(lastCloseTs) + HOLD_YEARS[0], 0, 1);

/**
 * The day the page's wording last changed, 'yyyy-MM-dd'. Edit the page's copy
 * and this has to move with it; the figures date themselves.
 */
export const COPY_REVISED = '2026-10-12';

/**
 * The UTC day on which what the page publishes last changed, 'yyyy-MM-dd',
 * for a price series whose last finished day is `lastCloseTs`.
 *
 * Not the last close. Cells fill in once a year, on the day after a January 1
 * anniversary (the first day that end date has a close), and between two such
 * days no figure in the grid moves. Dating the page by the newest price would
 * call it modified on every one of those days. It takes only a date, so the
 * sitemap can state the same day without loading prices.
 */
export function gridLastModified(lastCloseTs: number): string {
    const filledOn = formatUtc(lastEndFor(lastCloseTs) + DAY_MS, 'isoDay');
    return filledOn > COPY_REVISED ? filledOn : COPY_REVISED;
}

function summariseColumn(startYears: number[], cells: HeatmapCell[][], col: number): ColumnSummary | null {
    const holdYears = HOLD_YEARS[col];
    const done = startYears
        .map((year, row) => ({ year, cell: cells[row][col] }))
        .filter((entry): entry is { year: number; cell: DoneCell } => entry.cell.state === 'done');
    if (done.length === 0) return null;

    let best = done[0];
    let worst = done[0];
    for (const entry of done) {
        if (entry.cell.annualized > best.cell.annualized) best = entry;
        if (entry.cell.annualized < worst.cell.annualized) worst = entry;
    }
    const spanYears = done[done.length - 1].year + holdYears - done[0].year;
    return {
        holdYears,
        count: done.length,
        separate: Math.floor(spanYears / holdYears),
        best: best.cell.annualized,
        bestStartYear: best.year,
        worst: worst.cell.annualized,
        worstStartYear: worst.year,
        spread: best.cell.annualized - worst.cell.annualized,
        // Judged on money, not on the annualised figure, though the two always
        // agree in sign: a window is below zero when it ended worth less than
        // went in.
        negative: done.filter((entry) => entry.cell.totalReturn < 0).length,
    };
}

/**
 * Build the grid from finished daily closes (see StudyCloses).
 *
 * A window counts as finished only once its end date has a close, so
 * `lastCloseTs` stands in for "now": a window ending on a day that has not
 * closed yet stays "in progress" instead of being valued at the day before.
 */
export function buildGrid(closes: PricePair[]): Grid | null {
    if (closes.length === 0) return null;
    const lastCloseTs = closes[closes.length - 1][0];
    const lastEndTs = lastEndFor(lastCloseTs);
    const priceAt = makeDayPriceLookup(closes);

    const startYears: number[] = [];
    for (let year = FIRST_START_YEAR; year <= lastStartYear(lastCloseTs); year++) startYears.push(year);

    // ONE price array for the whole grid; every cell reads the same closes.
    const cells = startYears.map((year) =>
        HOLD_YEARS.map((hold) => computeCell(year, hold, closes, priceAt, lastCloseTs)),
    );

    const columns = HOLD_YEARS.map((_, col) => summariseColumn(startYears, cells, col)).filter(
        (column): column is ColumnSummary => column !== null,
    );
    if (columns.length === 0) return null;

    return {
        startYears,
        cells,
        columns,
        spreadWidensAt: columns.filter((column, i) => i > 0 && column.spread > columns[i - 1].spread).map((c) => c.holdYears),
        latestBestStartYear: Math.max(...columns.map((column) => column.bestStartYear)),
        firstStartPrice: priceAt(Date.UTC(FIRST_START_YEAR, 0, 1)),
        lastEndTs,
        lastEndPrice: priceAt(lastEndTs),
        lastCloseTs,
    };
}

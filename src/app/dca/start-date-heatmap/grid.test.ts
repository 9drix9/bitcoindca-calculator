import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/utils/dates';
import { COPY_REVISED, FIRST_START_YEAR, HOLD_YEARS, buildGrid, gridLastModified } from './grid';

const FIRST_DAY = Date.UTC(2010, 7, 18);

/** One price per consecutive UTC day from the first day of the real series to `lastTs`. */
const daily = (lastTs: number, price: (ts: number) => number): [number, number][] => {
    const rows: [number, number][] = [];
    for (let ts = FIRST_DAY; ts <= lastTs; ts += DAY_MS) rows.push([ts, price(ts)]);
    return rows;
};

const LAST_CLOSE = Date.UTC(2026, 9, 11);
const flat = daily(LAST_CLOSE, () => 100);
const yearOf = (ts: number): number => new Date(ts).getUTCFullYear();

describe('buildGrid', () => {
    it('has a row for every start year whose one-year window has finished', () => {
        const grid = buildGrid(flat)!;
        expect(grid.startYears[0]).toBe(FIRST_START_YEAR);
        expect(grid.startYears[grid.startYears.length - 1]).toBe(2025);
        expect(grid.cells).toHaveLength(15);
        for (const row of grid.cells) expect(row).toHaveLength(HOLD_YEARS.length);
        expect(grid.lastCloseTs).toBe(LAST_CLOSE);
        expect(grid.firstStartPrice).toBe(100);
    });

    it('ends the stretch it covers on its newest window end, not on the last close', () => {
        // The price is the year it was quoted in, so each date reads differently.
        const grid = buildGrid(daily(LAST_CLOSE, (ts) => yearOf(ts) + (ts === LAST_CLOSE ? 0.5 : 0)))!;
        expect(grid.lastCloseTs).toBe(LAST_CLOSE);
        // The 2025 one-year window is the newest to finish, on Jan 1, 2026.
        expect(grid.lastEndTs).toBe(Date.UTC(2026, 0, 1));
        expect(grid.lastEndPrice).toBe(2026);
        expect(grid.firstStartPrice).toBe(2011);

        // A year-end close moves nothing; the next day's does.
        expect(buildGrid(daily(Date.UTC(2026, 11, 31), yearOf))!.lastEndTs).toBe(Date.UTC(2026, 0, 1));
        expect(buildGrid(daily(Date.UTC(2027, 0, 1), yearOf))!.lastEndTs).toBe(Date.UTC(2027, 0, 1));
    });

    it('counts completed windows per column, and how many of them share no years', () => {
        const grid = buildGrid(flat)!;
        expect(grid.columns.map((c) => [c.holdYears, c.count, c.separate])).toEqual([
            [1, 15, 15], // 2011 to 2025: one-year windows do not overlap
            [2, 14, 7],
            [3, 13, 5],
            [5, 11, 3],
            [7, 9, 2],
            [10, 6, 1], // six ten-year windows, one ten-year stretch
        ]);
        // 2017 + 10 years ends in 2027: still running.
        expect(grid.cells[2017 - FIRST_START_YEAR][HOLD_YEARS.length - 1]).toEqual({ state: 'in-progress' });
        expect(grid.cells[2016 - FIRST_START_YEAR][HOLD_YEARS.length - 1].state).toBe('done');
    });

    it('reports a flat price as 0% everywhere, with nothing below zero and no spread', () => {
        const grid = buildGrid(flat)!;
        for (const column of grid.columns) {
            expect(Math.abs(column.best)).toBeLessThan(1e-6);
            expect(Math.abs(column.worst)).toBeLessThan(1e-6);
            expect(column.negative).toBe(0);
        }
    });

    it('waits for the end date to have a close before filling a window in', () => {
        // Through Dec 31, 2025 the window that began in January 2025 has no end price yet.
        const beforeNewYear = buildGrid(daily(Date.UTC(2025, 11, 31), () => 100))!;
        expect(beforeNewYear.startYears[beforeNewYear.startYears.length - 1]).toBe(2024);
        expect(beforeNewYear.cells[2016 - FIRST_START_YEAR][HOLD_YEARS.length - 1]).toEqual({ state: 'in-progress' });

        // Once Jan 1, 2026 has closed, it and the 2016 ten-year window are complete.
        const afterNewYear = buildGrid(daily(Date.UTC(2026, 0, 1), () => 100))!;
        expect(afterNewYear.startYears[afterNewYear.startYears.length - 1]).toBe(2025);
        expect(afterNewYear.cells[2025 - FIRST_START_YEAR][0].state).toBe('done');
        expect(afterNewYear.cells[2016 - FIRST_START_YEAR][HOLD_YEARS.length - 1].state).toBe('done');
    });

    it('reads each column for its best and worst start year, its spread and its losses', () => {
        // $100 throughout, except 2014, when it is $1,000. Buying through 2014
        // and being valued after it is the only way to lose; being valued on
        // Jan 1, 2014 or inside it is the only way to gain.
        const grid = buildGrid(daily(LAST_CLOSE, (ts) => (yearOf(ts) === 2014 ? 1000 : 100)))!;
        const oneYear = grid.columns[0];
        // 2013: twelve buys at $100 valued at $1,000 on Jan 1, 2014. 2014: twelve at $1,000 valued at $100.
        expect(oneYear.bestStartYear).toBe(2013);
        expect(oneYear.worstStartYear).toBe(2014);
        expect(oneYear.negative).toBe(1);
        expect(oneYear.spread).toBeCloseTo(oneYear.best - oneYear.worst, 9);

        const done = (year: number, col: number) => {
            const cell = grid.cells[year - FIRST_START_YEAR][col];
            if (cell.state !== 'done') throw new Error(`expected ${year} column ${col} to be complete`);
            return cell;
        };
        expect(done(2013, 0).totalReturn).toBeCloseTo(900, 6);
        expect(done(2014, 0).totalReturn).toBeCloseTo(-90, 6);
        // Negative is judged on money: the 2013 two-year window paid $1,200 at $100
        // and $1,200 at $1,000 for 13.2 BTC worth $1,320 at the end.
        expect(done(2013, 1).totalReturn).toBeCloseTo((1320 / 2400 - 1) * 100, 6);
        expect(grid.columns[1].negative).toBe(2); // the 2013 and 2014 two-year windows

        expect(grid.latestBestStartYear).toBe(Math.max(...grid.columns.map((c) => c.bestStartYear)));
        expect(grid.spreadWidensAt).toEqual(
            grid.columns.filter((c, i) => i > 0 && c.spread > grid.columns[i - 1].spread).map((c) => c.holdYears),
        );
    });

    it('names a longer hold whose spread is wider than the one before', () => {
        // The shape of the real grid in miniature: coins bought for a cent
        // through 2011, $100 afterwards, and one day at $10,000 on Jan 1, 2018.
        // The 2011 seven-year window is the only one that holds the cent coins
        // AND is valued on the spike, so the 7-year column out-spreads the
        // 5-year one. "The range narrows the longer you hold" is not a law.
        const spike = Date.UTC(2018, 0, 1);
        const grid = buildGrid(
            daily(LAST_CLOSE, (ts) => (ts === spike ? 10_000 : yearOf(ts) <= 2011 ? 0.01 : 100)),
        )!;
        const byHold = new Map(grid.columns.map((c) => [c.holdYears, c]));
        expect(byHold.get(7)!.bestStartYear).toBe(2011);
        expect(byHold.get(7)!.spread).toBeGreaterThan(byHold.get(5)!.spread);
        expect(grid.spreadWidensAt).toEqual([7]);
        expect(grid.firstStartPrice).toBe(0.01);
        expect(grid.latestBestStartYear).toBe(2011);
    });

    it('returns null when there are no closes or no window has finished', () => {
        expect(buildGrid([])).toBeNull();
        expect(buildGrid(daily(Date.UTC(2011, 5, 1), () => 100))).toBeNull();
    });
});

describe('gridLastModified', () => {
    it('is the day the newest windows filled in, once that is later than the wording', () => {
        // Jan 1, 2027 closes; the windows that end on it are priced the day after.
        expect(gridLastModified(Date.UTC(2027, 0, 1))).toBe('2027-01-02');
        // Every later close that year adds nothing to the grid.
        expect(gridLastModified(Date.UTC(2027, 0, 2))).toBe('2027-01-02');
        expect(gridLastModified(Date.UTC(2027, 11, 31))).toBe('2027-01-02');
        expect(gridLastModified(Date.UTC(2028, 0, 1))).toBe('2028-01-02');
    });

    it('is the day the wording changed while that is the later of the two', () => {
        expect(COPY_REVISED > '2026-01-02').toBe(true);
        expect(gridLastModified(LAST_CLOSE)).toBe(COPY_REVISED);
        expect(gridLastModified(Date.UTC(2026, 11, 31))).toBe(COPY_REVISED);
    });

    it('agrees with the grid about when the newest windows ended', () => {
        for (const lastTs of [Date.UTC(2027, 0, 1), Date.UTC(2027, 5, 15), Date.UTC(2028, 0, 1)]) {
            const grid = buildGrid(daily(lastTs, () => 100))!;
            expect(gridLastModified(lastTs)).toBe(new Date(grid.lastEndTs + DAY_MS).toISOString().slice(0, 10));
        }
    });
});

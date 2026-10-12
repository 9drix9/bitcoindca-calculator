import { describe, expect, it } from 'vitest';
import {
    COINBASE_CHUNK_DAYS,
    MAX_SERIES_LAG_DAYS,
    PriceCoverageError,
    assertCoinbaseChunkCovered,
    assertProviderCoverage,
    buildDailySeries,
    coinbaseChunkPlan,
    countPriceKinds,
    krakenWeeklyAnchors,
    mergeWithSnapshot,
    parseCoinbaseCandles,
    sliceDailySeries,
    type CoinbaseChunk,
    type PricePair,
} from './priceSeries';
import { PRICE_KIND_CODE, withPriceKinds } from './dca';
import { DAY_MS } from './dates';

const HOUR_MS = 3_600_000;
const WEEK_S = 604_800;
const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const iso = (ts: number) => new Date(ts).toISOString();

// ── Kraken weekly anchors ─────────────────────────────────────────────────────

describe('krakenWeeklyAnchors', () => {
    // [open s, open, high, low, close, vwap, volume, count], prices as strings like Kraken sends them.
    const candle = (openS: number, close: number | string): unknown[] => [openS, '0', '0', '0', String(close), '0', '0', 1];
    const farFuture = day(2030, 1, 1);

    it('stamps a weekly close on the Wednesday it belongs to, not the Thursday after', () => {
        // The week that opened Thursday 2020-03-12 closed with the last trade
        // before Thursday 2020-03-19 00:00, i.e. Wednesday the 18th's close.
        const opened = 1583971200;
        expect(iso(opened * 1000)).toBe('2020-03-12T00:00:00.000Z');
        const [[ts, close]] = krakenWeeklyAnchors([candle(opened, '5415.1')], farFuture);
        expect(iso(ts)).toBe('2020-03-18T00:00:00.000Z');
        expect(close).toBe(5415.1);
    });

    it('clamps the still-open final candle to now, so it is never dated in the future', () => {
        const thursday = day(2026, 10, 8) / 1000;
        const now = day(2026, 10, 10) + 14 * HOUR_MS; // Saturday afternoon
        const anchors = krakenWeeklyAnchors([candle(thursday - WEEK_S, 80_000), candle(thursday, 83_000)], now);
        expect(iso(anchors[0][0])).toBe('2026-10-07T00:00:00.000Z'); // closed week: its Wednesday
        expect(anchors[1]).toEqual([now, 83_000]);
    });

    it('leaves the open candle on its Wednesday once that day has begun', () => {
        const thursday = day(2026, 10, 8) / 1000;
        const now = day(2026, 10, 14) + 9 * HOUR_MS; // the following Wednesday
        const [[ts]] = krakenWeeklyAnchors([candle(thursday, 83_000)], now);
        expect(iso(ts)).toBe('2026-10-14T00:00:00.000Z');
    });

    it('sorts by time and drops rows it cannot read', () => {
        const a = day(2024, 1, 4) / 1000;
        const anchors = krakenWeeklyAnchors(
            [candle(a + WEEK_S, 2), 'junk', null, candle(a, 1), candle(a + 2 * WEEK_S, 'n/a'), candle(a + 3 * WEEK_S, 0), [NaN, 0, 0, 0, '5']],
            farFuture,
        );
        expect(anchors.map(([, p]) => p)).toEqual([1, 2]);
        expect(anchors[0][0]).toBeLessThan(anchors[1][0]);
    });

    it('returns nothing for a payload that is not a list', () => {
        expect(krakenWeeklyAnchors(undefined, farFuture)).toEqual([]);
        expect(krakenWeeklyAnchors({ error: ['EGeneral'] }, farFuture)).toEqual([]);
    });
});

// ── Daily series and its markers ──────────────────────────────────────────────

describe('buildDailySeries', () => {
    const start = day(2024, 1, 3);

    it('marks every row: observed where a price was given, estimated where it was filled in', () => {
        // Weekly anchors, the shape of Kraken's series.
        const weekly: PricePair[] = [[start, 100], [start + 7 * DAY_MS, 170], [start + 14 * DAY_MS, 100]];
        const { data, kinds } = buildDailySeries(weekly);

        expect(data).toHaveLength(15);
        expect(kinds).toHaveLength(data.length);
        expect(kinds).toBe('oeeeeeeoeeeeeeo');
        // Every filled day sits on the straight line between its neighbours.
        expect(data[1][1]).toBeCloseTo(110, 10);
        expect(data[6][1]).toBeCloseTo(160, 10);
        expect(data[8][1]).toBeCloseTo(160, 10);
        for (let i = 0; i < data.length; i++) {
            const anchor = weekly.find(([ts]) => ts === data[i][0]);
            expect(kinds[i]).toBe(anchor ? 'o' : 'e');
            if (anchor) expect(data[i][1]).toBe(anchor[1]);
        }
    });

    it('has one row per UTC day, at midnight, with no gaps', () => {
        const { data } = buildDailySeries([[start + 5 * HOUR_MS, 1], [start + 3 * DAY_MS + 23 * HOUR_MS, 4]]);
        expect(data.map(([ts]) => ts)).toEqual([start, start + DAY_MS, start + 2 * DAY_MS, start + 3 * DAY_MS]);
    });

    it('keeps the later of two prices on the same day', () => {
        // Kraken's open week: a closed anchor days ago, then the live price
        // stamped a few hours into today. Today must carry the live price.
        const today = start + 4 * DAY_MS;
        const { data, kinds } = buildDailySeries([[start, 100], [today, 140], [today + 16 * HOUR_MS, 150]]);
        expect(data[data.length - 1]).toEqual([today, 150]);
        expect(data.filter(([ts]) => ts === today)).toHaveLength(1);
        expect(kinds[kinds.length - 1]).toBe('o');
    });

    it('marks a fully observed daily series as all observed', () => {
        const daily: PricePair[] = Array.from({ length: 30 }, (_, i) => [start + i * DAY_MS, 100 + i]);
        const { data, kinds } = buildDailySeries(daily);
        expect(data).toEqual(daily);
        expect(kinds).toBe('o'.repeat(30));
    });

    it('drops unusable and out-of-order points instead of charting them', () => {
        const { data } = buildDailySeries([[start, 100], [start + DAY_MS, 0], [start + DAY_MS, NaN], [start - DAY_MS, 50], [start + 2 * DAY_MS, 120]]);
        expect(data).toEqual([[start, 100], [start + DAY_MS, 110], [start + 2 * DAY_MS, 120]]);
    });

    it('returns an empty series for no input', () => {
        expect(buildDailySeries([])).toEqual({ data: [], kinds: '' });
    });

    it('hands the engine markers it can read', () => {
        const { data, kinds } = buildDailySeries([[start, 100], [start + 7 * DAY_MS, 170]]);
        const marked = withPriceKinds(data, kinds);
        expect(marked[0]).toEqual([start, 100, 'observed']);
        expect(marked[3][2]).toBe('estimated');
        expect(countPriceKinds(kinds)).toEqual({ observed: 2, estimated: 6 });
        // Every row came back marked: none of the letters is one the engine cannot read.
        expect(marked.map((point) => point[2])).toEqual([
            'observed', 'estimated', 'estimated', 'estimated', 'estimated', 'estimated', 'estimated', 'observed',
        ]);
    });
});

describe('countPriceKinds', () => {
    it('counts a row with no marker as neither observed nor estimated', () => {
        // '-' is what a caller writes when the markers it was handed do not
        // line up with its rows. Those rows are unknown, not observed.
        expect(countPriceKinds(`o${PRICE_KIND_CODE.unknown}oe${PRICE_KIND_CODE.unknown}`)).toEqual({ observed: 2, estimated: 1 });
        expect(countPriceKinds(PRICE_KIND_CODE.unknown.repeat(4))).toEqual({ observed: 0, estimated: 0 });
        expect(countPriceKinds('')).toEqual({ observed: 0, estimated: 0 });
    });
});

describe('mergeWithSnapshot', () => {
    const snapshot: PricePair[] = [[day(2015, 7, 17), 280], [day(2015, 7, 18), 275], [day(2015, 7, 19), 276.74]];

    it('lets the snapshot win for its whole span and appends only later provider points', () => {
        const provider: PricePair[] = [[day(2015, 7, 15), 999], [day(2015, 7, 19), 999], [day(2015, 7, 20), 280], [day(2015, 7, 21), 277]];
        expect(mergeWithSnapshot(snapshot, provider)).toEqual([...snapshot, [day(2015, 7, 20), 280], [day(2015, 7, 21), 277]]);
    });

    it('does not let a provider point later on the snapshot’s last day replace it', () => {
        const merged = mergeWithSnapshot(snapshot, [[day(2015, 7, 19) + 12 * HOUR_MS, 999]]);
        expect(merged).toEqual(snapshot);
    });
});

describe('sliceDailySeries', () => {
    const start = day(2024, 1, 1);
    const series = buildDailySeries([[start, 100], [start + 40 * DAY_MS, 140]]);

    it('keeps the lead-in before `from`, stops at `to`, and slices the markers with the rows', () => {
        const window = sliceDailySeries(series, start + 30 * DAY_MS, start + 35 * DAY_MS, 14);
        expect(window.data[0][0]).toBe(start + 16 * DAY_MS);
        expect(window.data[window.data.length - 1][0]).toBe(start + 35 * DAY_MS);
        expect(window.kinds).toHaveLength(window.data.length);
        expect(window.kinds).toBe('e'.repeat(20));
    });

    it('is empty, not the nearest rows, for a window past the end of the series', () => {
        expect(sliceDailySeries(series, start + 90 * DAY_MS, start + 120 * DAY_MS, 14)).toEqual({ data: [], kinds: '' });
    });
});

// ── Coinbase chunks ───────────────────────────────────────────────────────────

describe('coinbaseChunkPlan', () => {
    const first = day(2015, 7, 20);
    const now = day(2026, 10, 12) + 4 * HOUR_MS + 10 * 60_000;
    const plan = coinbaseChunkPlan(first, now, HOUR_MS);

    it('covers the first day to today with no overlap and no hole', () => {
        expect(plan[0].startTs).toBe(first);
        for (let i = 1; i < plan.length; i++) expect(plan[i].startTs).toBe(plan[i - 1].lastDayTs + DAY_MS);
        expect(plan[plan.length - 1].lastDayTs).toBeGreaterThanOrEqual(day(2026, 10, 12));
        expect(plan).toHaveLength(14);
    });

    it('never asks for more candles than the endpoint returns', () => {
        for (const chunk of plan) {
            const requested = Math.floor((chunk.endTs - chunk.startTs) / DAY_MS) + 1;
            expect(requested).toBeLessThanOrEqual(300);
        }
    });

    it('seals every finished chunk and leaves the one holding today open', () => {
        expect(plan.slice(0, -1).every((c) => c.sealed)).toBe(true);
        const open = plan[plan.length - 1];
        expect(open.sealed).toBe(false);
        expect(open.endTs).toBe(day(2026, 10, 12) + 5 * HOUR_MS); // rounded up to the hour
        expect(open.endTs).toBeGreaterThanOrEqual(now);
    });

    it('keeps sealed chunks byte-identical from one day to the next, so their cached responses are reused', () => {
        const tomorrow = coinbaseChunkPlan(first, now + DAY_MS, HOUR_MS);
        const nextYear = coinbaseChunkPlan(first, now + 365 * DAY_MS, HOUR_MS);
        const sealed = plan.filter((c) => c.sealed);
        expect(tomorrow.slice(0, sealed.length)).toEqual(sealed);
        expect(nextYear.slice(0, sealed.length)).toEqual(sealed);
    });

    it('keeps a chunk open for a day after its last day, then seals it', () => {
        const lastDay = first + (COINBASE_CHUNK_DAYS - 1) * DAY_MS;
        const onLastDay = coinbaseChunkPlan(first, lastDay + HOUR_MS, HOUR_MS);
        expect(onLastDay).toHaveLength(1);
        expect(onLastDay[0].sealed).toBe(false);

        // The day after: still open (yesterday's close may be settling), and a
        // new chunk has begun. Even now the request is within 300 candles.
        const dayAfter = coinbaseChunkPlan(first, lastDay + DAY_MS + HOUR_MS, DAY_MS);
        expect(dayAfter.map((c) => c.sealed)).toEqual([false, false]);
        expect(Math.floor((dayAfter[0].endTs - dayAfter[0].startTs) / DAY_MS)).toBeLessThanOrEqual(300);

        const twoDaysAfter = coinbaseChunkPlan(first, lastDay + 2 * DAY_MS + HOUR_MS, HOUR_MS);
        expect(twoDaysAfter.map((c) => c.sealed)).toEqual([true, false]);
        expect(twoDaysAfter[0].endTs).toBe(lastDay);
    });

    it('rounds the open end to the caller’s cache lifetime', () => {
        const daily = coinbaseChunkPlan(first, now, DAY_MS);
        expect(daily[daily.length - 1].endTs).toBe(day(2026, 10, 13));
    });
});

describe('parseCoinbaseCandles', () => {
    const chunk: CoinbaseChunk = { startTs: day(2020, 1, 1), lastDayTs: day(2020, 1, 10), endTs: day(2020, 1, 10), sealed: true };
    // Coinbase: [time s, low, high, open, close, volume], newest first.
    const candle = (ts: number, close: number): number[] => [ts / 1000, 0, 0, 0, close, 1];

    it('reads the close, sorts ascending and keeps only the chunk’s own days', () => {
        const json = [
            candle(day(2020, 1, 11), 999), // belongs to the next chunk
            candle(day(2020, 1, 3), 103),
            candle(day(2020, 1, 2), 102),
            candle(day(2019, 12, 31), 999),
        ];
        expect(parseCoinbaseCandles(json, chunk)).toEqual([[day(2020, 1, 2), 102], [day(2020, 1, 3), 103]]);
    });

    it('skips rows that are not candles or have no usable close', () => {
        const json = [{ message: 'error' }, null, candle(day(2020, 1, 2), 0), candle(day(2020, 1, 3), NaN), candle(day(2020, 1, 4), 104)];
        expect(parseCoinbaseCandles(json, chunk)).toEqual([[day(2020, 1, 4), 104]]);
    });

    it('rejects a body that is not a list of candles', () => {
        expect(() => parseCoinbaseCandles({ message: 'rate limited' }, chunk)).toThrow(PriceCoverageError);
    });
});

// ── Coverage ──────────────────────────────────────────────────────────────────

describe('assertCoinbaseChunkCovered', () => {
    const startTs = day(2020, 1, 1);
    const lastDayTs = startTs + (COINBASE_CHUNK_DAYS - 1) * DAY_MS;
    const sealed: CoinbaseChunk = { startTs, lastDayTs, endTs: lastDayTs, sealed: true };
    const now = day(2026, 10, 12);
    const full: PricePair[] = Array.from({ length: COINBASE_CHUNK_DAYS }, (_, i) => [startTs + i * DAY_MS, 100 + i]);

    it('accepts a complete chunk', () => {
        expect(() => assertCoinbaseChunkCovered(full, sealed, now)).not.toThrow();
    });

    it('rejects an empty response for a range that has data', () => {
        // The old guard only fired when EVERY chunk was empty, so one empty
        // chunk became a 299-day straight line.
        expect(() => assertCoinbaseChunkCovered([], sealed, now)).toThrow(/came back empty/);
    });

    it('rejects a response cut short at either end or holed in the middle', () => {
        expect(() => assertCoinbaseChunkCovered(full.slice(0, 50), sealed, now)).toThrow(/stops \d+ days early/);
        expect(() => assertCoinbaseChunkCovered(full.slice(120), sealed, now)).toThrow(/starts 120 days late/);
        expect(() => assertCoinbaseChunkCovered([...full.slice(0, 100), ...full.slice(140)], sealed, now)).toThrow(/41-day hole/);
    });

    it('tolerates a few missing days, which are filled and marked estimated', () => {
        const missingThree = [...full.slice(0, 100), ...full.slice(103)];
        expect(() => assertCoinbaseChunkCovered(missingThree, sealed, now)).not.toThrow();
        expect(() => assertCoinbaseChunkCovered(full.slice(2, -2), sealed, now)).not.toThrow();
    });

    it('allows an open chunk to be empty only in its first day or so', () => {
        const today = day(2026, 10, 12);
        const justBegun: CoinbaseChunk = { startTs: today, lastDayTs: today + 298 * DAY_MS, endTs: today + DAY_MS, sealed: false };
        expect(() => assertCoinbaseChunkCovered([], justBegun, today + 30_000)).not.toThrow();
        const begunLastWeek: CoinbaseChunk = { ...justBegun, startTs: today - 7 * DAY_MS };
        expect(() => assertCoinbaseChunkCovered([], begunLastWeek, today + 30_000)).toThrow(/came back empty/);
    });

    it('does not expect an open chunk to reach its own end', () => {
        const open: CoinbaseChunk = { ...sealed, sealed: false };
        expect(() => assertCoinbaseChunkCovered(full.slice(0, 50), open, startTs + 50 * DAY_MS)).not.toThrow();
    });
});

describe('assertProviderCoverage', () => {
    const snapshotEnd = day(2015, 7, 19);
    const now = day(2026, 10, 12) + 4 * HOUR_MS;
    const weekly = (from: number, to: number): PricePair[] => {
        const points: PricePair[] = [];
        for (let ts = from; ts <= to; ts += 7 * DAY_MS) points.push([ts, 1000]);
        return points;
    };
    const healthyKraken = [...weekly(day(2015, 7, 22), day(2026, 10, 7)), [now, 83_000] as PricePair];

    it('accepts weekly points from the snapshot to today', () => {
        expect(() => assertProviderCoverage('kraken', healthyKraken, snapshotEnd, now)).not.toThrow();
    });

    it('rejects a response truncated to two candles', () => {
        // Unchecked, this drew one straight line from $277 in 2015 to today's price.
        const truncated: PricePair[] = [[day(2015, 7, 22), 277], [now, 83_000]];
        expect(() => assertProviderCoverage('kraken', truncated, snapshotEnd, now)).toThrow(/\d{4}-day hole/);
    });

    it('rejects a history that begins long after the bundled data ends', () => {
        const lateStart = [...weekly(day(2024, 11, 20), day(2026, 10, 7)), [now, 83_000] as PricePair];
        expect(() => assertProviderCoverage('kraken', lateStart, snapshotEnd, now)).toThrow(/days after the bundled data ends/);
    });

    it('rejects a history that stops days ago', () => {
        const stale = weekly(day(2015, 7, 22), day(2026, 9, 30));
        expect(() => assertProviderCoverage('kraken', stale, snapshotEnd, now)).toThrow(/days ago/);
        const fresh = [...stale, [now - MAX_SERIES_LAG_DAYS * DAY_MS, 83_000] as PricePair];
        // 12 days between the last weekly point and the fresh one: within Kraken's allowance.
        expect(() => assertProviderCoverage('kraken', fresh, snapshotEnd, now)).not.toThrow();
    });

    it('holds daily candles to a tighter gap than weekly ones', () => {
        const daily: PricePair[] = [];
        for (let ts = day(2015, 7, 20); ts <= day(2026, 10, 12); ts += DAY_MS) daily.push([ts, 1000]);
        expect(() => assertProviderCoverage('coinbase', daily, snapshotEnd, now)).not.toThrow();
        const holed = daily.filter(([ts]) => ts < day(2019, 5, 24) || ts > day(2019, 6, 2));
        expect(() => assertProviderCoverage('coinbase', holed, snapshotEnd, now)).toThrow(/11-day hole after 2019-05-23/);
        // The same hole would pass at Kraken's weekly spacing.
        expect(() => assertProviderCoverage('kraken', holed, snapshotEnd, now)).not.toThrow();
    });

    it('rejects an empty history', () => {
        expect(() => assertProviderCoverage('coinbase', [], snapshotEnd, now)).toThrow(/no usable candles/);
    });
});

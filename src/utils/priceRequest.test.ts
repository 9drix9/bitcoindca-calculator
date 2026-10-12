import { describe, expect, it } from 'vitest';
import { answersPriceRequest, samePriceRequest, selectResultView, type PriceRequest } from './priceRequest';
import { calculateAssetDca, calculateDca, calculateLumpSum, seriesThroughDay, withPriceKinds } from './dca';
import { DAY_MS, parseUtcDate } from './dates';

const request = (start: string, end: string, provider: PriceRequest['provider'] = 'coinbase'): PriceRequest =>
    ({ provider, start, end });

// ── What a loaded series can be reused for ────────────────────────────────────

describe('answersPriceRequest', () => {
    const loaded = request('2021-01-01', '2024-01-01');

    it('answers the request it was loaded for', () => {
        expect(answersPriceRequest(loaded, request('2021-01-01', '2024-01-01'))).toBe(true);
    });

    it('answers a later start with the same end and exchange', () => {
        expect(answersPriceRequest(loaded, request('2022-06-15', '2024-01-01'))).toBe(true);
    });

    it('does not answer an earlier start: those purchases have no rows', () => {
        expect(answersPriceRequest(loaded, request('2020-12-31', '2024-01-01'))).toBe(false);
    });

    it('does not answer a different end, earlier or later', () => {
        expect(answersPriceRequest(loaded, request('2021-01-01', '2023-06-01'))).toBe(false);
        expect(answersPriceRequest(loaded, request('2021-01-01', '2024-06-01'))).toBe(false);
    });

    it('does not answer another exchange', () => {
        expect(answersPriceRequest(loaded, request('2021-01-01', '2024-01-01', 'kraken'))).toBe(false);
    });

    it('does not answer anything when nothing is loaded', () => {
        expect(answersPriceRequest(null, request('2021-01-01', '2024-01-01'))).toBe(false);
    });

    it('compares starts as dates, so a five-digit year is never "later"', () => {
        // As text '20300-01-01' sorts after '2021-01-01'. It is not a date.
        expect(answersPriceRequest(loaded, request('20300-01-01', '2024-01-01'))).toBe(false);
        expect(answersPriceRequest(loaded, request('', '2024-01-01'))).toBe(false);
    });
});

describe('samePriceRequest', () => {
    it('compares by value', () => {
        expect(samePriceRequest(request('2021-01-01', '2024-01-01'), request('2021-01-01', '2024-01-01'))).toBe(true);
        expect(samePriceRequest(request('2021-01-01', '2024-01-01'), request('2021-01-02', '2024-01-01'))).toBe(false);
        expect(samePriceRequest(request('2021-01-01', '2024-01-01'), request('2021-01-01', '2024-01-01', 'kraken'))).toBe(false);
        expect(samePriceRequest(null, null)).toBe(true);
        expect(samePriceRequest(null, request('2021-01-01', '2024-01-01'))).toBe(false);
    });
});

// ── The rule answersPriceRequest rests on ─────────────────────────────────────
// The server sends a series from 14 days before the start to the day after the
// end, one row per UTC day. These build series that way and run the engine on
// them, so the reuse rule is tied to what the engine actually computes.

/** A daily series shaped like the server's reply for a window. */
const fetched = (startDate: string, endDate: string): [number, number][] => {
    const from = parseUtcDate(startDate) - 14 * DAY_MS;
    const to = parseUtcDate(endDate) + DAY_MS;
    const rows: [number, number][] = [];
    for (let ts = from; ts <= to; ts += DAY_MS) {
        const day = Math.round(ts / DAY_MS);
        // Rises, with a wobble and a deep dip, so drawdown and best buy are not trivial.
        rows.push([ts, 20_000 + (day % 1000) * 37 + 4_000 * Math.sin(day / 23)]);
    }
    return rows;
};

const plan = (startDate: string, endDate: string) => ({
    amount: 100,
    frequency: 'weekly' as const,
    startDate: new Date(parseUtcDate(startDate)),
    endDate: new Date(parseUtcDate(endDate)),
    feePercentage: 0.5,
    priceMode: 'api' as const,
    manualPrice: 0,
});

describe('reusing a loaded series (the engine side of answersPriceRequest)', () => {
    const asOf = parseUtcDate('2024-03-01');
    const spot = 61_234.56;

    it('a later start computes the same from the wider series as from its own', () => {
        const wide = fetched('2021-01-01', '2024-01-01');
        const own = fetched('2022-06-15', '2024-01-01');
        const later = plan('2022-06-15', '2024-01-01');

        // With a live price, and without one (valued at the series' last row).
        expect(calculateDca(later, wide, spot, asOf)).toEqual(calculateDca(later, own, spot, asOf));
        expect(calculateDca(later, wide, undefined, asOf)).toEqual(calculateDca(later, own, undefined, asOf));
        // The lump-sum leg prices its entry off the same series.
        expect(calculateLumpSum(5_000, later.startDate, wide, spot, 0.5))
            .toEqual(calculateLumpSum(5_000, later.startDate, own, spot, 0.5));
    });

    it('holds for a series that marks its prices observed or estimated', () => {
        const mark = (rows: [number, number][]) =>
            withPriceKinds(rows, rows.map(([ts]) => (new Date(ts).getUTCDay() === 3 ? 'observed' : 'estimated')));
        const later = plan('2022-06-15', '2024-01-01');
        expect(calculateDca(later, mark(fetched('2021-01-01', '2024-01-01')), spot, asOf))
            .toEqual(calculateDca(later, mark(fetched('2022-06-15', '2024-01-01')), spot, asOf));
    });

    it('an earlier END does not: without a live price it is valued at the wrong row', () => {
        // From the longer series, a plan that ended in June would be valued at
        // the following January's price.
        const wide = fetched('2021-01-01', '2024-01-01');
        const own = fetched('2021-01-01', '2023-06-01');
        const shorter = plan('2021-01-01', '2023-06-01');
        const fromWide = calculateDca(shorter, wide, undefined, asOf);
        const fromOwn = calculateDca(shorter, own, undefined, asOf);
        expect(fromWide.btcAccumulated).toBeCloseTo(fromOwn.btcAccumulated, 10);
        expect(fromWide.currentValue).not.toBeCloseTo(fromOwn.currentValue, 0);
    });

    it('the reply holds the day after the end, which a run compared with other assets must drop', () => {
        // The asset comparison values bitcoin, the S&P 500 and gold at each one's
        // last price in the window. An index bar is stamped mid-session, so its
        // last bar is the end date's; bitcoin's rows are stamped at midnight, so
        // its reply also holds the next day's.
        const end = parseUtcDate('2023-06-01');
        const own = fetched('2021-01-01', '2023-06-01');
        expect(own[own.length - 1][0]).toBe(end + DAY_MS);
        const toEndDate = seriesThroughDay(own, end);
        expect(toEndDate[toEndDate.length - 1][0]).toBe(end);

        // The same prices as an asset series: every row up to the end date,
        // stamped at 13:30 UTC like a market open.
        const session = 13.5 * 3_600_000;
        const sameAsset = toEndDate.map(([ts, price]): [number, number] => [ts + session, price]);
        const shorter = plan('2021-01-01', '2023-06-01');
        const asset = calculateAssetDca(
            shorter.amount, shorter.frequency, shorter.startDate, shorter.endDate, shorter.feePercentage, sameAsset, 'same', 'Same prices',
        );
        // Equal prices on equal days come out equal only when both are valued on the end date.
        expect(calculateDca(shorter, toEndDate, undefined, asOf).currentValue).toBeCloseTo(asset.currentValue, 6);
        expect(calculateDca(shorter, own, undefined, asOf).currentValue).not.toBeCloseTo(asset.currentValue, 0);
    });
});

// ── What the results area shows ───────────────────────────────────────────────

describe('selectResultView', () => {
    const base = {
        priceMode: 'api' as const,
        datesValid: true,
        form: request('2021-01-01', '2024-01-01'),
        shown: request('2021-01-01', '2024-01-01'),
        loaded: request('2021-01-01', '2024-01-01'),
        failed: false,
    };

    it('shows the form when the loaded series answers it', () => {
        expect(selectResultView(base)).toEqual({ kind: 'current', request: base.form });
        const laterStart = request('2022-01-01', '2024-01-01');
        expect(selectResultView({ ...base, form: laterStart })).toEqual({ kind: 'current', request: laterStart });
    });

    it('keeps the earlier window, as loading, while a new one is fetched', () => {
        for (const form of [
            request('2019-01-01', '2024-01-01'),            // earlier start
            request('2021-01-01', '2023-01-01'),            // earlier end
            request('2021-01-01', '2025-01-01'),            // later end
            request('2021-01-01', '2024-01-01', 'kraken'),  // other exchange
        ]) {
            expect(selectResultView({ ...base, form })).toEqual({ kind: 'earlier', request: base.shown, because: 'loading' });
        }
    });

    it('says the load failed, and still keeps the earlier window', () => {
        expect(selectResultView({ ...base, form: request('2019-01-01', '2024-01-01'), failed: true }))
            .toEqual({ kind: 'earlier', request: base.shown, because: 'failed' });
    });

    it('keeps the earlier window while the dates cannot be run', () => {
        expect(selectResultView({ ...base, datesValid: false, form: request('2025-01-01', '2024-01-01') }))
            .toEqual({ kind: 'earlier', request: base.shown, because: 'dates' });
        // Invalid dates outrank a failed load: they are what the visitor has to fix first.
        expect(selectResultView({ ...base, datesValid: false, failed: true, form: request('20300-01-01', '2024-01-01') }))
            .toEqual({ kind: 'earlier', request: base.shown, because: 'dates' });
    });

    it('shows nothing rather than an earlier window the series no longer prices', () => {
        // The series in memory is for other dates than the window last shown
        // (it was shown in Manual mode, say): there is nothing honest to keep.
        const view = selectResultView({ ...base, form: request('2019-01-01', '2024-01-01'), shown: request('2018-01-01', '2020-01-01') });
        expect(view).toEqual({ kind: 'none', because: 'loading' });
    });

    it('shows nothing before anything has loaded, and on a first load that fails', () => {
        expect(selectResultView({ ...base, shown: null, loaded: null })).toEqual({ kind: 'none', because: 'loading' });
        expect(selectResultView({ ...base, shown: null, loaded: null, failed: true })).toEqual({ kind: 'none', because: 'failed' });
        expect(selectResultView({ ...base, shown: null, loaded: null, datesValid: false })).toEqual({ kind: 'none', because: 'dates' });
    });

    it('needs no series in Manual mode', () => {
        const form = request('2012-01-01', '2030-01-01');
        expect(selectResultView({ ...base, priceMode: 'manual', form, loaded: null })).toEqual({ kind: 'current', request: form });
        expect(selectResultView({ ...base, priceMode: 'manual', form, loaded: null, datesValid: false }))
            .toEqual({ kind: 'earlier', request: base.shown, because: 'dates' });
    });

    it('never reports a window as current that the series does not answer', () => {
        // Every combination of the cases above: `current` implies an answer.
        const requests = [
            request('2021-01-01', '2024-01-01'), request('2022-01-01', '2024-01-01'), request('2020-01-01', '2024-01-01'),
            request('2021-01-01', '2023-01-01'), request('2021-01-01', '2024-01-01', 'kraken'),
        ];
        for (const form of requests) {
            for (const loaded of [...requests, null]) {
                for (const shown of [...requests, null]) {
                    const view = selectResultView({ priceMode: 'api', datesValid: true, form, shown, loaded, failed: false });
                    if (view.kind !== 'none') expect(answersPriceRequest(loaded, view.request)).toBe(true);
                    if (view.kind === 'current') expect(view.request).toBe(form);
                }
            }
        }
    });
});

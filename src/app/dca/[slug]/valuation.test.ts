import { describe, expect, it } from 'vitest';
import { chooseValuation, type ValuationInputs } from './valuation';

const DAY = 86_400_000;
const TODAY = Date.UTC(2026, 9, 12);
const at = (hour: number, minute = 0): number => TODAY + hour * 3_600_000 + minute * 60_000;

/** A history fetched at 14:00 UTC whose newest row is today's, and a quote from 15:00. */
const base: ValuationInputs = {
    quote: { price: 83_000, asOf: at(15), provider: 'coinbase' },
    lastRow: [TODAY, 82_500],
    lastRowObserved: true,
    historyFetchedAt: at(14),
    historyProvider: 'coinbase',
};

describe('chooseValuation', () => {
    it('uses the quote when it is newer than the price history', () => {
        expect(chooseValuation(base)).toEqual({
            price: 83_000,
            asOf: at(15),
            from: { kind: 'quote', provider: 'coinbase' },
        });
    });

    it('uses the history\'s row for today when the quote is older than the fetch', () => {
        // The quote is yesterday's, kept for a day; the history was fetched today.
        const valuation = chooseValuation({
            ...base,
            quote: { price: 80_000, asOf: at(11, 30) - DAY, provider: 'kraken' },
        });
        expect(valuation).toEqual({
            price: 82_500,
            asOf: at(14),
            from: { kind: 'latestTrade', provider: 'coinbase' },
        });
    });

    it('names the exchange whose history it is, not the one that quoted', () => {
        const valuation = chooseValuation({
            ...base,
            quote: { price: 80_000, asOf: at(2), provider: 'coinbase' },
            historyProvider: 'kraken',
        });
        expect(valuation.from).toEqual({ kind: 'latestTrade', provider: 'kraken' });
    });

    it('keeps the quote when the two are from the same instant', () => {
        expect(chooseValuation({ ...base, quote: { price: 83_000, asOf: at(14), provider: 'coinbase' } }).from.kind).toBe('quote');
    });

    it('keeps an older quote when the newest row is a finished day, not the day of the fetch', () => {
        // Fetched just after midnight, before the exchange has a candle for the new day.
        const valuation = chooseValuation({
            ...base,
            quote: { price: 80_000, asOf: at(0, 1) - 3_600_000, provider: 'coinbase' },
            lastRow: [TODAY - DAY, 82_500],
            historyFetchedAt: at(0, 1),
        });
        expect(valuation.price).toBe(80_000);
        expect(valuation.from.kind).toBe('quote');
    });

    it('keeps an older quote when the newest row was filled in or its kind is unknown', () => {
        const valuation = chooseValuation({
            ...base,
            quote: { price: 80_000, asOf: at(2), provider: 'coinbase' },
            lastRowObserved: false,
        });
        expect(valuation.price).toBe(80_000);
        expect(valuation.from.kind).toBe('quote');
    });

    it('never values the stack at a row with no price', () => {
        const valuation = chooseValuation({
            ...base,
            quote: { price: 80_000, asOf: at(2), provider: 'coinbase' },
            lastRow: [TODAY, 0],
        });
        expect(valuation.price).toBe(80_000);
    });

    it('falls back to the newest row, dated by its day, when there is no quote', () => {
        expect(chooseValuation({ ...base, quote: null, lastRow: [TODAY - DAY, 81_000] })).toEqual({
            price: 81_000,
            asOf: TODAY - DAY,
            from: { kind: 'lastRow' },
        });
    });
});

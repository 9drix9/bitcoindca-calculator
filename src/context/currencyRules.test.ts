import { describe, it, expect } from 'vitest';
import { CURRENCY_CODES, CURRENCY_SYMBOLS, type CurrencyCode } from '@/data/currencies';
import { compactMoney, fxRequestWaitMs, rateNoteFor, shownCurrencyFor } from './currencyRules';

const money = (code: CurrencyCode) => ({ code, symbol: CURRENCY_SYMBOLS[code] });
const usd = (value: number) => compactMoney(value, money('USD'));

describe('shownCurrencyFor', () => {
    it('holds a currency picked in the picker in dollars until its rates are in hand', () => {
        expect(shownCurrencyFor('EUR', false, null)).toBe('USD');
        expect(shownCurrencyFor('EUR', true, null)).toBe('EUR');
        expect(shownCurrencyFor('USD', false, null)).toBe('USD');
    });

    it('never holds the currency a link arrived in: its amounts are written in it', () => {
        expect(shownCurrencyFor('JPY', false, 'JPY')).toBe('JPY');
        // A different currency picked afterwards is held like any other pick.
        expect(shownCurrencyFor('GBP', false, 'JPY')).toBe('USD');
        expect(shownCurrencyFor('GBP', true, 'JPY')).toBe('GBP');
    });
});

describe('rateNoteFor', () => {
    const rates = { shown: 'JPY' as CurrencyCode, live: false, settled: true, answered: true, asOf: '2026-10-09' };

    it('says nothing for dollars or for today\'s rates', () => {
        expect(rateNoteFor({ ...rates, shown: 'USD' })).toBeNull();
        expect(rateNoteFor({ ...rates, live: true })).toBeNull();
    });

    it('says nothing while the request has not answered, failed or been waited out', () => {
        // A link's currency is on screen from the first render, a moment before its rates.
        expect(rateNoteFor({ ...rates, settled: false, answered: false })).toBeNull();
    });

    it('says the rate is still loading when the wait ran out before any answer', () => {
        expect(rateNoteFor({ ...rates, answered: false })).toBe(
            "Today's JPY exchange rate is still loading. Until it arrives, JPY figures use the rate from Oct 9, 2026 and are approximate.",
        );
    });

    it('says the rate is not available only once a request has come back without it', () => {
        expect(rateNoteFor(rates)).toBe(
            "Today's JPY exchange rate is not available, so JPY figures use the rate from Oct 9, 2026 and are approximate.",
        );
    });
});

describe('compactMoney', () => {
    it('shows whole units below 10,000, with separators', () => {
        expect(usd(0)).toBe('$0');
        expect(usd(9_135.4)).toBe('$9,135');
        expect(usd(9_999.99)).toBe('$10,000');
        expect(usd(-1_234)).toBe('-$1,234');
    });

    it('rounds the decimal half up, the same way on either side of it', () => {
        expect(usd(12_850)).toBe('$12.9K');
        expect(usd(13_050)).toBe('$13.1K');
        expect(usd(10_350)).toBe('$10.4K');
        expect(usd(17_950)).toBe('$18.0K');
        expect(usd(33_550)).toBe('$33.6K');
        expect(usd(13_049)).toBe('$13.0K');
    });

    it('prints 13,050 dollars the same in every currency, whatever the conversion leaves in the last bits', () => {
        // Rates as the site has had them; the amount goes to dollars and back as the calculator does it.
        const rates: Record<CurrencyCode, number> = { USD: 1, EUR: 0.89437, GBP: 0.75555, CAD: 1.4262, AUD: 1.4339, JPY: 158.6 };
        for (const code of CURRENCY_CODES) {
            const roundTrip = (13_050 / rates[code]) * rates[code];
            expect(compactMoney(roundTrip, money(code))).toBe(`${CURRENCY_SYMBOLS[code]}13.1K`);
        }
        expect(compactMoney(13_049.999999999989, money('EUR'))).toBe('€13.1K');
    });

    it('starts each tier where the one below would round up into it', () => {
        expect(usd(999_949)).toBe('$999.9K');
        expect(usd(999_950)).toBe('$1.0M');
        expect(usd(999_949_999)).toBe('$999.9M');
        expect(usd(999_950_000)).toBe('$1.0B');
        expect(usd(999_949_999_999)).toBe('$999.9B');
        expect(usd(999_950_000_000)).toBe('$1.0T');
    });

    it('has a trillions tier, which keeps separators past a thousand', () => {
        expect(compactMoney(1.827e12, money('JPY'))).toBe('¥1.8T');
        expect(usd(4.8965707e15)).toBe('$4,896.6T');
        expect(usd(-4.8911717e15)).toBe('-$4,891.2T');
        expect(compactMoney(3.5397e12, money('JPY'))).toBe('¥3.5T');
    });
});

describe('fxRequestWaitMs', () => {
    const MIN_GAP = 60_000;
    const NOW = 1_800_000_000_000;

    it('is 0 when nothing is in flight and the last request was long enough ago', () => {
        expect(fxRequestWaitMs({ inFlight: false, lastTry: 0 }, NOW, MIN_GAP)).toBe(0);
        expect(fxRequestWaitMs({ inFlight: false, lastTry: NOW - MIN_GAP }, NOW, MIN_GAP)).toBe(0);
    });

    it('is the rest of the minute after a request that failed', () => {
        // The connection came back six seconds after the request failed.
        expect(fxRequestWaitMs({ inFlight: false, lastTry: NOW - 6_000 }, NOW, MIN_GAP)).toBe(54_000);
        expect(fxRequestWaitMs({ inFlight: false, lastTry: NOW - 59_999 }, NOW, MIN_GAP)).toBe(1_000);
    });

    it('waits while a request is in flight, never less than a second', () => {
        expect(fxRequestWaitMs({ inFlight: true, lastTry: NOW - 6_000 }, NOW, MIN_GAP)).toBe(54_000);
        expect(fxRequestWaitMs({ inFlight: true, lastTry: NOW - 5 * MIN_GAP }, NOW, MIN_GAP)).toBe(1_000);
    });
});

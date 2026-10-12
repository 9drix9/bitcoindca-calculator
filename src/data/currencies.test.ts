import { describe, expect, it } from 'vitest';
import {
    CURRENCY_CODES,
    CURRENCY_SYMBOLS,
    FX_FALLBACK_AS_OF,
    FX_FALLBACK_RATES,
    FX_FALLBACK_SNAPSHOT,
    FX_QUOTE_CODES,
    currencyLabel,
} from './currencies';
import { decodeParams, encodeParams } from '@/utils/urlParams';
import {
    DEFAULT_PRICE_PROVIDER,
    PRICE_PROVIDERS,
    fallbackProviderFor,
    isPriceProvider,
    priceFallbackNotice,
    priceStaleNotice,
} from './priceSources';

describe('currency table', () => {
    it('has a symbol and a positive fallback rate for every code', () => {
        for (const code of CURRENCY_CODES) {
            expect(CURRENCY_SYMBOLS[code]).toBeTruthy();
            expect(FX_FALLBACK_RATES[code]).toBeGreaterThan(0);
            expect(currencyLabel(code)).toBe(`${code} (${CURRENCY_SYMBOLS[code]})`);
        }
        expect(FX_FALLBACK_RATES.USD).toBe(1);
        expect([...FX_QUOTE_CODES].sort()).toEqual(CURRENCY_CODES.filter((c) => c !== 'USD').sort());
    });

    it('dates its fallback rates and never calls them live', () => {
        expect(FX_FALLBACK_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(FX_FALLBACK_SNAPSHOT).toEqual({ rates: FX_FALLBACK_RATES, live: false, asOf: FX_FALLBACK_AS_OF });
    });

    it('lists exactly the currencies a shared link can carry', () => {
        const base = {
            amount: 50, frequency: 'weekly', startDate: '2022-01-01', endDate: '2023-01-01',
            feePercentage: 0.5, priceMode: 'api', provider: 'coinbase', manualPrice: 0,
        } as const;
        for (const code of CURRENCY_CODES) {
            const query = Object.fromEntries(new URLSearchParams(encodeParams({ ...base, currency: code })));
            expect(decodeParams(query)?.currency).toBe(code);
        }
        const unknown = Object.fromEntries(new URLSearchParams(encodeParams({ ...base, currency: 'USD' })));
        expect(decodeParams({ ...unknown, currency: 'CHF' })?.currency).toBeUndefined();
    });
});

describe('price providers', () => {
    it('defaults to a known provider and falls back to the other one', () => {
        expect(PRICE_PROVIDERS).toContain(DEFAULT_PRICE_PROVIDER);
        expect(fallbackProviderFor('coinbase')).toBe('kraken');
        expect(fallbackProviderFor('kraken')).toBe('coinbase');
        expect(isPriceProvider('coinbase')).toBe(true);
        expect(isPriceProvider('binance')).toBe(false);
    });

    it('explains a fallback only when there was one, and says what the prices are', () => {
        expect(priceFallbackNotice('coinbase', 'coinbase')).toBeNull();
        expect(priceFallbackNotice('coinbase', 'kraken')).toBe(
            'Coinbase was unreachable; these prices are Kraken weekly closes with straight-line fills.',
        );
        expect(priceFallbackNotice('kraken', 'coinbase')).toBe('Kraken was unreachable; these prices are Coinbase daily closes.');
    });

    it('dates an earlier copy in UTC, the same on the server and in any browser', () => {
        expect(priceStaleNotice('coinbase', Date.UTC(2026, 9, 12, 14, 5, 59))).toBe(
            'Coinbase could not be reached just now; these prices were fetched on 2026-10-12 at 14:05 UTC.',
        );
    });
});

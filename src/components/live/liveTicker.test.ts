import { describe, it, expect } from 'vitest';
import { TICKER_MAX_AGE_MS, acceptTicker } from './liveTicker';

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);

const quote = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    price: 83_335.5,
    open24h: 83_582.1,
    provider: 'kraken',
    changeSince: 'utc-midnight',
    asOf: NOW - 20_000,
    generatedAt: NOW,
    ...over,
});

describe('acceptTicker', () => {
    it('takes a quote from either exchange, with the point its change is measured from', () => {
        expect(acceptTicker(quote(), NOW)).toEqual({
            value: { price: 83_335.5, open24h: 83_582.1, provider: 'kraken', changeSince: 'utc-midnight', asOf: NOW - 20_000 },
            complete: true,
        });
        expect(acceptTicker(quote({ provider: 'coinbase', changeSince: '24h-ago' }), NOW)?.value)
            .toMatchObject({ provider: 'coinbase', changeSince: '24h-ago' });
    });

    it.each([
        ['no price', { price: undefined }],
        ['a price of zero', { price: 0 }],
        ['a price that is not a number', { price: '83335.5' }],
        ['no opening price', { open24h: null }],
        ['an exchange the pill cannot name', { provider: 'binance' }],
        ['a change measured from an unknown point', { changeSince: 'yesterday' }],
        ['no fetch time', { asOf: undefined }],
    ])('turns down %s', (_name, over) => {
        expect(acceptTicker(quote(over), NOW)).toBeNull();
    });

    it('turns down a quote that was already too old to be live when it arrived', () => {
        expect(TICKER_MAX_AGE_MS).toBe(5 * 60_000);
        expect(acceptTicker(quote({ asOf: NOW - TICKER_MAX_AGE_MS }), NOW)).not.toBeNull();
        expect(acceptTicker(quote({ asOf: NOW - TICKER_MAX_AGE_MS - 1 }), NOW)).toBeNull();
    });
});

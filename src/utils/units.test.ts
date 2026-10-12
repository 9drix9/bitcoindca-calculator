import { describe, expect, it } from 'vitest';
import { btcToSats, SATS_PER_BTC } from './units';

describe('btcToSats', () => {
    it('rounds amounts that floating point lands just under a whole satoshi', () => {
        // The regression: each of these floors to one satoshi short.
        expect(btcToSats(0.29)).toBe(29_000_000);
        expect(btcToSats(0.57)).toBe(57_000_000);
        expect(btcToSats(2.3)).toBe(230_000_000);
    });

    it('agrees with the eight-decimal BTC figure shown beside it', () => {
        // BTC mode prints toFixed(8), which rounds. Sats mode has to say the same.
        let seed = 20261012;
        const next = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };
        for (let i = 0; i < 2000; i++) {
            const btc = next() * 25;
            expect(btcToSats(btc)).toBe(Math.round(Number(btc.toFixed(8)) * SATS_PER_BTC));
        }
    });

    it('returns a plain zero for nothing, negative zero and not-a-number', () => {
        expect(Object.is(btcToSats(0), 0)).toBe(true);
        expect(Object.is(btcToSats(-0), 0)).toBe(true);
        expect(Object.is(btcToSats(-0.000000001), 0)).toBe(true);
        expect(btcToSats(Number.NaN)).toBe(0);
    });

    it('keeps one satoshi and one bitcoin exact', () => {
        expect(btcToSats(0.00000001)).toBe(1);
        expect(btcToSats(1)).toBe(SATS_PER_BTC);
    });
});

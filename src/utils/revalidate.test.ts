import { describe, expect, it } from 'vitest';
import {
    DAILY_PRICE_REVALIDATE,
    DEFAULT_PRICE_REVALIDATE,
    FAILURE_REVALIDATE,
    HISTORY_REVALIDATE,
    SEALED_HISTORY_REVALIDATE,
    normalizeRevalidate,
} from './revalidate';

describe('normalizeRevalidate', () => {
    it('passes a sensible lifetime through, as whole seconds', () => {
        expect(normalizeRevalidate(3600, 60)).toBe(3600);
        expect(normalizeRevalidate(DAILY_PRICE_REVALIDATE, 60)).toBe(DAILY_PRICE_REVALIDATE);
        expect(normalizeRevalidate(90.9, 60)).toBe(90);
    });

    it('never lets a public caller turn an action into an uncached proxy', () => {
        // Every server action argument is attacker-controlled; 0 would mean
        // "hit the upstream on every call".
        expect(normalizeRevalidate(0, HISTORY_REVALIDATE)).toBe(DEFAULT_PRICE_REVALIDATE);
        expect(normalizeRevalidate(-5, HISTORY_REVALIDATE)).toBe(DEFAULT_PRICE_REVALIDATE);
        expect(normalizeRevalidate(1, HISTORY_REVALIDATE)).toBe(DEFAULT_PRICE_REVALIDATE);
    });

    it('caps the lifetime at a day', () => {
        expect(normalizeRevalidate(10 * DAILY_PRICE_REVALIDATE, 60)).toBe(DAILY_PRICE_REVALIDATE);
    });

    it('uses the fallback for anything that is not a finite number', () => {
        for (const junk of [undefined, null, NaN, Infinity, '3600', {}, false]) {
            expect(normalizeRevalidate(junk, HISTORY_REVALIDATE)).toBe(HISTORY_REVALIDATE);
        }
    });
});

describe('cache lifetimes', () => {
    it('keep their order: a failure is retried long before a healthy page is refreshed', () => {
        expect(DEFAULT_PRICE_REVALIDATE).toBeLessThan(FAILURE_REVALIDATE);
        expect(FAILURE_REVALIDATE).toBeLessThan(HISTORY_REVALIDATE);
        expect(HISTORY_REVALIDATE).toBeLessThan(DAILY_PRICE_REVALIDATE);
        // Longer than any route's own revalidate, so a sealed chunk never shortens one.
        expect(SEALED_HISTORY_REVALIDATE).toBeGreaterThan(DAILY_PRICE_REVALIDATE);
    });
});

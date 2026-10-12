import { describe, expect, it } from 'vitest';
import { disposalCost, disposalCostByRule, type Lot } from './lots';

// Three buys of one bitcoin each, in purchase order.
const LOTS: Lot[] = [
    { price: 100, btc: 1 },
    { price: 300, btc: 1 },
    { price: 200, btc: 1 },
];

describe('disposalCost', () => {
    it('uses lots in the order given, splitting the last one it needs', () => {
        expect(disposalCost(LOTS, 1.5)).toBe(100 + 0.5 * 300);
    });

    it('costs nothing for nothing, and stops at the whole stack', () => {
        expect(disposalCost(LOTS, 0)).toBe(0);
        expect(disposalCost(LOTS, 3)).toBe(600);
        expect(disposalCost(LOTS, 10)).toBe(600);
        expect(disposalCost([], 1)).toBe(0);
    });
});

describe('disposalCostByRule', () => {
    it('gives each rule its own lots for the same sale', () => {
        expect(disposalCostByRule(LOTS, 1.5)).toEqual({
            fifo: 100 + 0.5 * 300, // oldest first
            lifo: 200 + 0.5 * 300, // newest first
            hifo: 300 + 0.5 * 200, // most expensive first
        });
    });

    it('agrees across rules once everything is sold', () => {
        expect(disposalCostByRule(LOTS, 3)).toEqual({ fifo: 600, lifo: 600, hifo: 600 });
    });

    it('leaves the lots in purchase order', () => {
        disposalCostByRule(LOTS, 1.5);
        expect(LOTS.map((lot) => lot.price)).toEqual([100, 300, 200]);
    });
});

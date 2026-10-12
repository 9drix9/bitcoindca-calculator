import { describe, expect, it } from 'vitest';
import { floorMoney, simulateDrawdown, solveSustainableWithdrawal, type SimParams } from './spendDown';

const PRICE = 83_362;
const flat = (over: Partial<SimParams> = {}): SimParams => ({
    startBtc: 1,
    priceUsd: PRICE,
    monthlyWithdrawalUsd: 1000,
    annualGrowth: 0,
    annualInflation: 0,
    floorBtc: 0,
    ...over,
});

describe('simulateDrawdown', () => {
    it('counts the complete months a flat price funds', () => {
        // 83,362 / 1,000 = 83.36: 83 full months, then a part month that empties the stack.
        const run = simulateDrawdown(flat(), 1200, false);
        expect(run.monthsSurvived).toBe(83);
        expect(run.neverExhausted).toBe(false);
        expect(run.btcRemaining).toBe(0);
        expect(run.totalWithdrawnUsd).toBeCloseTo(PRICE, 6);
    });

    it('stops selling at the floor', () => {
        const run = simulateDrawdown(flat({ floorBtc: 0.5 }), 1200, false);
        expect(run.monthsSurvived).toBe(41);
        expect(run.btcRemaining).toBe(0.5);
        expect(run.totalWithdrawnUsd).toBeCloseTo(PRICE / 2, 6);
    });

    it('lasts longer on a rising price and shorter on a falling one', () => {
        const base = simulateDrawdown(flat(), 1200, false).monthsSurvived;
        expect(simulateDrawdown(flat({ annualGrowth: 0.2 }), 1200, false).monthsSurvived).toBeGreaterThan(base);
        expect(simulateDrawdown(flat({ annualGrowth: -0.2 }), 1200, false).monthsSurvived).toBeLessThan(base);
    });

    it('raises the withdrawal with inflation', () => {
        const base = simulateDrawdown(flat(), 1200, false).monthsSurvived;
        expect(simulateDrawdown(flat({ annualInflation: 0.03 }), 1200, false).monthsSurvived).toBeLessThan(base);
    });

    it('reports a stack that outlives the horizon', () => {
        const run = simulateDrawdown(flat({ monthlyWithdrawalUsd: 1 }), 1200, false);
        expect(run.monthsSurvived).toBe(1200);
        expect(run.neverExhausted).toBe(true);
    });

    it('records one path point per month, starting from today', () => {
        const run = simulateDrawdown(flat(), 1200, true);
        expect(run.path[0]).toEqual({ year: 0, value: PRICE, btc: 1 });
        // 83 funded months and the part month that empties it.
        expect(run.path).toHaveLength(85);
        expect(run.path[run.path.length - 1].btc).toBe(0);
    });
});

describe('solveSustainableWithdrawal', () => {
    it('finds the amount a flat price spreads over the target months', () => {
        const solved = solveSustainableWithdrawal(flat(), 360);
        expect(solved).not.toBeNull();
        // The last of 360 withdrawals must leave something, so just under PRICE / 360.
        expect(solved as number).toBeCloseTo(PRICE / 360, 3);
    });

    it('is null when nothing can be sold', () => {
        expect(solveSustainableWithdrawal(flat({ startBtc: 0 }), 360)).toBeNull();
        expect(solveSustainableWithdrawal(flat({ floorBtc: 1 }), 360)).toBeNull();
        expect(solveSustainableWithdrawal(flat({ priceUsd: 0 }), 360)).toBeNull();
    });
});

describe('floorMoney', () => {
    it('rounds down to whole units, or to four decimals under one unit', () => {
        expect(floorMoney(231.56)).toBe(231);
        expect(floorMoney(87.99)).toBe(87);
        expect(floorMoney(0.03129)).toBe(0.0312);
        expect(floorMoney(0)).toBe(0);
        expect(floorMoney(-5)).toBe(0);
        expect(floorMoney(NaN)).toBe(0);
    });

    it('gives a figure that lasts the years it is labelled with when typed back in', () => {
        const cases: Partial<SimParams>[] = [
            {},
            { annualInflation: 0.03 },
            { startBtc: 0.60912293, annualInflation: 0.03 },
            { startBtc: 0.25 },
            { startBtc: 2, annualInflation: 0.02 },
            { startBtc: 2.5, annualInflation: 0.03 },
            { annualGrowth: 0.15, annualInflation: 0.03 },
            { annualGrowth: -0.2 },
            { floorBtc: 0.4, annualInflation: 0.03 },
            { startBtc: 0.0001 },
        ];
        for (const over of cases) {
            const base = flat(over);
            const solved = solveSustainableWithdrawal(base, 360);
            expect(solved, JSON.stringify(over)).not.toBeNull();
            const shown = floorMoney(solved as number);
            const run = simulateDrawdown({ ...base, monthlyWithdrawalUsd: shown }, 360, false);
            expect(run.monthsSurvived, JSON.stringify(over)).toBe(360);
        }
    });

    it('is needed: the nearest whole dollar can run out early', () => {
        // 83,362 / 360 = 231.56, which rounds to 232, and 232 x 360 is more than the stack.
        const nearest = Math.round(solveSustainableWithdrawal(flat(), 360) as number);
        expect(nearest).toBe(232);
        expect(simulateDrawdown(flat({ monthlyWithdrawalUsd: nearest }), 360, false).monthsSurvived).toBe(359);
    });
});

import { describe, expect, it } from 'vitest';
import {
    BASELINE_MONTHLY_SPEND_USD,
    SPENDING_INFLATION_RATE,
    WITHDRAWAL_RATE,
    contributionsPerYear,
    defaultMonthlySpend,
    flipSign,
    formatCompactAmount,
    impliedPrice,
    priceScenarioLabel,
    projectFire,
    stackAmountAsInput,
} from './projection';
import { FX_FALLBACK_RATES } from '@/data/currencies';
import { roundTo2Sig } from '@/utils/numericInput';

// ── Defaults that have to make sense in every display currency ────────────────

describe('defaultMonthlySpend', () => {
    it('is the USD baseline at a rate of 1', () => {
        expect(defaultMonthlySpend(1)).toBe(BASELINE_MONTHLY_SPEND_USD);
    });

    it('is a round figure worth about the baseline in every supported currency', () => {
        for (const [code, rate] of Object.entries(FX_FALLBACK_RATES)) {
            const spend = defaultMonthlySpend(rate);
            const usd = spend / rate;
            // Two significant figures can move a number by at most 5%.
            expect(Math.abs(usd - BASELINE_MONTHLY_SPEND_USD) / BASELINE_MONTHLY_SPEND_USD, code).toBeLessThan(0.05);
            expect(roundTo2Sig(spend), code).toBe(spend);
        }
    });

    it('does not open a yen visitor on 4,000 yen, which is about $25 a month', () => {
        const yen = defaultMonthlySpend(158.25);
        expect(yen).toBe(630_000);
        expect(yen / 158.25).toBeGreaterThan(3_900);
    });

    it('falls back to the USD figure when the rate is unusable', () => {
        expect(defaultMonthlySpend(0)).toBe(BASELINE_MONTHLY_SPEND_USD);
        expect(defaultMonthlySpend(NaN)).toBe(BASELINE_MONTHLY_SPEND_USD);
    });
});

// ── The FIRE walk ─────────────────────────────────────────────────────────────

describe('projectFire', () => {
    const annualExpensesUsd = BASELINE_MONTHLY_SPEND_USD * 12;
    const fireNumber = annualExpensesUsd / WITHDRAWAL_RATE;

    it('has nothing to project when there is no spending to cover', () => {
        // An empty, zero or negative spend field used to read "Now, you're
        // already there" on every card while the progress bar said 0%.
        for (const expenses of [0, -6000, NaN]) {
            expect(projectFire({
                stackValueUsd: 50_000,
                annualContributionUsd: 2_600,
                annualExpensesUsd: expenses,
                annualRate: 0.2,
            })).toBeNull();
        }
    });

    it('is reached at year 0 only when the stack already covers the spending', () => {
        const at = projectFire({ stackValueUsd: fireNumber, annualContributionUsd: 0, annualExpensesUsd, annualRate: 0 });
        expect(at).toMatchObject({ reached: true, years: 0 });
        const below = projectFire({ stackValueUsd: fireNumber - 1, annualContributionUsd: 0, annualExpensesUsd, annualRate: 0.5 });
        expect(below?.years).toBeGreaterThan(0);
    });

    it('counts whole years of growth plus contributions against an inflating target', () => {
        const result = projectFire({ stackValueUsd: 100_000, annualContributionUsd: 5_200, annualExpensesUsd, annualRate: 0.2 });
        // Walk it by hand: the stack compounds and takes a year of buying, the
        // target rises 3% a year, and the first year the 4% test passes is the answer.
        let stack = 100_000;
        let years = 0;
        while (stack * WITHDRAWAL_RATE < annualExpensesUsd * (1 + SPENDING_INFLATION_RATE) ** years) {
            stack = stack * 1.2 + 5_200;
            years++;
        }
        expect(result).toMatchObject({ reached: true, years, rate: 0.2 });
        expect(result?.projectedValue).toBeCloseTo(stack, 6);
        expect(years).toBeGreaterThan(10);
    });

    it('is never reached on a falling price with small contributions', () => {
        const result = projectFire({ stackValueUsd: 20_000, annualContributionUsd: 2_600, annualExpensesUsd, annualRate: -0.2 });
        expect(result).toMatchObject({ reached: false, years: null });
    });

    it('takes more years, never fewer, when the starting stack is smaller', () => {
        // The contract the callers rely on: handing this the end-of-plan total of
        // a schedule that runs into the future (coins not bought yet) understates
        // the wait. They pass what is held today.
        const held = projectFire({ stackValueUsd: 5_774, annualContributionUsd: 5_200, annualExpensesUsd, annualRate: 0.2 });
        const inflated = projectFire({ stackValueUsd: 16_176, annualContributionUsd: 5_200, annualExpensesUsd, annualRate: 0.2 });
        expect(held?.years).toBeGreaterThanOrEqual(inflated?.years ?? Infinity);
    });
});

describe('contributionsPerYear', () => {
    it('matches the cadence', () => {
        expect(contributionsPerYear(50, 'daily')).toBe(18_250);
        expect(contributionsPerYear(50, 'weekly')).toBe(2_600);
        expect(contributionsPerYear(50, 'biweekly')).toBe(1_300);
        expect(contributionsPerYear(50, 'monthly')).toBe(600);
    });
});

// ── Making a growth assumption visible ────────────────────────────────────────

describe('impliedPrice', () => {
    it('leaves the price alone at a flat rate', () => {
        expect(impliedPrice(83_000, 0, 30)).toBe(83_000);
    });

    it('shows what +15% a year means over 30 years: a 66-fold rise', () => {
        expect(impliedPrice(1, 0.15, 30)).toBeCloseTo(66.21, 2);
        expect(impliedPrice(83_635, 0.15, 30)).toBeGreaterThan(5_500_000);
    });

    it('shows what a falling price means too', () => {
        expect(impliedPrice(100_000, -0.2, 10)).toBeCloseTo(10_737.42, 2);
    });
});

describe('priceScenarioLabel', () => {
    it('names a path by what it does to the price', () => {
        expect(priceScenarioLabel(-0.2)).toBe('Price falls');
        expect(priceScenarioLabel(0)).toBe('Price flat');
        expect(priceScenarioLabel(0.2)).toBe('Price rises');
    });
});

describe('formatCompactAmount', () => {
    it('shortens by magnitude', () => {
        expect(formatCompactAmount(5_540_000, '$')).toBe('$5.5M');
        expect(formatCompactAmount(338_000, '$')).toBe('$338k');
        expect(formatCompactAmount(8_300, '$')).toBe('$8.3k');
        expect(formatCompactAmount(104.4, '$')).toBe('$104');
        expect(formatCompactAmount(2.5e9, '€')).toBe('€2.5B');
        expect(formatCompactAmount(1.3e12, '¥')).toBe('¥1.3T');
    });

    it('keeps cents under 1 so a collapsed price does not read as free', () => {
        expect(formatCompactAmount(0.42, '$')).toBe('$0.42');
        expect(formatCompactAmount(0.0000169, '$')).toBe('under $0.01');
        expect(formatCompactAmount(0, '$')).toBe('$0');
    });

    it('says when a figure has left the scale', () => {
        expect(formatCompactAmount(9.6e22, '$')).toBe('over $999T');
    });

    it('does not print NaN or Infinity', () => {
        expect(formatCompactAmount(NaN, '$')).toBe('—');
        expect(formatCompactAmount(Infinity, '$')).toBe('—');
    });
});

// ── A negative rate has to be enterable without a minus key ───────────────────

describe('flipSign', () => {
    it('turns a rise into a fall and back', () => {
        expect(flipSign('20')).toBe('-20');
        expect(flipSign('-20')).toBe('20');
        expect(flipSign('5.5')).toBe('-5.5');
    });

    it('leaves empty, partial and zero input as it was', () => {
        for (const raw of ['', '-', '.', '0', 'abc']) {
            expect(flipSign(raw)).toBe(raw);
        }
    });
});

// ── The planner's floor field follows the Units switch ────────────────────────

describe('stackAmountAsInput', () => {
    it('writes a BTC amount as whole sats for a sats field', () => {
        expect(stackAmountAsInput(0.1, 'SATS')).toBe('10000000');
        expect(stackAmountAsInput(1, 'SATS')).toBe('100000000');
        expect(stackAmountAsInput(0.00012345, 'SATS')).toBe('12345');
    });

    it('rounds to the sat, so 0.29 BTC is not 28,999,999 sats', () => {
        expect(0.29 * 100_000_000).not.toBe(29_000_000);
        expect(stackAmountAsInput(0.29, 'SATS')).toBe('29000000');
    });

    it('writes a BTC field without padding zeros or exponent form', () => {
        expect(stackAmountAsInput(0.1, 'BTC')).toBe('0.1');
        expect(stackAmountAsInput(0.00012345, 'BTC')).toBe('0.00012345');
        expect(stackAmountAsInput(0.0000001, 'BTC')).toBe('0.0000001');
        expect(stackAmountAsInput(0.00000001, 'BTC')).toBe('0.00000001');
        expect(stackAmountAsInput(2, 'BTC')).toBe('2');
        expect(stackAmountAsInput(100, 'BTC')).toBe('100');
        expect(stackAmountAsInput(21_000_000, 'BTC')).toBe('21000000');
    });

    it('keeps the amount when it goes to sats and back', () => {
        for (const sats of [1, 12_345, 5_000_000, 29_000_000, 123_456_789]) {
            const asBtcField = stackAmountAsInput(sats / 100_000_000, 'BTC');
            expect(stackAmountAsInput(Number(asBtcField), 'SATS'), String(sats)).toBe(String(sats));
        }
    });

    it('is a plain zero for nothing and for a value that is not a number', () => {
        expect(stackAmountAsInput(0, 'BTC')).toBe('0');
        expect(stackAmountAsInput(0, 'SATS')).toBe('0');
        expect(stackAmountAsInput(NaN, 'BTC')).toBe('0');
        expect(stackAmountAsInput(Infinity, 'SATS')).toBe('0');
    });
});

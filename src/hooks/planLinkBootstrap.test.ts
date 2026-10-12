import { describe, it, expect } from 'vitest';
import { PLAN_LINK_ATTR, PLAN_LINK_BOOTSTRAP_SCRIPT } from './planLinkBootstrap';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { DEFAULT_PRICE_PROVIDER } from '@/data/priceSources';
import { defaultPlanWindow } from '@/utils/dates';
import { encodeParams } from '@/utils/urlParams';

const NOW = Date.UTC(2026, 9, 12, 15, 30);

/**
 * Runs the inline <head> script against the three globals it touches, with the
 * clock held at `now`. Returns whether it marked the document.
 */
function marks(search: string, { pathname = '/', now = NOW }: { pathname?: string; now?: number } = {}): boolean {
    const attributes = new Map<string, string>();
    const documentStub = {
        documentElement: { setAttribute: (name: string, value: string) => void attributes.set(name, value) },
    };
    class FixedDate extends Date {
        constructor(...args: ConstructorParameters<typeof Date> | []) {
            if (args.length === 0) super(now);
            else super(...(args as ConstructorParameters<typeof Date>));
        }
    }
    // The body is the module's own compile-time constant, the exact text the
    // layout ships inline. Nothing from outside is interpolated into it.
    new Function('document', 'location', 'Date', PLAN_LINK_BOOTSTRAP_SCRIPT)(documentStub, { pathname, search }, FixedDate);
    return attributes.has(PLAN_LINK_ATTR);
}

/** The address the calculator writes for a plan, as `location.search` holds it. */
function searchFor(overrides: Partial<Parameters<typeof encodeParams>[0]> = {}, now = NOW): string {
    const { startDate, endDate } = defaultPlanWindow(now);
    return '?' + encodeParams({
        amount: DEFAULT_PLAN.amount,
        frequency: DEFAULT_PLAN.frequency,
        startDate,
        endDate,
        feePercentage: DEFAULT_PLAN.feePercentage,
        priceMode: 'api',
        provider: DEFAULT_PRICE_PROVIDER,
        manualPrice: 0,
        currency: 'USD',
        ...overrides,
    });
}

describe('plan-link bootstrap script: when the prerendered result is already right', () => {
    it('leaves a plain address alone', () => {
        expect(marks('')).toBe(false);
        expect(marks('?')).toBe(false);
    });

    it("leaves the default plan's own address alone", () => {
        expect(marks(searchFor())).toBe(false);
    });

    it('ignores parameters that are not plan settings', () => {
        expect(marks('?utm_source=newsletter&utm_campaign=oct')).toBe(false);
        expect(marks('?fbclid=abc123&gclid=xyz')).toBe(false);
        expect(marks(`${searchFor()}&utm_source=x`)).toBe(false);
    });

    it('reads numbers as numbers and skips a blank value, as the calculator does', () => {
        expect(marks('?amount=50.0&fee=0.50')).toBe(false);
        expect(marks('?amount=&frequency=')).toBe(false);
    });

    it('does nothing on any other page', () => {
        expect(marks('?amount=500', { pathname: '/about' })).toBe(false);
        expect(marks('?amount=500', { pathname: '/calculators/bitcoin-fire' })).toBe(false);
    });
});

describe('plan-link bootstrap script: when the address asks for another plan', () => {
    it('marks the document for each setting that differs from the default', () => {
        for (const search of [
            '?amount=500',
            '?amount=0',
            '?frequency=monthly',
            '?fee=1',
            '?mode=manual',
            '?provider=kraken',
            '?currency=EUR',
            '?startDate=2018-01-01',
            '?endDate=2024-12-31',
        ]) {
            expect(marks(search), search).toBe(true);
        }
    });

    it('marks it for any setting that has no default, whatever the value', () => {
        for (const search of ['?flat=0.99', '?manualPrice=100000', '?startingBtc=0.5', '?startingCost=30000', '?esc=5', '?esc=0']) {
            expect(marks(search), search).toBe(true);
        }
    });

    it('marks it for a full link the calculator wrote', () => {
        expect(marks(searchFor({ amount: 100, frequency: 'monthly' }))).toBe(true);
        expect(marks(searchFor({ startDate: '2017-12-17', endDate: '2022-06-30', provider: 'kraken' }))).toBe(true);
        expect(marks(searchFor({ flatFee: 0.99 }))).toBe(true);
    });

    it('marks it when it cannot tell: a value the calculator would reject', () => {
        expect(marks('?amount=abc')).toBe(true);
        expect(marks('?frequency=Weekly')).toBe(true);
    });

    it('decodes the query before comparing', () => {
        expect(marks('?currency=US%44')).toBe(false);
        expect(marks('?frequency=month%6Cy')).toBe(true);
        // A malformed escape must not throw the script away.
        expect(marks('?amount=%E0%A4%A&frequency=monthly')).toBe(true);
    });
});

describe('plan-link bootstrap script: the default window', () => {
    it('matches defaultPlanWindow on ordinary days, month ends and a leap day', () => {
        const days = [
            Date.UTC(2026, 9, 12, 0, 0),
            Date.UTC(2026, 9, 12, 23, 59),
            Date.UTC(2027, 0, 1, 0, 0),
            Date.UTC(2026, 11, 31, 12),
            Date.UTC(2027, 2, 31, 12),
            Date.UTC(2028, 1, 29, 12), // five years back is 2023, which has no Feb 29
            Date.UTC(2031, 4, 31, 12),
        ];
        for (const now of days) {
            expect(marks(searchFor({}, now), { now }), new Date(now).toISOString()).toBe(false);
            // Yesterday's window is a different plan. (Its start is not
            // always a different day: Feb 28 and Feb 29 both go back to Feb 28.)
            const { endDate } = defaultPlanWindow(now - 86_400_000);
            expect(marks(`?endDate=${endDate}`, { now }), `end ${endDate}`).toBe(true);
            const { startDate } = defaultPlanWindow(now - 40 * 86_400_000);
            expect(marks(`?startDate=${startDate}`, { now }), `start ${startDate}`).toBe(true);
        }
    });
});

describe('plan-link bootstrap script: failure', () => {
    it('never throws, whatever the page gives it', () => {
        const run = (location: unknown) =>
            new Function('document', 'location', 'Date', PLAN_LINK_BOOTSTRAP_SCRIPT)({ documentElement: null }, location, Date);
        expect(() => run({ pathname: '/', search: '?amount=500' })).not.toThrow();
        expect(() => run(null)).not.toThrow();
    });
});

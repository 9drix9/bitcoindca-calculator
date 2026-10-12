import { describe, expect, it } from 'vitest';
import { URL_PARAM_LIMITS, decodeParams, encodeParams, impliedSessionCurrency } from './urlParams';
import { calculateDca } from './dca';
import { DAY_MS, EARLIEST_PRICE_DATE, EARLIEST_PRICE_TS, MAX_END_DATE, MAX_END_TS, parseUtcDate } from './dates';
import type { CalculatorSearchParams } from '@/types';

type EncodeInput = Parameters<typeof encodeParams>[0];

const plan = (over: Partial<EncodeInput> = {}): EncodeInput => ({
    amount: 50,
    frequency: 'weekly',
    startDate: '2021-10-11',
    endDate: '2026-10-11',
    feePercentage: 0.5,
    priceMode: 'api',
    provider: 'kraken',
    manualPrice: 50_000,
    currency: 'USD',
    ...over,
});

/** What the browser hands decodeParams: the query string parsed back into an object. */
const parse = (query: string): CalculatorSearchParams => Object.fromEntries(new URLSearchParams(query).entries());

// ── Encoding ──────────────────────────────────────────────────────────────────

describe('encodeParams', () => {
    it('writes the plan in a fixed order, with the currency always spelled out', () => {
        expect(encodeParams(plan())).toBe(
            'amount=50&frequency=weekly&startDate=2021-10-11&endDate=2026-10-11&fee=0.5&mode=api&provider=kraken&currency=USD',
        );
    });

    it('states USD even when the caller gives no currency: absent has always meant USD', () => {
        expect(parse(encodeParams(plan({ currency: undefined }))).currency).toBe('USD');
        expect(parse(encodeParams(plan({ currency: '' }))).currency).toBe('USD');
        expect(parse(encodeParams(plan({ currency: 'JPY' }))).currency).toBe('JPY');
    });

    it('includes the optional parts of a plan only when they are set', () => {
        const bare = parse(encodeParams(plan({ startingBtc: 0, startingAvgCost: 0, annualEscalationPct: 0, flatFee: 0 })));
        expect(Object.keys(bare)).toEqual(['amount', 'frequency', 'startDate', 'endDate', 'fee', 'mode', 'provider', 'currency']);

        const full = parse(encodeParams(plan({ startingBtc: 0.5, startingAvgCost: 30_000, annualEscalationPct: 10, flatFee: 2.99 })));
        expect(full).toMatchObject({ startingBtc: '0.5', startingCost: '30000', esc: '10', flat: '2.99' });
    });

    it('carries the manual price only in manual mode', () => {
        expect(parse(encodeParams(plan())).manualPrice).toBeUndefined();
        expect(parse(encodeParams(plan({ priceMode: 'manual' }))).manualPrice).toBe('50000');
    });

    it('drops a starting cost that has no starting stack to belong to', () => {
        expect(parse(encodeParams(plan({ startingBtc: 0, startingAvgCost: 30_000 }))).startingCost).toBeUndefined();
    });
});

// ── Decoding ──────────────────────────────────────────────────────────────────

describe('decodeParams', () => {
    it('returns null when nothing usable is present', () => {
        expect(decodeParams({})).toBeNull();
        expect(decodeParams({ amount: 'abc', frequency: 'hourly', startDate: 'yesterday' })).toBeNull();
    });

    it('reads every field of a full link', () => {
        expect(decodeParams({
            amount: '75.5', frequency: 'monthly', startDate: '2019-03-31', endDate: '2024-02-29',
            fee: '1.49', flat: '2.99', mode: 'manual', provider: 'coinbase', manualPrice: '64000',
            currency: 'EUR', startingBtc: '0.25', startingCost: '18000', esc: '5',
        })).toEqual({
            amount: 75.5, frequency: 'monthly', startDate: '2019-03-31', endDate: '2024-02-29',
            feePercentage: 1.49, flatFee: 2.99, priceMode: 'manual', provider: 'coinbase', manualPrice: 64_000,
            currency: 'EUR', startingBtc: 0.25, startingAvgCost: 18_000, annualEscalationPct: 5,
        });
    });

    it.each([
        ['amount', '1e308', 'amount', URL_PARAM_LIMITS.maxAmount],
        ['manualPrice', '5e12', 'manualPrice', URL_PARAM_LIMITS.maxAmount],
        ['startingCost', '5e12', 'startingAvgCost', URL_PARAM_LIMITS.maxAmount],
        ['startingBtc', '5e7', 'startingBtc', URL_PARAM_LIMITS.maxStartingBtc],
        ['esc', '999', 'annualEscalationPct', URL_PARAM_LIMITS.maxEscalationPct],
    ] as const)('clamps %s=%s to its ceiling', (param, raw, field, ceiling) => {
        expect(decodeParams({ [param]: raw })?.[field]).toBe(ceiling);
    });

    it('clamps the dates to the range a plan can run over', () => {
        expect(decodeParams({ startDate: '2009-01-03' })?.startDate).toBe(EARLIEST_PRICE_DATE);
        expect(decodeParams({ startDate: '0050-01-01' })?.startDate).toBe(EARLIEST_PRICE_DATE);
        expect(decodeParams({ startDate: EARLIEST_PRICE_DATE })?.startDate).toBe(EARLIEST_PRICE_DATE);
        expect(decodeParams({ endDate: '2999-12-31' })?.endDate).toBe(MAX_END_DATE);
        expect(decodeParams({ endDate: '9999-12-31' })?.endDate).toBe(MAX_END_DATE);
        expect(decodeParams({ endDate: MAX_END_DATE })?.endDate).toBe(MAX_END_DATE);
        // A future end date inside the range is a supported projection and is kept.
        expect(decodeParams({ endDate: '2060-06-30' })?.endDate).toBe('2060-06-30');
    });

    it.each([
        ['fee', '51'],
        ['fee', '-1'],
        ['fee', 'abc'],
        ['flat', '-0.01'],
        ['flat', '1000001'],
        ['flat', 'free'],
        ['amount', '-5'],
        ['amount', 'abc'],
        ['manualPrice', '0'],
        ['manualPrice', '-1'],
        ['startingBtc', '-1'],
        ['startingCost', '-1'],
        ['esc', '-5'],
        ['frequency', 'hourly'],
        ['mode', 'live'],
        ['provider', 'binance'],
        ['currency', 'XYZ'],
        ['currency', 'usd'],
        ['startDate', '2021-02-30'],
        ['startDate', '2023-02-29'],
        ['startDate', '2021-13-01'],
        ['startDate', '2021-00-10'],
        ['endDate', '2021-04-31'],
        ['endDate', '20300-10-11'],
        ['endDate', '2021-1-5'],
        ['endDate', '2021-01-05T00:00:00Z'],
    ])('drops %s=%s', (param, raw) => {
        // Dropped, not clamped: the calculator falls back to its default for
        // that field and the public API turns the drop into a 400.
        expect(decodeParams({ [param]: raw })).toBeNull();
    });

    it.each(['amount', 'fee', 'flat', 'manualPrice', 'startingBtc', 'startingCost', 'esc'] as const)(
        'does not read a blank %s as zero',
        (param) => {
            // Number(' ') is 0: a blank fee would run the plan at 0% instead of the default.
            for (const blank of [' ', '\t', ' \n ']) {
                expect(decodeParams({ [param]: blank })).toBeNull();
            }
            // A number with space around it is still that number.
            expect(Object.values(decodeParams({ [param]: ' 1 ' }) ?? {})).toEqual([1]);
        },
    );

    it('accepts real calendar dates, leap days included', () => {
        expect(decodeParams({ startDate: '2024-02-29' })?.startDate).toBe('2024-02-29');
        expect(decodeParams({ endDate: '2020-02-29' })?.endDate).toBe('2020-02-29');
        expect(decodeParams({ endDate: '2021-12-31' })?.endDate).toBe('2021-12-31');
    });

    it('accepts an explicit zero as a value, not as "missing"', () => {
        expect(decodeParams({ amount: '0', startingBtc: '0', startingCost: '0', esc: '0', flat: '0', fee: '0' })).toEqual({
            amount: 0, startingBtc: 0, startingAvgCost: 0, annualEscalationPct: 0, flatFee: 0, feePercentage: 0,
        });
    });

    it('accepts the boundary values of the range-checked params', () => {
        expect(decodeParams({ fee: '50' })?.feePercentage).toBe(URL_PARAM_LIMITS.maxFeePct);
        expect(decodeParams({ flat: '1000000' })?.flatFee).toBe(URL_PARAM_LIMITS.maxFlatFee);
    });

    it('publishes the bounds it enforces', () => {
        expect(URL_PARAM_LIMITS).toEqual({
            maxAmount: 1e9,
            maxFeePct: 50,
            maxFlatFee: 1e6,
            maxStartingBtc: 21_000_000,
            maxEscalationPct: 200,
        });
    });
});

// ── Round trips ───────────────────────────────────────────────────────────────

describe('share links round-trip', () => {
    const plans: [string, EncodeInput][] = [
        ['the default plan', plan()],
        ['a non-USD plan', plan({ currency: 'JPY', amount: 5_000 })],
        ['a manual-price plan', plan({ priceMode: 'manual', manualPrice: 64_000 })],
        ['a starting stack with a stated cost', plan({ startingBtc: 0.5, startingAvgCost: 18_000 })],
        ['a yearly raise', plan({ annualEscalationPct: 10 })],
        ['a flat fee', plan({ flatFee: 2.99, feePercentage: 0 })],
        ['a hold-only plan (amount 0 with a stack)', plan({ amount: 0, startingBtc: 1 })],
        ['a monthly Coinbase plan from the first priced day', plan({ frequency: 'monthly', provider: 'coinbase', startDate: EARLIEST_PRICE_DATE })],
        ['a projection to the last allowed day', plan({ endDate: MAX_END_DATE })],
        ['everything at once', plan({
            amount: 123.45, frequency: 'biweekly', feePercentage: 1.49, flatFee: 0.99, priceMode: 'manual',
            manualPrice: 99_999, currency: 'GBP', startingBtc: 0.12345678, startingAvgCost: 27_500.5, annualEscalationPct: 7.5,
        })],
    ];

    it.each(plans)('%s survives encode, decode and encode again unchanged', (_name, input) => {
        const query = encodeParams(input);
        const decoded = decodeParams(parse(query));
        expect(decoded).not.toBeNull();
        const again = encodeParams({
            amount: decoded!.amount!,
            frequency: decoded!.frequency!,
            startDate: decoded!.startDate!,
            endDate: decoded!.endDate!,
            feePercentage: decoded!.feePercentage!,
            priceMode: decoded!.priceMode!,
            provider: decoded!.provider!,
            // Not in the link outside manual mode; the calculator keeps its own.
            manualPrice: decoded!.manualPrice ?? input.manualPrice,
            currency: decoded!.currency,
            startingBtc: decoded!.startingBtc,
            startingAvgCost: decoded!.startingAvgCost,
            annualEscalationPct: decoded!.annualEscalationPct,
            flatFee: decoded!.flatFee,
        });
        expect(again).toBe(query);
    });

    it('keeps amount=0 as 0 instead of letting it fall back to the default amount', () => {
        const decoded = decodeParams(parse(encodeParams(plan({ amount: 0, startingBtc: 1 }))));
        expect(decoded?.amount).toBe(0);
    });

    it('hands a USD plan to the recipient as USD', () => {
        const decoded = decodeParams(parse(encodeParams(plan({ currency: 'USD' }))));
        expect(decoded?.currency).toBe('USD');
        expect(impliedSessionCurrency(decoded)).toBe('USD');
    });
});

// ── Which currency is a link written in? ──────────────────────────────────────

describe('impliedSessionCurrency', () => {
    it('uses the currency the link names', () => {
        expect(impliedSessionCurrency(decodeParams({ amount: '50', currency: 'EUR' }))).toBe('EUR');
        expect(impliedSessionCurrency(decodeParams({ currency: 'JPY' }))).toBe('JPY');
        // USD named outright is a choice too, even with no money beside it.
        expect(impliedSessionCurrency(decodeParams({ currency: 'USD' }))).toBe('USD');
    });

    it('reads a link with money and no currency as USD', () => {
        expect(impliedSessionCurrency(decodeParams({ amount: '50' }))).toBe('USD');
        expect(impliedSessionCurrency(decodeParams({ startingBtc: '1', startingCost: '20000' }))).toBe('USD');
        expect(impliedSessionCurrency(decodeParams({ flat: '2.99' }))).toBe('USD');
        // Zero is still an amount.
        expect(impliedSessionCurrency(decodeParams({ amount: '0' }))).toBe('USD');
    });

    it('falls back to USD when the currency given is not one we support', () => {
        expect(impliedSessionCurrency(decodeParams({ amount: '50', currency: 'XYZ' }))).toBe('USD');
    });

    it('leaves the visitor\'s own currency alone when the link carries no money', () => {
        expect(impliedSessionCurrency(decodeParams({ frequency: 'monthly' }))).toBeUndefined();
        expect(impliedSessionCurrency(decodeParams({ startDate: '2020-01-01', endDate: '2024-01-01' }))).toBeUndefined();
        // These are USD or unitless whatever the display currency is.
        expect(impliedSessionCurrency(decodeParams({ mode: 'manual', manualPrice: '64000' }))).toBeUndefined();
        expect(impliedSessionCurrency(decodeParams({ startingBtc: '1', esc: '10', fee: '1' }))).toBeUndefined();
        expect(impliedSessionCurrency(null)).toBeUndefined();
    });
});

// ── A crafted link cannot break the maths ─────────────────────────────────────

describe('crafted links', () => {
    it('stay finite and run to the last day at every extreme at once', () => {
        const decoded = decodeParams(parse(
            'amount=1e308&frequency=daily&startDate=0001-01-01&endDate=9999-12-31&fee=0&esc=999'
            + '&startingBtc=1e99&startingCost=1e99',
        ));
        expect(decoded).toMatchObject({ startDate: EARLIEST_PRICE_DATE, endDate: MAX_END_DATE });

        const result = calculateDca(
            {
                amount: decoded!.amount!,
                frequency: decoded!.frequency!,
                startDate: new Date(parseUtcDate(decoded!.startDate!)),
                endDate: new Date(parseUtcDate(decoded!.endDate!)),
                feePercentage: decoded!.feePercentage!,
                priceMode: 'api',
                manualPrice: 0,
                startingBtc: decoded!.startingBtc,
                startingAvgCost: decoded!.startingAvgCost,
                annualEscalationPct: decoded!.annualEscalationPct,
            },
            Array.from({ length: 30 }, (_, i): [number, number] => [EARLIEST_PRICE_TS + i * DAY_MS, 0.07]),
            1e9,
            Date.UTC(2026, 9, 12),
        );

        for (const value of [result.totalInvested, result.btcAccumulated, result.averageCost, result.currentValue, result.profit, result.roi]) {
            expect(Number.isFinite(value)).toBe(true);
        }
        // Not cut short: one buy for every day of the clamped range, ending on its last day.
        const buys = result.breakdown.filter((row) => !row.isStartingStack);
        expect(buys.length).toBe((MAX_END_TS - EARLIEST_PRICE_TS) / DAY_MS + 1);
        expect(buys[buys.length - 1].date.slice(0, 10)).toBe(MAX_END_DATE);
    });
});

import { describe, expect, it } from 'vitest';
import {
    EXCHANGE_FEES,
    FEE_CHECK_MAX_AGE_DAYS,
    FEE_EXAMPLE_IDS,
    exchangeFeeById,
    feeCostLabel,
    feeCostUsd,
    feeExamplePair,
    feePresetsAsOf,
    feeTiersAsOf,
    feesCheckIsStale,
    feesLastVerified,
    hasPublishedFee,
    membershipBreakEvenUsdPerMonth,
    plainRateLabel,
    resolveExchangeFee,
    resolveExchangeFees,
    type ExchangeFeeRecord,
} from './exchangeFees';
import { calculateDca } from '@/utils/dca';
import { URL_PARAM_LIMITS } from '@/utils/urlParams';

/** UTC midnight of an ISO day, for readable fixtures. */
const day = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const DAY_MS = 86_400_000;

const isRealIsoDay = (value: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(day(value)).toISOString().slice(0, 10) === value;

/**
 * The case this registry exists for: a platform at 1% that ran a 0.5% offer
 * through 2026-09-08. The site kept showing 0.5% for a month after it ended.
 */
const PROMO_ROW: ExchangeFeeRecord = {
    id: 'promo-row',
    name: 'Promo Row',
    percent: 1,
    flatUsd: 0,
    rateLabel: '1%',
    includes: 'fee',
    note: 'fee only',
    detail: 'Standard terms.',
    sources: [{ label: 'Fixture', url: 'https://example.com/fees' }],
    verifiedOn: '2026-08-01',
    promo: {
        validUntil: '2026-09-08',
        terms: { percent: 0.5, flatUsd: 0, rateLabel: '0.5%', includes: 'fee', note: 'promotional rate' },
    },
};

const FLAT_ROW: ExchangeFeeRecord = {
    id: 'flat-row',
    name: 'Flat Row',
    percent: 0.5,
    flatUsd: 2.99,
    rateLabel: '$2.99 + 0.5%',
    includes: 'both',
    note: 'flat fee per buy plus spread',
    detail: 'Fixture.',
    sources: [{ label: 'Fixture', url: 'https://example.com/fees' }],
    verifiedOn: '2026-08-01',
};

const UNPUBLISHED_ROW: ExchangeFeeRecord = {
    id: 'unpublished-row',
    name: 'Unpublished Row',
    percent: null,
    flatUsd: 0,
    rateLabel: 'Set per order',
    includes: null,
    note: 'no fixed rate published',
    detail: 'Fixture.',
    sources: [{ label: 'Fixture', url: 'https://example.com/fees' }],
    verifiedOn: '2026-08-01',
};

// ── The registry itself ───────────────────────────────────────────────────────

describe('EXCHANGE_FEES', () => {
    it('gives every row a unique id', () => {
        const ids = EXCHANGE_FEES.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('dates every row with a real UTC day and at least one https source', () => {
        for (const row of EXCHANGE_FEES) {
            expect(isRealIsoDay(row.verifiedOn), `${row.id} verifiedOn`).toBe(true);
            expect(row.sources.length, `${row.id} sources`).toBeGreaterThan(0);
            for (const source of row.sources) {
                expect(source.url.startsWith('https://'), `${row.id} ${source.url}`).toBe(true);
                expect(source.label.length).toBeGreaterThan(0);
            }
            if (row.promo) expect(isRealIsoDay(row.promo.validUntil), `${row.id} promo`).toBe(true);
            if (row.membership) expect(row.membership.source.url.startsWith('https://')).toBe(true);
        }
    });

    it('says what each figure includes exactly when there is a figure', () => {
        for (const row of EXCHANGE_FEES) {
            for (const terms of row.promo ? [row, row.promo.terms] : [row]) {
                expect(terms.percent === null, `${row.id} includes`).toBe(terms.includes === null);
                expect(terms.note.length, `${row.id} note`).toBeGreaterThan(0);
                expect(terms.rateLabel.length, `${row.id} rateLabel`).toBeGreaterThan(0);
            }
        }
    });

    // The fee page explains a flat fee as a fixed charge per order and says which
    // rows carry one, and the calculator has a "Flat fee per buy" field. A row
    // that called its percentage "flat" would contradict both.
    it('calls a fee flat only where there is a fixed charge per buy', () => {
        for (const row of EXCHANGE_FEES) {
            const allTerms = row.promo ? [row, row.promo.terms] : [row];
            for (const terms of allTerms) {
                if (terms.flatUsd === 0) expect(terms.note, `${row.id} note`).not.toMatch(/\bflat\b/i);
            }
            if (allTerms.every((terms) => terms.flatUsd === 0)) {
                expect(row.detail, `${row.id} detail`).not.toMatch(/\bflat\b/i);
            }
        }
    });

    it('keeps every figure inside what the calculator and its links accept', () => {
        for (const row of EXCHANGE_FEES) {
            for (const terms of row.promo ? [row, row.promo.terms] : [row]) {
                if (terms.percent !== null) {
                    expect(terms.percent).toBeGreaterThanOrEqual(0);
                    expect(terms.percent).toBeLessThanOrEqual(URL_PARAM_LIMITS.maxFeePct);
                }
                expect(terms.flatUsd).toBeGreaterThanOrEqual(0);
                expect(terms.flatUsd).toBeLessThanOrEqual(URL_PARAM_LIMITS.maxFlatFee);
            }
        }
    });
});

// ── Resolve as of a date ──────────────────────────────────────────────────────

describe('resolveExchangeFee', () => {
    it('applies a promotion through its last UTC day and not a millisecond longer', () => {
        const lastMoment = resolveExchangeFee(PROMO_ROW, day('2026-09-09') - 1);
        expect(lastMoment.percent).toBe(0.5);
        expect(lastMoment.rateLabel).toBe('0.5%');
        expect(lastMoment.note).toBe('promotional rate');
        expect(lastMoment.promo).toEqual({ validUntil: '2026-09-08', thenRateLabel: '1%' });

        const nextDay = resolveExchangeFee(PROMO_ROW, day('2026-09-09'));
        expect(nextDay.percent).toBe(1);
        expect(nextDay.rateLabel).toBe('1%');
        expect(nextDay.note).toBe('fee only');
        expect(nextDay.promo).toBeNull();
    });

    it('still charges the standard rate a month after the promotion ended', () => {
        // 2026-10-11 is the day the stale 0.5% was found on the live site.
        expect(resolveExchangeFee(PROMO_ROW, day('2026-10-11')).percent).toBe(1);
    });

    it('carries the promotion into the calculator presets and the page tiers', () => {
        const during = day('2026-09-01');
        const after = day('2026-09-09');
        expect(feePresetsAsOf(during, [PROMO_ROW])[0].feePercentage).toBe(0.5);
        expect(feePresetsAsOf(during, [PROMO_ROW])[0].label).toBe('Promo Row 0.5%');
        expect(feePresetsAsOf(after, [PROMO_ROW])[0].feePercentage).toBe(1);
        expect(feeTiersAsOf(during, [PROMO_ROW]).map((t) => t.percent)).toEqual([0.5]);
        expect(feeTiersAsOf(after, [PROMO_ROW]).map((t) => t.percent)).toEqual([1]);
    });

    it('leaves a row without a promotion unchanged on any date', () => {
        for (const asOf of [day('2020-01-01'), day('2026-10-12'), day('2040-01-01')]) {
            const resolved = resolveExchangeFee(FLAT_ROW, asOf);
            expect(resolved.percent).toBe(0.5);
            expect(resolved.flatUsd).toBe(2.99);
            expect(resolved.promo).toBeNull();
            expect(resolved.membership).toBeNull();
        }
    });

    it('treats an unusable instant as now instead of throwing', () => {
        expect(() => resolveExchangeFee(PROMO_ROW, Number.NaN)).not.toThrow();
    });

    it('resolves the whole registry in display order', () => {
        expect(resolveExchangeFees(day('2026-10-12')).map((r) => r.id)).toEqual(EXCHANGE_FEES.map((r) => r.id));
    });
});

// ── Calculator presets ────────────────────────────────────────────────────────

describe('feePresetsAsOf', () => {
    it('offers a chip only for platforms that publish a figure', () => {
        const presets = feePresetsAsOf(day('2026-10-12'), [PROMO_ROW, UNPUBLISHED_ROW, FLAT_ROW]);
        expect(presets.map((p) => p.id)).toEqual(['promo-row', 'flat-row']);
    });

    it('passes a flat component through so the engine can charge it per buy', () => {
        const [preset] = feePresetsAsOf(day('2026-10-12'), [FLAT_ROW]);
        expect(preset).toEqual({
            id: 'flat-row',
            name: 'Flat Row',
            feePercentage: 0.5,
            flatFee: 2.99,
            label: 'Flat Row $2.99 + 0.5%',
            includes: 'both',
            note: 'flat fee per buy plus spread',
        });
    });

    it('has unique ids on the live registry, which is what the pressed state must key on', () => {
        const presets = feePresetsAsOf();
        expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
        expect(presets.length).toBeGreaterThan(0);
        for (const preset of presets) {
            expect(Number.isFinite(preset.feePercentage)).toBe(true);
            expect(Number.isFinite(preset.flatFee)).toBe(true);
            expect(preset.label.startsWith(preset.name)).toBe(true);
        }
    });
});

describe('plainRateLabel', () => {
    it('writes the bare numbers', () => {
        expect(plainRateLabel(1, 0)).toBe('1%');
        expect(plainRateLabel(0.22, 0)).toBe('0.22%');
        expect(plainRateLabel(0, 0)).toBe('0%');
        expect(plainRateLabel(0, 1)).toBe('$1 flat');
        expect(plainRateLabel(0.5, 2.99)).toBe('$2.99 + 0.5%');
    });
});

// ── Cost over a schedule ──────────────────────────────────────────────────────

describe('feeCostUsd', () => {
    it('is null when the platform publishes no figure', () => {
        expect(feeCostUsd(resolveExchangeFee(UNPUBLISHED_ROW), 13_050, 261)).toBeNull();
    });

    it('is zero for an empty schedule', () => {
        expect(feeCostUsd({ percent: 1, flatUsd: 0 }, 0, 0)).toBe(0);
    });

    it('charges a percentage on the total', () => {
        expect(feeCostUsd({ percent: 1, flatUsd: 0 }, 13_050, 261)).toBeCloseTo(130.5, 10);
    });

    // The engine is the reference: the table must never disagree with the calculator.
    const engineFees = (amount: number, feePercentage: number, flatFee: number) => {
        const result = calculateDca({
            amount,
            frequency: 'weekly',
            startDate: new Date(day('2024-01-01')),
            endDate: new Date(day('2024-12-30')),
            feePercentage,
            flatFee,
            priceMode: 'manual',
            manualPrice: 100,
        });
        return { feesPaid: result.stats?.feesPaid ?? NaN, invested: result.totalInvested, buys: result.breakdown.length };
    };

    it('matches the engine for a percentage plus a flat fee per buy', () => {
        const { feesPaid, invested, buys } = engineFees(50, 0.5, 2.99);
        expect(buys).toBe(53);
        expect(feesPaid).toBeCloseTo(53 * (0.25 + 2.99), 8);
        expect(feeCostUsd({ percent: 0.5, flatUsd: 2.99 }, invested, buys)).toBeCloseTo(feesPaid, 8);
    });

    it('matches the engine when the flat fee swallows the whole buy', () => {
        const { feesPaid, invested, buys } = engineFees(2, 1, 2.99);
        expect(feesPaid).toBeCloseTo(invested, 8);
        expect(feeCostUsd({ percent: 1, flatUsd: 2.99 }, invested, buys)).toBeCloseTo(feesPaid, 8);
    });
});

describe('feeCostLabel', () => {
    it('prints a cost under one unit to the cent, like any other amount of money', () => {
        // River on a $50 buy: 0.25% is 12.5 cents.
        expect(feeCostLabel(0.125, '$')).toBe('$0.13');
        expect(feeCostLabel(0.11, '$')).toBe('$0.11');
        expect(feeCostLabel(0.5, '$')).toBe('$0.50');
        // The same buys shown in euros.
        expect(feeCostLabel(0.0984, '€')).toBe('€0.10');
        expect(feeCostLabel(0.4472, '€')).toBe('€0.45');
    });

    it('keeps two decimals up to 1,000 and whole units from there', () => {
        expect(feeCostLabel(0, '$')).toBe('$0.00');
        expect(feeCostLabel(11, '$')).toBe('$11.00');
        expect(feeCostLabel(130.5, '$')).toBe('$130.50');
        expect(feeCostLabel(999.99, 'C$')).toBe('C$999.99');
        expect(feeCostLabel(1000, '$')).toBe('$1,000');
        expect(feeCostLabel(91_350.4, '$')).toBe('$91,350');
    });

    it('uses whole units for a currency without a minor unit', () => {
        expect(feeCostLabel(17.4, '¥', 0)).toBe('¥17');
        expect(feeCostLabel(20_697.3, '¥', 0)).toBe('¥20,697');
        expect(feeCostLabel(0, '¥', 0)).toBe('¥0');
    });

    it('never rounds a real cost down to zero', () => {
        expect(feeCostLabel(0.0022, '$')).toBe('under $0.01');
        expect(feeCostLabel(0.35, '¥', 0)).toBe('under ¥1');
        expect(feeCostLabel(0.005, '$')).toBe('$0.01');
    });
});

// ── Page helpers ──────────────────────────────────────────────────────────────

describe('feeTiersAsOf', () => {
    it('lists each distinct published cost once, cheapest first', () => {
        const twin: ExchangeFeeRecord = { ...PROMO_ROW, id: 'twin', promo: undefined };
        const tiers = feeTiersAsOf(day('2026-10-12'), [PROMO_ROW, FLAT_ROW, UNPUBLISHED_ROW, twin]);
        expect(tiers).toEqual([
            { percent: 1, flatUsd: 0, ids: ['promo-row', 'twin'] },
            { percent: 0.5, flatUsd: 2.99, ids: ['flat-row'] },
        ]);
    });

    it('covers every published row of the live registry', () => {
        const published = resolveExchangeFees().filter(hasPublishedFee);
        const tierIds = feeTiersAsOf().flatMap((t) => t.ids);
        expect([...tierIds].sort()).toEqual(published.map((r) => r.id).sort());
    });
});

describe('feeExamplePair', () => {
    it('names two live rows the fee page can build its sentences on', () => {
        const pair = feeExamplePair();
        // Null here means the page has silently fallen back to its generic copy:
        // pick other rows in FEE_EXAMPLE_IDS.
        expect(pair).not.toBeNull();
        if (!pair) return;
        expect(pair.higher.id).toBe(FEE_EXAMPLE_IDS.higher);
        expect(pair.lower.id).toBe(FEE_EXAMPLE_IDS.lower);
        expect(pair.higher.percent).toBeGreaterThan(pair.lower.percent);
        expect(pair.lower.percent).toBeGreaterThan(0);

        const tierRates = feeTiersAsOf().filter((t) => t.flatUsd === 0).map((t) => t.percent);
        expect(tierRates).toContain(pair.higher.percent);
        expect(tierRates).toContain(pair.lower.percent);
    });

    it('looks rows up by id', () => {
        expect(exchangeFeeById(FEE_EXAMPLE_IDS.higher).id).toBe(FEE_EXAMPLE_IDS.higher);
    });
});

describe('membershipBreakEvenUsdPerMonth', () => {
    it('is the monthly volume whose waived fee equals the price of the plan', () => {
        const breakEven = membershipBreakEvenUsdPerMonth({
            percent: 1,
            membership: {
                name: 'Plan',
                monthlyUsd: 4.99,
                annualUsd: 49.99,
                feeFreeUsdPerMonth: 10_000,
                note: '',
                source: { label: 'Fixture', url: 'https://example.com' },
            },
        });
        expect(breakEven?.monthlyPlan).toBeCloseTo(499, 8);
        expect(breakEven?.annualPlan).toBeCloseTo(416.5833, 3);
    });

    it('is null without a membership or without a fee to waive', () => {
        expect(membershipBreakEvenUsdPerMonth({ percent: 1, membership: null })).toBeNull();
        expect(membershipBreakEvenUsdPerMonth(resolveExchangeFee(UNPUBLISHED_ROW))).toBeNull();
    });

    it('stays below the waiver cap for every live membership, so the sentence built on it holds', () => {
        for (const fee of resolveExchangeFees()) {
            const breakEven = membershipBreakEvenUsdPerMonth(fee);
            if (!breakEven || !fee.membership) continue;
            expect(breakEven.monthlyPlan).toBeLessThan(fee.membership.feeFreeUsdPerMonth);
            expect(breakEven.annualPlan).toBeLessThan(breakEven.monthlyPlan);
        }
    });
});

// ── Freshness ─────────────────────────────────────────────────────────────────

describe('check dates', () => {
    const older: ExchangeFeeRecord = { ...FLAT_ROW, id: 'older', verifiedOn: '2026-03-01' };

    it('reports the oldest check, so one label never over-claims', () => {
        expect(feesLastVerified([PROMO_ROW, older, FLAT_ROW])).toBe('2026-03-01');
    });

    it('flags the table once the oldest check is past the limit', () => {
        const checked = day('2026-03-01');
        expect(feesCheckIsStale(checked, [older])).toBe(false);
        expect(feesCheckIsStale(checked + FEE_CHECK_MAX_AGE_DAYS * DAY_MS, [older])).toBe(false);
        expect(feesCheckIsStale(checked + (FEE_CHECK_MAX_AGE_DAYS + 1) * DAY_MS, [older])).toBe(true);
    });

    it('treats a registry with no usable date as stale', () => {
        expect(feesCheckIsStale(day('2026-10-12'), [])).toBe(true);
    });
});

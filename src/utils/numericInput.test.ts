import { describe, expect, it } from 'vitest';
import { carryPriceAcrossRate, limitMessage, readNumericText, readTypedBeforeLoad, roundTo2Sig, signedPercent } from './numericInput';

describe('readNumericText', () => {
    const limits = { min: -95, max: 500 };

    it('reads a number inside the range as itself', () => {
        expect(readNumericText('12.5', limits)).toEqual({ value: 12.5, hit: null });
        expect(readNumericText(' -30 ', limits)).toEqual({ value: -30, hit: null });
        expect(readNumericText('0', limits)).toEqual({ value: 0, hit: null });
    });

    it('reads empty and half-typed text as nothing yet, never as zero', () => {
        // The regression: a cleared field read as 0, 0 was written back, and
        // "-30" typed next arrived as "030".
        for (const text of ['', '   ', '-', '.', '-.', '1e', 'abc', '1,000']) {
            expect(readNumericText(text, limits)).toEqual({ value: null, hit: null });
        }
    });

    it('replaces a number past either end with that end, and says which', () => {
        expect(readNumericText('900', limits)).toEqual({ value: 500, hit: { bound: 'max', used: 500 } });
        expect(readNumericText('-100', limits)).toEqual({ value: -95, hit: { bound: 'min', used: -95 } });
        // The ends themselves are inside the range.
        expect(readNumericText('500', limits)).toEqual({ value: 500, hit: null });
        expect(readNumericText('-95', limits)).toEqual({ value: -95, hit: null });
    });

    it('does not let Infinity through as a number', () => {
        expect(readNumericText('Infinity', limits)).toEqual({ value: null, hit: null });
        expect(readNumericText('1e999', limits)).toEqual({ value: null, hit: null });
    });
});

describe('readTypedBeforeLoad', () => {
    const limits = { min: 0, max: 1000 };

    it('finds nothing to take over in a field nobody touched', () => {
        expect(readTypedBeforeLoad('50', '50', false, limits)).toBeNull();
        expect(readTypedBeforeLoad('50', '50', true, limits)).toBeNull();
    });

    it('takes over a number typed before the page loaded, whether or not the cursor is still there', () => {
        // The regression: the field went on showing 123 over a result for 50,
        // then snapped back to 50.
        expect(readTypedBeforeLoad('123', '50', true, limits)).toEqual({ kind: 'adopt', text: '123', value: 123, hit: null });
        expect(readTypedBeforeLoad('123', '50', false, limits)).toEqual({ kind: 'adopt', text: '123', value: 123, hit: null });
        expect(readTypedBeforeLoad('0', '50', false, limits)).toEqual({ kind: 'adopt', text: '0', value: 0, hit: null });
    });

    it('caps a number typed past the range and says so, like any typed number', () => {
        expect(readTypedBeforeLoad('5000', '50', true, limits)).toEqual({
            kind: 'adopt', text: '5000', value: 1000, hit: { bound: 'max', used: 1000 },
        });
    });

    it('keeps half-typed text in a field the visitor is still in, without a number', () => {
        expect(readTypedBeforeLoad('', '50', true, limits)).toEqual({ kind: 'adopt', text: '', value: null, hit: null });
        expect(readTypedBeforeLoad('1e', '50', true, limits)).toEqual({ kind: 'adopt', text: '1e', value: null, hit: null });
    });

    it('puts the number back in a field that was emptied and left', () => {
        expect(readTypedBeforeLoad('', '50', false, limits)).toEqual({ kind: 'restore' });
        expect(readTypedBeforeLoad('-', '50', false, limits)).toEqual({ kind: 'restore' });
    });

    it('counts the same number written another way as typed', () => {
        // "50.0" is not what the page rendered, so the field is the visitor's.
        expect(readTypedBeforeLoad('50.0', '50', true, limits)).toEqual({ kind: 'adopt', text: '50.0', value: 50, hit: null });
    });
});

describe('limitMessage', () => {
    it('names the field and the limit it ran into', () => {
        expect(limitMessage('The fee', { bound: 'max', used: 50 }, (n) => `${n}%`)).toBe('The fee is capped at 50%.');
        expect(limitMessage('The amount', { bound: 'min', used: 0 }, (n) => `$${n}`)).toBe('The amount cannot go below $0.');
    });

    it('formats large and fractional limits readably by default', () => {
        expect(limitMessage('The amount', { bound: 'max', used: 1_000_000_000 })).toBe('The amount is capped at 1,000,000,000.');
        expect(limitMessage('The daily amount', { bound: 'min', used: 0.01 })).toBe('The daily amount cannot go below 0.01.');
    });
});

describe('signedPercent', () => {
    it('keeps one decimal below 100 and none from there up', () => {
        expect(signedPercent(93.64)).toBe('+93.6%');
        expect(signedPercent(-63.46)).toBe('-63.5%');
        expect(signedPercent(99.94)).toBe('+99.9%');
        expect(signedPercent(100)).toBe('+100%');
        expect(signedPercent(751.4)).toBe('+751%');
    });

    it('groups thousands', () => {
        expect(signedPercent(15061.2)).toBe('+15,061%');
        expect(signedPercent(118613181.9)).toBe('+118,613,182%');
    });

    it('gives a figure that rounds to zero no sign', () => {
        expect(signedPercent(0)).toBe('0.0%');
        expect(signedPercent(-0.04)).toBe('0.0%');
        expect(signedPercent(0.04)).toBe('0.0%');
        expect(signedPercent(-0.06)).toBe('-0.1%');
    });
});

describe('roundTo2Sig', () => {
    it('keeps two significant figures', () => {
        expect(roundTo2Sig(89_238)).toBe(89_000);
        expect(roundTo2Sig(15_825_000)).toBe(16_000_000);
        expect(roundTo2Sig(150_000)).toBe(150_000);
    });

    it('gives 0 for anything that is not a positive number', () => {
        for (const n of [0, -5, NaN, Infinity]) expect(roundTo2Sig(n)).toBe(0);
    });
});

describe('carryPriceAcrossRate', () => {
    const PRESETS = [100_000, 150_000, 250_000, 500_000, 1_000_000];
    const usd = { code: 'USD', rate: 1 };

    it('leaves the value alone when neither the currency nor its rate changed', () => {
        const eur = { code: 'EUR', rate: 0.89238 };
        expect(carryPriceAcrossRate(89_000, eur, { ...eur }, PRESETS)).toBe(89_000);
        expect(carryPriceAcrossRate(123_456, eur, { ...eur }, PRESETS)).toBe(123_456);
    });

    it('moves a preset to where its button is at the new rate', () => {
        // The dated rate was shown first; today's rate arrives under the same code.
        const dated = { code: 'EUR', rate: 0.86 };
        const live = { code: 'EUR', rate: 0.8745 };
        expect(roundTo2Sig(100_000 * dated.rate)).toBe(86_000);
        expect(carryPriceAcrossRate(86_000, dated, live, PRESETS)).toBe(roundTo2Sig(100_000 * live.rate));
        expect(carryPriceAcrossRate(86_000, dated, live, PRESETS)).toBe(87_000);
    });

    it('works from the dollar figure, not from the rounded number', () => {
        // $250,000 is 124,900 at the first rate (shown as 120,000) and 125,100
        // at the second (shown as 130,000). Converting the 120,000 that was on
        // screen gives 120,192, which rounds back to 120,000: one step below
        // the button, which would no longer read as pressed.
        const before = { code: 'XXX', rate: 0.4996 };
        const after = { code: 'XXX', rate: 0.5004 };
        expect(roundTo2Sig(250_000 * before.rate)).toBe(120_000);
        expect(roundTo2Sig((120_000 / before.rate) * after.rate)).toBe(120_000);
        expect(carryPriceAcrossRate(120_000, before, after, PRESETS)).toBe(130_000);
    });

    it('leaves a typed price as typed when only the rate is corrected', () => {
        const dated = { code: 'EUR', rate: 0.86 };
        const live = { code: 'EUR', rate: 0.8745 };
        expect(carryPriceAcrossRate(135_000, dated, live, PRESETS)).toBe(135_000);
        // The same with no presets at all.
        expect(carryPriceAcrossRate(86_000, dated, live)).toBe(86_000);
    });

    it('converts on a change of currency: a preset exactly, a typed price to two figures', () => {
        const eur = { code: 'EUR', rate: 0.89238 };
        const jpy = { code: 'JPY', rate: 158.25 };
        expect(carryPriceAcrossRate(100_000, usd, eur, PRESETS)).toBe(89_000);
        expect(carryPriceAcrossRate(89_000, eur, jpy, PRESETS)).toBe(roundTo2Sig(100_000 * jpy.rate));
        expect(carryPriceAcrossRate(89_000, eur, usd, PRESETS)).toBe(100_000);
        // 135,000 EUR is about $151,281.
        expect(carryPriceAcrossRate(135_000, eur, usd, PRESETS)).toBe(150_000);
    });

    it('does nothing with a rate that cannot be used', () => {
        expect(carryPriceAcrossRate(100_000, usd, { code: 'EUR', rate: 0 }, PRESETS)).toBe(100_000);
        expect(carryPriceAcrossRate(100_000, { code: 'EUR', rate: NaN }, usd, PRESETS)).toBe(100_000);
    });
});

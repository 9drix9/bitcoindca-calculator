import { describe, expect, it } from 'vitest';
import { readTypedAmount } from './typedAmount';

describe('readTypedAmount', () => {
    it('reads text with no comma exactly as Number() does', () => {
        expect(readTypedAmount('4000')).toBe(4000);
        expect(readTypedAmount('0.5')).toBe(0.5);
        expect(readTypedAmount('-20')).toBe(-20);
        expect(readTypedAmount(' 12.5 ')).toBe(12.5);
        // A lone dot cannot be told from a decimal point, so it stays one.
        expect(readTypedAmount('4.000')).toBe(4);
        expect(readTypedAmount('4.000', 'decimal')).toBe(4);
    });

    it('returns null, never 0, for empty and half-typed text', () => {
        for (const text of ['', '   ', '-', '.', '-.', ',', 'abc', '$4,000', 'Infinity']) {
            expect(readTypedAmount(text), JSON.stringify(text)).toBeNull();
            expect(readTypedAmount(text, 'decimal'), JSON.stringify(text)).toBeNull();
        }
    });

    describe("'decimal': a bitcoin amount", () => {
        it('reads a single comma as the decimal mark', () => {
            expect(readTypedAmount('0,5', 'decimal')).toBe(0.5);
            expect(readTypedAmount('1,5', 'decimal')).toBe(1.5);
            expect(readTypedAmount('0,05', 'decimal')).toBe(0.05);
            expect(readTypedAmount('0,125', 'decimal')).toBe(0.125);
            expect(readTypedAmount('0,00000001', 'decimal')).toBe(1e-8);
            expect(readTypedAmount(',5', 'decimal')).toBe(0.5);
            expect(readTypedAmount('5,', 'decimal')).toBe(5);
            expect(readTypedAmount(' 0,5 ', 'decimal')).toBe(0.5);
        });

        it('reads three digits after a single comma as decimals too', () => {
            expect(readTypedAmount('1,250', 'decimal')).toBe(1.25);
        });

        it('still reads a fully grouped number', () => {
            expect(readTypedAmount('1,234.5', 'decimal')).toBe(1234.5);
            expect(readTypedAmount('1.234,5', 'decimal')).toBe(1234.5);
            expect(readTypedAmount('1,000,000', 'decimal')).toBe(1_000_000);
        });
    });

    describe("'auto': money and sats", () => {
        it('reads strict 1,234 form as thousands', () => {
            expect(readTypedAmount('4,000')).toBe(4000);
            expect(readTypedAmount('100,000')).toBe(100_000);
            expect(readTypedAmount('600,000')).toBe(600_000);
            expect(readTypedAmount('50,000,000')).toBe(50_000_000);
            expect(readTypedAmount('1,234,567')).toBe(1_234_567);
            expect(readTypedAmount('4,000.50')).toBe(4000.5);
        });

        it('reads any other single comma as the decimal mark', () => {
            expect(readTypedAmount('0,5')).toBe(0.5);
            expect(readTypedAmount('1,5')).toBe(1.5);
            expect(readTypedAmount('12,5')).toBe(12.5);
            expect(readTypedAmount('1500,50')).toBe(1500.5);
            expect(readTypedAmount('4000,50')).toBe(4000.5);
            // A leading zero is never a thousands group.
            expect(readTypedAmount('0,125')).toBe(0.125);
            expect(readTypedAmount('0,500')).toBe(0.5);
        });

        it('reads dots as grouping when a comma follows them', () => {
            expect(readTypedAmount('4.000,50')).toBe(4000.5);
            expect(readTypedAmount('1.000,5')).toBe(1000.5);
            expect(readTypedAmount('4 000,50')).toBe(4000.5);
            expect(readTypedAmount('4 000,50')).toBe(4000.5);
            expect(readTypedAmount('4 000,50')).toBe(4000.5);
        });
    });

    it('refuses text that is not one properly grouped number', () => {
        for (const text of ['1,2,3', '0,5,', '1,23,456', '1,5.5', '0.5,', '1.23,4']) {
            expect(readTypedAmount(text), text).toBeNull();
            expect(readTypedAmount(text, 'decimal'), text).toBeNull();
        }
    });
});

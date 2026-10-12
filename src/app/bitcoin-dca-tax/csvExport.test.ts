import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateCsvContent } from '@/utils/csv';
import { calculateDca, withPriceKinds } from '@/utils/dca';
import { DAY_MS } from '@/utils/dates';

/**
 * /bitcoin-dca-tax describes the calculator's CSV export column by column, and
 * nothing else ties that table to utils/csv. It has drifted twice: it listed
 * seven columns while the file had eight (no "Type"), then eight while a plan
 * on market prices exported nine (no "Price Kind").
 *
 * These tests read the page as text and hold it to the file the engine and
 * generateCsvContent actually produce. When one fails, the export has moved:
 * change the page (and its LAST_REVIEWED date) to match, then the test if it
 * needs it.
 */

const pageSource = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8');

/** Source as a reader meets it: one line, entities decoded, braces from wrapped JSX text gone. */
const page = pageSource
    .replace(/\{' '\}/g, ' ')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

/** The [column, description] pairs of the page's column table, in order. */
const documented: [string, string][] = (() => {
    const from = pageSource.indexOf('Columns in the CSV export');
    const table = pageSource.slice(from, pageSource.indexOf('].map(([col, desc])', from));
    return [...table.matchAll(/^\s*\['([^']+)',\s*'([^']+)'\],$/gm)].map((m): [string, string] => [m[1], m[2]]);
})();
const documentedNames = documented.map(([name]) => name);
const describes = (column: string): string => documented.find(([name]) => name === column)?.[1] ?? '';

// Fifteen days of prices, an observed close every seventh day and estimates
// between, the shape the Kraken series has.
const start = Date.UTC(2024, 0, 4);
const bare = Array.from({ length: 15 }, (_, i): [number, number] => [start + i * DAY_MS, 40_000 + 100 * i]);
const marked = withPriceKinds(bare, 'oeeeeeeoeeeeeeo');
const asOf = Date.UTC(2026, 9, 12);
const plan = {
    amount: 100, frequency: 'daily' as const, startDate: new Date(start), endDate: new Date(start + 14 * DAY_MS),
    feePercentage: 1, flatFee: 0.5, priceMode: 'api' as const, manualPrice: 0,
    startingBtc: 0.5, startingAvgCost: 18_000,
};

const rows = (csv: string): string[][] => csv.split('\n').map((line) => line.split(','));
/** Header cells without what they carry in brackets: "BTC Price (USD)" is "BTC Price". */
const columnNames = (csv: string): string[] => rows(csv)[0].map((cell) => cell.replace(/ \([^)]*\)$/, ''));

const liveBreakdown = calculateDca(plan, marked, 45_000, asOf).breakdown;
const live = generateCsvContent(liveBreakdown);
const manual = generateCsvContent(calculateDca({ ...plan, priceMode: 'manual', manualPrice: 60_000 }, marked, 45_000, asOf).breakdown);
const RATE_COLUMN = 'Exchange Rate For Every Row';

describe('the CSV column table on /bitcoin-dca-tax', () => {
    it('is read off the page', () => {
        // Guards the scan itself: a pattern that matches nothing would pass every check below.
        expect(documentedNames.length).toBeGreaterThanOrEqual(8);
        expect(documentedNames[0]).toBe('Date');
    });

    it('lists the columns of a plan on market prices, in file order', () => {
        expect(documentedNames).toEqual(columnNames(live));
    });

    it('says a plan at a manual price has the same columns without Price Kind', () => {
        expect(columnNames(manual)).toEqual(documentedNames.filter((name) => name !== 'Price Kind'));
        expect(page).toContain('(the Manual price mode) has no Price Kind column.');
    });

    it('says a file in another currency ends with one more column, holding one rate for every row', () => {
        for (const currency of [{ code: 'EUR', rate: 0.89437, asOf: '2026-10-12' }, { code: 'JPY', rate: 158.6 }]) {
            const converted = generateCsvContent(liveBreakdown, currency);
            expect(columnNames(converted)).toEqual([...documentedNames, RATE_COLUMN]);
            // "in that currency per US dollar", as the page puts it.
            expect(rows(converted)[0][9]).toMatch(new RegExp(`^${RATE_COLUMN} \\(${currency.code} per USD\\b`));
            expect(new Set(rows(converted).slice(1).map((fields) => fields[9]))).toEqual(new Set([String(currency.rate)]));
        }
        expect(columnNames(live)).not.toContain(RATE_COLUMN);
        expect(page).toContain(`In any currency other than US dollars the file ends with one more column, ${RATE_COLUMN}`);
    });

    it('says there is no fee column, and there is none', () => {
        expect(columnNames(live).some((name) => /fee/i.test(name))).toBe(false);
        expect(page).toContain('no separate fee column.');
    });

    it('describes Amount Invested as gross and BTC Bought as net of fees, as the file has them', () => {
        const [, , firstBuy] = rows(live);
        const [price, invested, btc] = [Number(firstBuy[1]), Number(firstBuy[2]), Number(firstBuy[3])];
        // $100 in, 1% plus a $0.50 flat fee taken out before the coins are bought.
        expect(invested).toBe(100);
        expect(btc * price).toBeCloseTo(100 - 1.5, 2);
        expect(describes('Amount Invested')).toContain('before any fee is taken out');
        expect(describes('BTC Bought')).toContain('after fees');
    });

    it('names every value the Type and Price Kind columns can hold', () => {
        const body = rows(live).slice(1);
        expect(new Set(body.map((fields) => fields[7]))).toEqual(new Set(['starting stack', 'buy']));
        for (const value of ['starting stack', 'buy']) expect(describes('Type')).toContain(`“${value}”`);

        expect(new Set(body.map((fields) => fields[8]))).toEqual(new Set(['', 'observed', 'estimated']));
        for (const value of ['observed', 'estimated']) expect(describes('Price Kind')).toContain(`“${value}”`);
        // The blank: a starting stack costed at the average the user entered.
        expect(body[0].slice(7)).toEqual(['starting stack', '']);
        expect(page).toContain('The cell is blank on a starting stack row whose average cost you entered.');
    });
});

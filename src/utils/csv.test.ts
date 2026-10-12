import { describe, expect, it } from 'vitest';
import { escapeCsvField, generateCsvContent } from './csv';
import { calculateDca, withPriceKinds } from './dca';
import { DAY_MS } from './dates';
import type { DcaBreakdownItem } from '@/types';

const row = (over: Partial<DcaBreakdownItem> = {}): DcaBreakdownItem => ({
    date: '2022-01-03T00:00:00.000Z',
    price: 20_000,
    invested: 100,
    totalInvested: 100,
    accumulated: 0.005,
    totalAccumulated: 0.005,
    portfolioValue: 100,
    fee: 0,
    ...over,
});

const lines = (csv: string): string[][] => csv.split('\n').map((line) => line.split(','));

describe('generateCsvContent', () => {
    it('writes eight columns, with the currency named in every money header', () => {
        const [header] = lines(generateCsvContent([row()]));
        expect(header).toEqual([
            'Date', 'BTC Price (USD)', 'Amount Invested (USD)', 'BTC Bought',
            'Cumulative Invested (USD)', 'Cumulative BTC', 'Portfolio Value (USD)', 'Type',
        ]);
        const [eur] = lines(generateCsvContent([row()], { code: 'EUR', rate: 0.9 }));
        expect(eur.slice(0, 8)).toEqual([
            'Date', 'BTC Price (EUR)', 'Amount Invested (EUR)', 'BTC Bought',
            'Cumulative Invested (EUR)', 'Cumulative BTC', 'Portfolio Value (EUR)', 'Type',
        ]);
    });

    it('says in a converted file that one exchange rate was used for every row, and which', () => {
        const [header, first, second] = lines(generateCsvContent(
            [row(), row({ date: '2024-06-03T00:00:00.000Z' })],
            { code: 'EUR', rate: 0.89238, asOf: '2026-10-09' },
        ));
        expect(header).toHaveLength(9);
        expect(header[8]).toBe('Exchange Rate For Every Row (EUR per USD; dated 2026-10-09)');
        // The same rate on rows two years apart: the rate on each row's own day is not used.
        expect(first[8]).toBe('0.89238');
        expect(second[8]).toBe('0.89238');
        expect(Number(first[1]) / 20_000).toBeCloseTo(0.89238, 10);

        // Undated when the caller does not know the date; never present in a USD file.
        expect(lines(generateCsvContent([row()], { code: 'JPY', rate: 158.25 }))[0][8]).toBe('Exchange Rate For Every Row (JPY per USD)');
        expect(lines(generateCsvContent([row()], { code: 'USD', rate: 1, asOf: '2026-10-09' }))[0]).toHaveLength(8);
    });

    it('formats a buy as an ISO date, money to 2 places and BTC to 8', () => {
        const csv = generateCsvContent([row({
            date: '2022-01-10T00:00:00.000Z', price: 41_911.6, invested: 100, totalInvested: 9_200,
            accumulated: 0.00238598, totalAccumulated: 0.50476, portfolioValue: 21_155.3,
        })]);
        expect(csv.split('\n')[1]).toBe('2022-01-10,41911.60,100.00,0.00238598,9200.00,0.50476000,21155.30,buy');
    });

    it('converts the money columns at the given rate and leaves BTC alone', () => {
        const [, usd] = lines(generateCsvContent([row()]));
        const [, jpy] = lines(generateCsvContent([row()], { code: 'JPY', rate: 150 }));
        expect(usd).toEqual(['2022-01-03', '20000.00', '100.00', '0.00500000', '100.00', '0.00500000', '100.00', 'buy']);
        expect(jpy).toEqual(['2022-01-03', '3000000.00', '15000.00', '0.00500000', '15000.00', '0.00500000', '15000.00', 'buy', '150']);
    });

    it('dates each row by its UTC day', () => {
        const [, late] = lines(generateCsvContent([row({ date: '2022-01-03T23:59:59.000Z' })]));
        expect(late[0]).toBe('2022-01-03');
    });

    it('is one line per row with no trailing newline, and only a header when there are no rows', () => {
        const csv = generateCsvContent([row(), row({ date: '2022-01-10T00:00:00.000Z' })]);
        expect(csv.split('\n').length).toBe(3);
        expect(csv.endsWith('\n')).toBe(false);
        expect(generateCsvContent([]).split('\n').length).toBe(1);
    });

    it('labels a starting stack so it cannot be mistaken for a purchase', () => {
        // Half a bitcoin already held, costed at a stated $18,000, then weekly buys.
        const start = Date.UTC(2022, 0, 3);
        const prices = Array.from({ length: 30 }, (_, i): [number, number] => [start + i * DAY_MS, 20_000]);
        const result = calculateDca(
            {
                amount: 100, frequency: 'weekly', startDate: new Date(start), endDate: new Date(start + 14 * DAY_MS),
                feePercentage: 0, priceMode: 'api', manualPrice: 0, startingBtc: 0.5, startingAvgCost: 18_000,
            },
            prices,
            20_000,
            Date.UTC(2026, 9, 12),
        );
        const rows = generateCsvContent(result.breakdown).split('\n');
        expect(rows[1]).toBe('2022-01-03,18000.00,9000.00,0.50000000,9000.00,0.50000000,10000.00,starting stack');
        expect(rows[2]).toBe('2022-01-03,20000.00,100.00,0.00500000,9100.00,0.50500000,10100.00,buy');
        expect(rows.slice(2).every((line) => line.endsWith(',buy'))).toBe(true);
        expect(rows.length).toBe(1 + 1 + 3);
    });

    describe('Price Kind column', () => {
        const start = Date.UTC(2024, 0, 4);
        const bare = Array.from({ length: 15 }, (_, i): [number, number] => [start + i * DAY_MS, 40_000 + 100 * i]);
        const marked = withPriceKinds(bare, 'oeeeeeeoeeeeeeo');
        const plan = {
            amount: 100, frequency: 'daily' as const, startDate: new Date(start), endDate: new Date(start + 14 * DAY_MS),
            feePercentage: 0, priceMode: 'api' as const, manualPrice: 0,
        };
        const asOf = Date.UTC(2026, 9, 12);

        it('is absent when the price series carries no markers', () => {
            const csv = generateCsvContent(calculateDca(plan, bare, 45_000, asOf).breakdown);
            expect(lines(csv).every((fields) => fields.length === 8)).toBe(true);
            expect(csv).not.toContain('Price Kind');
        });

        it('is appended after Type when it does, one value per row', () => {
            const table = lines(generateCsvContent(calculateDca(plan, marked, 45_000, asOf).breakdown));
            expect(table[0][8]).toBe('Price Kind');
            expect(table.every((fields) => fields.length === 9)).toBe(true);
            expect(table.slice(1).map((fields) => fields[8])).toEqual([
                'observed', 'estimated', 'estimated', 'estimated', 'estimated', 'estimated', 'estimated',
                'observed', 'estimated', 'estimated', 'estimated', 'estimated', 'estimated', 'estimated',
                'observed',
            ]);
        });

        it('leaves the other eight columns exactly as they are without markers', () => {
            const without = lines(generateCsvContent(calculateDca(plan, bare, 45_000, asOf).breakdown));
            const withKinds = lines(generateCsvContent(calculateDca(plan, marked, 45_000, asOf).breakdown));
            expect(withKinds.map((fields) => fields.slice(0, 8))).toEqual(without);
        });

        it('is blank on a starting stack costed at the average the user entered', () => {
            const result = calculateDca({ ...plan, startingBtc: 1, startingAvgCost: 20_000 }, marked, 45_000, asOf);
            const table = lines(generateCsvContent(result.breakdown));
            expect(table[1].slice(7)).toEqual(['starting stack', '']);
            expect(table[2].slice(7)).toEqual(['buy', 'observed']);
        });

        it('stays the ninth column in a converted file, with the exchange rate after it', () => {
            const table = lines(generateCsvContent(calculateDca(plan, marked, 45_000, asOf).breakdown, { code: 'GBP', rate: 0.75641, asOf: '2026-10-09' }));
            expect(table[0].slice(8)).toEqual(['Price Kind', 'Exchange Rate For Every Row (GBP per USD; dated 2026-10-09)']);
            expect(table[1].slice(8)).toEqual(['observed', '0.75641']);
            expect(table.every((fields) => fields.length === 10)).toBe(true);
        });
    });
});

describe('escapeCsvField', () => {
    it('stops a spreadsheet from running a field as a formula', () => {
        expect(escapeCsvField('=1+1')).toBe("'=1+1");
        expect(escapeCsvField('+1')).toBe("'+1");
        expect(escapeCsvField('-25.00')).toBe("'-25.00");
        expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)");
    });

    it('quotes a field that holds a comma, a quote or a line break, doubling the quotes', () => {
        expect(escapeCsvField('a,b')).toBe('"a,b"');
        expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
        expect(escapeCsvField('two\nlines')).toBe('"two\nlines"');
        expect(escapeCsvField('=1+1,"x"')).toBe('"\'=1+1,""x"""');
    });

    it('leaves an ordinary field alone', () => {
        expect(escapeCsvField('2022-01-03')).toBe('2022-01-03');
        expect(escapeCsvField('20000.00')).toBe('20000.00');
        expect(escapeCsvField('')).toBe('');
    });
});

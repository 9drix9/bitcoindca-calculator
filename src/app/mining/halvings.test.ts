import { describe, expect, it } from 'vitest';
import { SATS_PER_BTC } from '@/utils/units';
import {
    HALVING_INTERVAL,
    HALVING_SCHEDULE,
    MAX_ISSUED_SATS,
    TOTAL_ERAS,
    formatBtc,
    formatSubsidy,
    issuedSatsBefore,
    subsidySats,
} from './halvings';

/**
 * The long-term table from https://en.bitcoin.it/wiki/Controlled_supply, the
 * source the page cites, copied on 12 October 2026:
 * [block, BTC per block from that block, BTC issued before that block].
 * Kept as strings so the comparison is against the published digits, not a float.
 */
const WIKI_TABLE: readonly [number, string, string][] = [
    [0, '50.00000000', '0.00000000'],
    [210000, '25.00000000', '10500000.00000000'],
    [420000, '12.50000000', '15750000.00000000'],
    [630000, '6.25000000', '18375000.00000000'],
    [840000, '3.12500000', '19687500.00000000'],
    [1050000, '1.56250000', '20343750.00000000'],
    [1260000, '0.78125000', '20671875.00000000'],
    [1470000, '0.39062500', '20835937.50000000'],
    [1680000, '0.19531250', '20917968.75000000'],
    [1890000, '0.09765625', '20958984.37500000'],
    [2100000, '0.04882812', '20979492.18750000'],
    [2310000, '0.02441406', '20989746.09270000'],
    [2520000, '0.01220703', '20994873.04530000'],
    [2730000, '0.00610351', '20997436.52160000'],
    [2940000, '0.00305175', '20998718.25870000'],
    [3150000, '0.00152587', '20999359.12620000'],
    [3360000, '0.00076293', '20999679.55890000'],
    [3570000, '0.00038146', '20999839.77420000'],
    [3780000, '0.00019073', '20999919.88080000'],
    [3990000, '0.00009536', '20999959.93410000'],
    [4200000, '0.00004768', '20999979.95970000'],
    [4410000, '0.00002384', '20999989.97250000'],
    [4620000, '0.00001192', '20999994.97890000'],
    [4830000, '0.00000596', '20999997.48210000'],
    [5040000, '0.00000298', '20999998.73370000'],
    [5250000, '0.00000149', '20999999.35950000'],
    [5460000, '0.00000074', '20999999.67240000'],
    [5670000, '0.00000037', '20999999.82780000'],
    [5880000, '0.00000018', '20999999.90550000'],
    [6090000, '0.00000009', '20999999.94330000'],
    [6300000, '0.00000004', '20999999.96220000'],
    [6510000, '0.00000002', '20999999.97060000'],
    [6720000, '0.00000001', '20999999.97480000'],
    [6930000, '0.00000000', '20999999.97690000'],
];

/** "20997436.52160000" -> 2099743652160000, without going through a float. */
const toSats = (btc: string): number => {
    const [whole, fraction = ''] = btc.split('.');
    return Number(whole) * SATS_PER_BTC + Number(fraction.padEnd(8, '0'));
};

/** The reward column as it was hand-typed before it was derived. Every entry was correct. */
const REWARD_LABELS = [
    '50 BTC', '25 BTC', '12.5 BTC', '6.25 BTC', '3.125 BTC', '1.5625 BTC', '0.78125 BTC', '0.390625 BTC',
    '0.1953125 BTC', '0.09765625 BTC', '0.04882812 BTC', '0.02441406 BTC', '0.01220703 BTC', '0.00610351 BTC',
    '0.00305175 BTC', '0.00152587 BTC', '0.00076293 BTC', '0.00038146 BTC', '0.00019073 BTC', '0.00009536 BTC',
    '0.00004768 BTC', '0.00002384 BTC', '0.00001192 BTC', '596 sats', '298 sats', '149 sats', '74 sats', '37 sats',
    '18 sats', '9 sats', '4 sats', '2 sats', '1 sat', '0',
];

describe('subsidySats', () => {
    it('matches the Bitcoin Wiki subsidy for every era', () => {
        for (const [block, perBlock] of WIKI_TABLE) {
            expect(subsidySats(block), `block ${block}`).toBe(toSats(perBlock));
        }
    });

    it('changes exactly on the halving block', () => {
        expect(subsidySats(209_999)).toBe(50 * SATS_PER_BTC);
        expect(subsidySats(210_000)).toBe(25 * SATS_PER_BTC);
        expect(subsidySats(839_999)).toBe(625_000_000);
        expect(subsidySats(840_000)).toBe(312_500_000);
    });

    it('rounds down to a whole satoshi, as the node does', () => {
        // 50 BTC / 2^10 = 4,882,812.5 sats. Bitcoin Core shifts an integer, so the half is dropped.
        // (A JavaScript `5e9 >> 10` would give 688,508: the shift is 32-bit.)
        expect(subsidySats(10 * HALVING_INTERVAL)).toBe(4_882_812);
    });

    it('is zero from the 33rd halving on, and for anything that is not a height', () => {
        expect(subsidySats(TOTAL_ERAS * HALVING_INTERVAL - 1)).toBe(1);
        expect(subsidySats(TOTAL_ERAS * HALVING_INTERVAL)).toBe(0);
        expect(subsidySats(64 * HALVING_INTERVAL)).toBe(0);
        expect(subsidySats(-1)).toBe(0);
        expect(subsidySats(Number.NaN)).toBe(0);
    });
});

describe('issuedSatsBefore', () => {
    it('matches the Bitcoin Wiki supply at every halving', () => {
        for (const [block, , issuedBefore] of WIKI_TABLE) {
            expect(issuedSatsBefore(block), `block ${block}`).toBe(toSats(issuedBefore));
        }
    });

    it('stops at 20,999,999.9769 BTC, not 21 million', () => {
        expect(MAX_ISSUED_SATS).toBe(2_099_999_997_690_000);
        expect(21_000_000 * SATS_PER_BTC - MAX_ISSUED_SATS).toBe(2_310_000);
        expect(issuedSatsBefore(10_000_000)).toBe(MAX_ISSUED_SATS);
    });

    it('counts the blocks below the height, so the supply after a block is height + 1', () => {
        expect(issuedSatsBefore(0)).toBe(0);
        expect(issuedSatsBefore(1)).toBe(50 * SATS_PER_BTC);
        // After block 840,000 (the first 3.125 BTC block): 19,687,500 + 3.125 BTC.
        expect(issuedSatsBefore(840_001)).toBe(1_968_750_312_500_000);
    });

    it('treats a height that is not a block as nothing issued', () => {
        expect(issuedSatsBefore(-5)).toBe(0);
        expect(issuedSatsBefore(Number.NaN)).toBe(0);
    });
});

describe('formatBtc and formatSubsidy', () => {
    it('prints exact BTC with grouping and no trailing zeros', () => {
        expect(formatBtc(0)).toBe('0');
        expect(formatBtc(1_050_000_000_000_000)).toBe('10,500,000');
        expect(formatBtc(2_083_593_750_000_000)).toBe('20,835,937.5');
        expect(formatBtc(2_099_743_652_160_000)).toBe('20,997,436.5216');
        expect(formatBtc(MAX_ISSUED_SATS)).toBe('20,999,999.9769');
        expect(formatBtc(1)).toBe('0.00000001');
    });

    it('switches from BTC to satoshis below 1,000 of them', () => {
        expect(formatSubsidy(1_192)).toBe('0.00001192 BTC');
        expect(formatSubsidy(596)).toBe('596 sats');
        expect(formatSubsidy(1)).toBe('1 sat');
        expect(formatSubsidy(0)).toBe('0');
    });
});

describe('HALVING_SCHEDULE', () => {
    it('has the genesis row and all 33 halvings, in block order', () => {
        expect(HALVING_SCHEDULE).toHaveLength(34);
        expect(HALVING_SCHEDULE.map((row) => row.block)).toEqual(WIKI_TABLE.map(([block]) => block));
    });

    it('keeps the reward column exactly as it read before it was derived', () => {
        expect(HALVING_SCHEDULE.map((row) => row.reward)).toEqual(REWARD_LABELS);
    });

    it('shows the supply the wiki publishes, to the last digit', () => {
        for (const [index, [, , issuedBefore]] of WIKI_TABLE.entries()) {
            const published = issuedBefore.replace(/\.?0+$/, '');
            expect(HALVING_SCHEDULE[index].supplyAfter.replaceAll(',', ''), `row ${index}`).toBe(published || '0');
        }
        // The rows the hand-typed table had wrong: it read 20.9975M, 20.9998437M and 21M.
        expect(HALVING_SCHEDULE[13].supplyAfter).toBe('20,997,436.5216');
        expect(HALVING_SCHEDULE[17].supplyAfter).toBe('20,999,839.7742');
        expect(HALVING_SCHEDULE[33].supplyAfter).toBe('20,999,999.9769');
    });

    it('labels and dates the rows', () => {
        const labels = HALVING_SCHEDULE.map((row) => row.halving);
        expect(labels.slice(0, 5)).toEqual(['Start', '1st', '2nd', '3rd', '4th']);
        expect([labels[11], labels[12], labels[13], labels[21], labels[22], labels[23]]).toEqual(
            ['11th', '12th', '13th', '21st', '22nd', '23rd'],
        );
        expect(labels[33]).toBe('33rd (Final)');

        expect(HALVING_SCHEDULE[4].date).toBe('Apr 20, 2024');
        expect(HALVING_SCHEDULE[5].date).toBe('~Apr 2028');
        expect(HALVING_SCHEDULE[6].date).toBe('~2032');
        expect(HALVING_SCHEDULE[33].date).toBe('~2140');
    });
});

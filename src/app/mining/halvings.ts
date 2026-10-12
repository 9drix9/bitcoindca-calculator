/**
 * Bitcoin's issuance schedule, computed in whole satoshis.
 *
 * The halving table on /mining used to be 34 hand-typed rows. The supply column
 * was right for the first twelve halvings and then drifted: the later rows
 * continued a rounded pattern instead of summing the subsidies, so the 13th row
 * read 20.9975M where the schedule actually reaches 20,997,436.5216 BTC. The
 * error is 63 BTC there and shrinks from row to row, and the last row said "21M",
 * a total the protocol never reaches.
 *
 * Bitcoin Core does this in integers (validation.cpp, GetBlockSubsidy:
 * `nSubsidy = 50 * COIN; nSubsidy >>= halvings;`), so every halving rounds the
 * subsidy DOWN to a whole satoshi. That rounding is the whole difference between
 * 21,000,000 and the real limit of 20,999,999.9769 BTC, and it is why the figures
 * here are derived the same way instead of being typed in.
 *
 * Everything stays in plain Numbers: the largest value, the final supply in
 * satoshis, is about 2.1e15, well inside the 2^53 range where integers are exact.
 */

import { SATS_PER_BTC } from '@/utils/units';

export const HALVING_INTERVAL = 210_000;

/** Subsidy eras that pay anything. The 33rd halving takes the subsidy to zero. */
export const TOTAL_ERAS = 33;

const INITIAL_SUBSIDY_SATS = 50 * SATS_PER_BTC;

/**
 * Subsidy of one block in a given era, in satoshis.
 *
 * Division and floor, not `>>`: JavaScript's shift operators work on 32-bit
 * integers, and 5,000,000,000 does not fit in one (`5e9 >> 0` is 705,032,704).
 * 5e9 divided by a power of two is exact in a double, so the floor is too.
 */
function eraSubsidySats(era: number): number {
    if (era < 0 || era >= TOTAL_ERAS) return 0;
    return Math.floor(INITIAL_SUBSIDY_SATS / 2 ** era);
}

/** Block subsidy at a height, in satoshis. Zero for a height that is not a block. */
export function subsidySats(height: number): number {
    if (!Number.isFinite(height) || height < 0) return 0;
    return eraSubsidySats(Math.floor(height / HALVING_INTERVAL));
}

/**
 * Total subsidy of every block BELOW `height`, in satoshis: what had been issued
 * at the moment that block was about to be mined. For the supply after a block,
 * pass its height plus one.
 *
 * This counts the genesis block's 50 BTC, which can never be spent, and assumes
 * every miner claimed the full subsidy, which a few did not. It is the scheduled
 * issuance, so the spendable supply is slightly lower.
 */
export function issuedSatsBefore(height: number): number {
    if (!Number.isFinite(height) || height <= 0) return 0;
    const blocks = Math.floor(height);
    let total = 0;
    for (let era = 0; era < TOTAL_ERAS; era++) {
        const eraStart = era * HALVING_INTERVAL;
        if (blocks <= eraStart) break;
        total += Math.min(blocks - eraStart, HALVING_INTERVAL) * eraSubsidySats(era);
    }
    return total;
}

/** Everything the schedule will ever issue: 2,099,999,997,690,000 satoshis. */
export const MAX_ISSUED_SATS = issuedSatsBefore(TOTAL_ERAS * HALVING_INTERVAL);

/**
 * A satoshi amount as an exact BTC string, e.g. 2099743652160000 -> "20,997,436.5216".
 *
 * Built from the integer, not from `sats / 1e8`, so no digit is ever a float
 * artefact. The locale is fixed because the server and the browser must print
 * the same string.
 */
export function formatBtc(sats: number): string {
    const whole = Math.floor(sats / SATS_PER_BTC);
    const fraction = String(sats % SATS_PER_BTC).padStart(8, '0').replace(/0+$/, '');
    return fraction ? `${whole.toLocaleString('en-US')}.${fraction}` : whole.toLocaleString('en-US');
}

/** A subsidy the way the table shows it: BTC while that is readable, satoshis below 1,000 of them. */
export function formatSubsidy(sats: number): string {
    if (sats <= 0) return '0';
    if (sats < 1_000) return `${sats} ${sats === 1 ? 'sat' : 'sats'}`;
    return `${formatBtc(sats)} BTC`;
}

function ordinal(n: number): string {
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * Dates of the genesis block and the four halvings so far (UTC date of the block).
 * Later ones are estimates: the schedule counts blocks, not days, so they are
 * shown to the year and marked with "~".
 */
const PAST_DATES = ['Jan 3, 2009', 'Nov 28, 2012', 'Jul 9, 2016', 'May 11, 2020', 'Apr 20, 2024'] as const;

/** 210,000 blocks at ten minutes is just under four years, and the 5th halving is due about April 2028. */
function halvingDate(n: number): string {
    if (n < PAST_DATES.length) return PAST_DATES[n];
    return n === 5 ? '~Apr 2028' : `~${2008 + 4 * n}`;
}

export interface HalvingRow {
    /** "Start", "1st" … "33rd (Final)". */
    halving: string;
    /** Height of the first block that pays the new subsidy. */
    block: number;
    date: string;
    /** Subsidy from that block onward. */
    reward: string;
    /** Scheduled supply at that block, in BTC. */
    supplyAfter: string;
}

/** Row 0 is the genesis block; rows 1 to 33 are the halvings. */
export const HALVING_SCHEDULE: readonly HalvingRow[] = Array.from({ length: TOTAL_ERAS + 1 }, (_, n) => {
    const block = n * HALVING_INTERVAL;
    return {
        halving: n === 0 ? 'Start' : `${ordinal(n)}${n === TOTAL_ERAS ? ' (Final)' : ''}`,
        block,
        date: halvingDate(n),
        reward: formatSubsidy(subsidySats(block)),
        supplyAfter: formatBtc(issuedSatsBefore(block)),
    };
});

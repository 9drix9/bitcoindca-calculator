import { DEFAULT_PLAN } from '@/data/planDefaults';
import { EXCHANGE_FEES, feeTiersAsOf, type ExchangeFeeRecord } from '@/data/exchangeFees';

/**
 * Which fee levels the exchange-fees page runs its schedule at. Kept out of
 * the page so a test can pin the rows: the headline, two FAQ answers and a
 * paragraph all look their figures up in them.
 */

// A fixed charge per order, to show why a flat fee falls hardest on small
// buys. It is an example and nothing else: the amount is a round number so it
// cannot be mistaken for any platform's price.
export const FLAT_EXAMPLE_USD = 1;

export interface FeeLevel {
    percent: number;
    flatUsd: number;
    /** True for the made-up flat-fee row. */
    example: boolean;
}

/**
 * The fee levels the table runs, cheapest first: zero, every percentage a
 * platform in the registry publishes, the calculator's own default fee, and
 * one flat-fee example.
 *
 * Derived, never typed in. The previous hand-written list was edited without
 * the sentences that quoted it, so the headline, an FAQ answer and a whole
 * paragraph looked up rates that were no longer rows and silently fell back
 * to generic text. The rows stay unlabelled by platform on purpose: this
 * table is about rates, and the list further down names who charges what.
 */
export function feeLevels(asOf: number, registry: readonly ExchangeFeeRecord[] = EXCHANGE_FEES): FeeLevel[] {
    const tiers = feeTiersAsOf(asOf, registry);
    const percents = new Set<number>([0, DEFAULT_PLAN.feePercentage]);
    for (const tier of tiers) if (tier.flatUsd === 0) percents.add(tier.percent);
    return [
        ...[...percents].sort((a, b) => a - b).map((percent) => ({ percent, flatUsd: 0, example: false })),
        ...tiers.filter((t) => t.flatUsd > 0).map((t) => ({ percent: t.percent, flatUsd: t.flatUsd, example: false })),
        { percent: 0, flatUsd: FLAT_EXAMPLE_USD, example: true },
    ];
}

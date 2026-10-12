import type { Frequency } from '@/types';
import { roundTo2Sig } from '@/utils/numericInput';
import { btcToSats } from '@/utils/units';

/**
 * The forward-looking arithmetic shared by the FIRE card and the spend-down
 * planner, kept out of the components so the widgets, the prose on their pages
 * and the tests all read the same numbers.
 *
 * Everything here is arithmetic on an assumption the visitor supplies. None of
 * it is a forecast, and nothing in this file touches the clock or the network.
 */

export const WITHDRAWAL_RATE = 0.04; // the 4% rule
// The 4% rule is defined on inflation-adjusted spending, so the target the stack
// must cover rises each year. 3% matches the spend-down planner's default.
export const SPENDING_INFLATION_RATE = 0.03;

/** Monthly spending both tools open on, in USD. */
export const BASELINE_MONTHLY_SPEND_USD = 4000;

/**
 * BASELINE_MONTHLY_SPEND_USD in a display currency, as a round number
 * (4,000 USD, 3,600 EUR, 630,000 JPY at October 2026 rates).
 *
 * The spend field is typed in the display currency, so a bare "4000" opened
 * both tools on ¥4,000 a month for a yen visitor. That is about $25, and every
 * default result read as "you're already there" or "Indefinitely".
 */
export const defaultMonthlySpend = (unitsPerUsd: number): number =>
    roundTo2Sig(BASELINE_MONTHLY_SPEND_USD * (unitsPerUsd > 0 ? unitsPerUsd : 1));

export const contributionsPerYear = (amount: number, frequency: Frequency): number => {
    switch (frequency) {
        case 'daily': return amount * 365;
        case 'weekly': return amount * 52;
        case 'biweekly': return amount * 26;
        case 'monthly': return amount * 12;
    }
};

export interface FireProjection {
    /** Yearly price change this path assumes, as a fraction (0.2 = +20%). */
    rate: number;
    /** Whole years until the stack covers the spending target; null when it never does inside `maxYears`. */
    years: number | null;
    reached: boolean;
    /** Stack value in USD at the end of the walk. */
    projectedValue: number;
}

/**
 * Years of continued buying until 4% of the stack covers a year of spending.
 *
 * The stack compounds at `annualRate` and takes one year of contributions at
 * each step. The spending target rises with SPENDING_INFLATION_RATE, so the
 * test is in real terms even though the growth rate is nominal.
 *
 * Null when there is no spending to cover. A target of zero is met by any
 * stack at year 0, which used to print "Now, you're already there" on all
 * three cards for an empty spend field while the progress bar read 0%.
 */
export function projectFire({
    stackValueUsd,
    annualContributionUsd,
    annualExpensesUsd,
    annualRate,
    maxYears = 100,
}: {
    stackValueUsd: number;
    annualContributionUsd: number;
    annualExpensesUsd: number;
    annualRate: number;
    maxYears?: number;
}): FireProjection | null {
    if (!(annualExpensesUsd > 0) || !Number.isFinite(stackValueUsd)) return null;

    let stackValue = stackValueUsd;
    let years = 0;
    while (years < maxYears) {
        if (stackValue * WITHDRAWAL_RATE >= annualExpensesUsd * Math.pow(1 + SPENDING_INFLATION_RATE, years)) break;
        stackValue = stackValue * (1 + annualRate) + annualContributionUsd;
        years++;
    }

    const reached = years < maxYears;
    return { rate: annualRate, years: reached ? years : null, projectedValue: stackValue, reached };
}

/**
 * The price a constant yearly change implies after `years`.
 *
 * Shown beside every non-zero growth assumption, because a percentage hides
 * its own size: +15% a year for 30 years is a 66-fold rise. Printing the price
 * that goes with a result is what lets a reader judge the assumption.
 */
export const impliedPrice = (priceUsd: number, annualRate: number, years: number): number =>
    priceUsd * Math.pow(1 + annualRate, years);

/** What a yearly rate means for the price, in words. */
export const priceScenarioLabel = (rate: number): string => {
    if (rate < 0) return 'Price falls';
    if (rate > 0) return 'Price rises';
    return 'Price flat';
};

/**
 * Short money figure for tight spots (axis ticks, a line under a card):
 * "$5.5M", "$338k", "$104". `value` is already in the display currency.
 *
 * Built on toFixed, so the text is the same in every locale. These labels are
 * rendered on the server and again in the browser, and the two must agree.
 */
export const formatCompactAmount = (value: number, symbol: string): string => {
    if (!Number.isFinite(value)) return '—';
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    // Past a thousand trillion the digits stop meaning anything. A reader who
    // typed +300% a year should see that it left the scale, not a row of zeros.
    if (abs >= 1e15) return `${sign}over ${symbol}999T`;
    if (abs >= 1e12) return `${sign}${symbol}${(abs / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `${sign}${symbol}${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 10_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}k`;
    if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`;
    // Under a cent, two decimals would print "0.00" for a price that is not zero.
    if (abs > 0 && abs < 0.01) return `under ${symbol}0.01`;
    if (abs < 1 && abs > 0) return `${sign}${symbol}${abs.toFixed(2)}`;
    return `${sign}${symbol}${abs.toFixed(0)}`;
};

/**
 * Flip the sign of a typed number: "20" → "-20", "-5.5" → "5.5".
 *
 * Behind the ± button next to the growth fields. A phone's number pad may have
 * no minus key, and a falling price has to be enterable on every keyboard.
 * Empty, partial and zero input come back unchanged: there is nothing to flip.
 */
export const flipSign = (raw: string): string => {
    const cleaned = raw.replace(/[,\s]/g, '');
    const n = Number(cleaned);
    if (cleaned === '' || !Number.isFinite(n) || n === 0) return raw;
    return String(-n);
};

/**
 * A bitcoin amount as the text an input in `unit` should hold: 0.1 BTC is
 * "0.1" in a BTC field and "10000000" in a sats field.
 *
 * Behind the planner's "stop selling at" field. When the Units switch changes,
 * the field has to keep the amount and change only how it is written. Reading
 * a typed "0.1" as sats would turn a floor of a tenth of a bitcoin into
 * nothing without a word.
 *
 * Whole sats, rounded (0.29 BTC is 28999999.999999996 sats in floating point).
 * BTC to eight places with trailing zeros dropped, through toFixed because
 * String(0.0000001) is "1e-7".
 */
export const stackAmountAsInput = (btc: number, unit: 'BTC' | 'SATS'): string => {
    if (!Number.isFinite(btc)) return '0';
    if (unit === 'SATS') return String(btcToSats(btc));
    return btc.toFixed(8).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
};

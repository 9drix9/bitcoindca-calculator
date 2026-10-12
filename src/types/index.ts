export type Frequency = 'daily' | 'weekly' | 'monthly' | 'biweekly';

export type PriceMode = 'api' | 'manual';

/**
 * Where a price came from. 'observed' is a close the source actually reported
 * for that UTC day (an exchange candle, or a day in the bundled snapshot).
 * 'estimated' is anything else we filled in: a straight-line value between two
 * closes, or the last known close carried forward to a later day.
 */
export type PriceKind = 'observed' | 'estimated';

/**
 * One point of a price series: [UTC ms, USD price], plus an optional marker
 * saying whether that price was observed or estimated.
 *
 * A bare [ts, price] pair is a valid point and means "kind unknown": the
 * numbers computed from it are the same, and nothing downstream is labelled
 * either way.
 */
export type PricePoint = [ts: number, price: number, kind?: PriceKind];

export interface DcaParams {
    amount: number;
    frequency: Frequency;
    startDate: Date;
    endDate: Date;
    feePercentage: number;
    /** Fixed fee charged on every scheduled buy, in the same unit as `amount`
     *  (USD inside the engine). Added to the percentage fee, capped at the
     *  purchase amount, and never escalated. Default 0. */
    flatFee?: number;
    priceMode: PriceMode;
    manualPrice: number; // Used if mode is manual or API fails
    /** BTC already held before the first scheduled buy. Costed at startingAvgCost
     *  when given, else at the start date's market price. No fee applied. */
    startingBtc?: number;
    /** Average USD cost per BTC of the starting stack. */
    startingAvgCost?: number;
    /** Raise the per-purchase amount by this % on each 12-month anniversary of the start date. */
    annualEscalationPct?: number;
}

export interface DcaStats {
    /** Money-weighted annualized return (XIRR), % — null when the period is under ~90 days */
    xirrPercent: number | null;
    /** Largest peak-to-trough decline of portfolio value, %. The stack is marked to
     *  the series price on every UTC day from the first holding to the end date or
     *  the last price bar, whichever comes first — not only on purchase days.
     *  Null in manual mode, where a fixed price makes the walk meaningless. */
    maxDrawdownPercent: number | null;
    /** `priceKind` is set only when the price series carries observed/estimated markers. */
    bestBuy: { date: string; price: number; priceKind?: PriceKind } | null;
    worstBuy: { date: string; price: number; priceKind?: PriceKind } | null;
    /** Total exchange fees paid in USD (percentage plus flat, summed per buy) —
     *  scheduled buys only, never the starting stack */
    feesPaid: number;
    /** feesPaid as a % of the money put into scheduled buys (0 when there were none).
     *  Equals the fee percentage when there is no flat fee. */
    feePercentOfBuy: number;
    /** USD cost assigned to the starting stack (0 when none). Lets callers
     *  separate "the schedule" from "the whole stack" for fair comparisons. */
    startingStackCost: number;
    /**
     * How much of this result rests on estimated prices. Present only when the
     * price series carries observed/estimated markers; absent means "unknown",
     * not "all observed".
     */
    estimatedPrices?: {
        /** Scheduled buys priced on an estimated point (interpolated or carried forward). */
        purchases: number;
        /** Days of the max-drawdown walk priced on an estimated point. */
        drawdownDays: number;
        /** Days the max-drawdown walk covered in total. */
        drawdownDaysWalked: number;
    };
}

export interface DcaResult {
    totalInvested: number;
    btcAccumulated: number;
    averageCost: number;
    currentValue: number;
    profit: number;
    roi: number;
    breakdown: DcaBreakdownItem[];
    /** Set by every engine run (calculateDca, emptyDcaResult in utils/dca). */
    stats?: DcaStats;
}

/**
 * A backtest cut off at today: only purchases dated on or before today (UTC)
 * have happened, so only those are counted. See calculateDcaToDate.
 */
export interface DcaToDateResult extends DcaResult {
    /** The plan's own end date, UTC midnight ms. */
    plannedEndTs: number;
    /** The day these figures actually run to: the earlier of plannedEndTs and today (UTC midnight ms). */
    throughTs: number;
    /** True when the plan's end date is after today: it is still running, and any
     *  buys scheduled after today are left out. */
    endsInFuture: boolean;
    /** True when the plan starts after today: no scheduled buy has happened. */
    notStarted: boolean;
}

export interface DcaBreakdownItem {
    date: string;
    price: number;
    invested: number;
    totalInvested: number;
    accumulated: number;
    totalAccumulated: number;
    /** `totalAccumulated` at the market price for this row's date. On a buy that
     *  is `price`. On a starting-stack row with a stated cost it is the start
     *  date's market price where one is known, not the stated cost. */
    portfolioValue: number;
    /** Fee taken out of this buy, USD (percentage plus flat, capped at `invested`).
     *  0 on the starting-stack row. */
    fee: number;
    /** Whether `price` was observed or estimated. Set only when the price series
     *  carries markers, and never on a row priced by the user (manual mode, or a
     *  starting stack with a stated average cost). */
    priceKind?: PriceKind;
    /** True on the synthetic first row a starting stack adds — it is a position,
     *  not a market buy, and every "N purchases" count must exclude it. */
    isStartingStack?: boolean;
}

export interface LumpSumResult {
    totalInvested: number;
    btcAccumulated: number;
    currentValue: number;
    profit: number;
    roi: number;
}

export interface AssetDcaResult {
    asset: string;
    label: string;
    totalInvested: number;
    currentValue: number;
    profit: number;
    roi: number;
    breakdown: { date: string; portfolioValue: number }[];
}

export interface CalculatorSearchParams {
    amount?: string;
    frequency?: string;
    startDate?: string;
    endDate?: string;
    fee?: string;
    /** Flat fee per buy, in the link's currency like `amount`. */
    flat?: string;
    mode?: string;
    provider?: string;
    manualPrice?: string;
    currency?: string;
    startingBtc?: string;
    startingCost?: string;
    esc?: string;
}

export interface CostBasisPosition {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    amount: number;
    frequency: Frequency;
    feePercentage: number;
}

export interface HistoricalEvent {
    date: string;
    label: string;
    color: string;
}

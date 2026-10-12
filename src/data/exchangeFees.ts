/**
 * What a recurring bitcoin buy costs on each platform the site names: one
 * record per platform, read off that platform's own pricing page on the date
 * in `verifiedOn`.
 *
 * One definition, because the copies drifted. The same six figures were typed
 * by hand into the fee table, the calculator's preset chips and the
 * exchange-fees page. Swan's 0.5% promotion ended on 2026-09-08 and all three
 * still priced Swan at 0.5% a month later; the fee page's headline looked up
 * rates (1.49%, 0.26%) that had left its own table, so it never rendered.
 * Everything that shows or computes a platform's cost now reads it from here.
 *
 * Three rules the records follow:
 *  - A figure is what the platform itself publishes. Where it publishes none
 *    (Coinbase), `percent` is null and nothing is modelled: no estimate is
 *    invented to fill the cell.
 *  - Every figure says what it is made of (`includes`) and, in `note`, what it
 *    leaves out. The rows are not like-for-like and must not read as if they were.
 *  - A dated promotion carries its end date next to the terms it replaces, so
 *    it lapses by itself (see `promo` and resolveExchangeFee).
 *
 * No imports on purpose: plain data and pure functions, usable from server
 * pages, client components and tests alike.
 */

/** Which part of the cost a figure covers. */
export type FeeIncludes =
    /** An explicit fee. Any spread the platform also takes is not in the figure. */
    | 'fee'
    /** No fee is charged; the figure is the spread built into the quoted price. */
    | 'spread'
    /** The platform states both, and the figure covers both. */
    | 'both';

export interface FeeTerms {
    /** Percent of each buy. Null when the platform publishes no figure, in which
     *  case the row is listed but never priced. */
    percent: number | null;
    /** Fixed charge per buy in USD, on top of the percentage. 0 when there is none. */
    flatUsd: number;
    /** Text for a pricing cell. A leading "~" marks a figure the platform itself
     *  calls a target or a typical value, not a fixed rate. */
    rateLabel: string;
    /** Null exactly when `percent` is null. */
    includes: FeeIncludes | null;
    /** One short line for a table row: what the figure is and what it leaves out.
     *  "Flat" is kept for a fixed charge per buy (`flatUsd`): the calculator has
     *  a "Flat fee per buy" field, so a percentage is never called flat. */
    note: string;
}

export interface ExchangeFeeSource {
    label: string;
    url: string;
}

/** A paid plan that waives the platform's percentage fee up to a monthly volume. */
export interface FeeMembership {
    name: string;
    /** Price when billed monthly, USD. */
    monthlyUsd: number;
    /** Price when billed yearly, USD. */
    annualUsd: number;
    /** Trading volume per month the fee is waived on, USD. */
    feeFreeUsdPerMonth: number;
    /** Limits stated by the platform, in plain words. */
    note: string;
    source: ExchangeFeeSource;
}

export interface ExchangeFeeRecord extends FeeTerms {
    /** Stable key. Consumers look rows up by this, never by name or by rate:
     *  two platforms can charge the same percentage (Swan and Kraken both do). */
    id: string;
    name: string;
    /** Longer plain-English account of the figure: who says it, what else the
     *  platform charges, and what is not counted. */
    detail: string;
    /** The platform's own pages the figures were read from. */
    sources: readonly ExchangeFeeSource[];
    /** UTC day (yyyy-MM-dd) the figures were last checked against `sources`. */
    verifiedOn: string;
    /**
     * A time-limited rate. `terms` replace the standard terms above through
     * `validUntil` (inclusive, UTC day); from the next UTC day the standard
     * terms apply again with no edit needed. The standard terms are therefore
     * always "the value that applies afterwards".
     */
    promo?: {
        validUntil: string;
        terms: FeeTerms;
    };
    membership?: FeeMembership;
}

const REGISTRY = [
    {
        id: 'cash-app',
        name: 'Cash App',
        percent: 0,
        flatUsd: 0,
        rateLabel: '0%',
        includes: 'both',
        note: 'automatic buys: no fee and no spread',
        detail:
            "Cash App's fee page lists zero fees and zero spread on automatic buys (Auto Invest, Round Ups and paycheck deposits). A manual buy under $2,000 is priced differently: 0.9% to 2% depending on its size, plus a spread of up to 0.75%.",
        sources: [{ label: 'Cash App: bitcoin fees', url: 'https://cash.app/bitcoin/fees' }],
        verifiedOn: '2026-10-12',
    },
    {
        id: 'strike',
        name: 'Strike',
        percent: 0.22,
        flatUsd: 0,
        rateLabel: '~0.22%',
        includes: 'spread',
        note: 'spread only; no fee after the first week',
        detail:
            "Strike charges no fee on recurring buys after the first week and says it targets an all-in spread of 0.22%; the spread on any one buy can be higher or lower. Recurring buys in the first week also pay Strike's tiered fee, 0.89% at the lowest volume tier, which is not counted here.",
        sources: [{ label: 'Strike: What are the trading fees?', url: 'https://strike.me/support/what-are-the-trading-fees' }],
        verifiedOn: '2026-10-12',
    },
    {
        id: 'river',
        name: 'River',
        percent: 0.25,
        flatUsd: 0,
        rateLabel: '~0.25%',
        includes: 'spread',
        note: 'spread only; no fee after the first 7 days',
        detail:
            "River charges no fee on a recurring buy from seven days after it is set up and says its buy spread typically falls around 0.25%, varying with market conditions. The first order (the first seven days of a daily plan) also pays River's standard 1% fee, which is not counted here.",
        sources: [
            { label: "River: What are River's fees?", url: 'https://support.river.com/hc/en-us/articles/50055900679315-What-are-River-s-fees' },
            { label: 'River: Does River charge a spread?', url: 'https://support.river.com/hc/en-us/articles/45688848337811-Does-River-charge-a-spread' },
        ],
        verifiedOn: '2026-10-12',
    },
    {
        id: 'swan',
        name: 'Swan',
        percent: 1,
        flatUsd: 0,
        rateLabel: '1%',
        includes: 'fee',
        note: 'fee only; Swan says that is all it charges on a buy',
        detail:
            "Swan's fee page lists a 1% fee on buys and says that is all it charges on a buy. Two things are not counted here: a new client pays no fee on their first $250, and bitcoin left in Swan's own storage (Swan Safe) costs 0.03% of the balance a month unless auto-withdrawals are switched on.",
        sources: [{ label: 'Swan: fees', url: 'https://www.swanbitcoin.com/fees/' }],
        verifiedOn: '2026-10-12',
    },
    {
        id: 'kraken',
        name: 'Kraken',
        percent: 1,
        flatUsd: 0,
        rateLabel: '1% + spread',
        includes: 'fee',
        note: 'fee only; its spread is extra and not published',
        detail:
            "Kraken's fee schedule lists a 1% trading fee on instant and recurring buys. The price it quotes also includes a spread, which Kraken says varies with volatility, order size and account activity and does not publish as a number, so it is not counted here. Payment-method fees, such as card fees, are extra as well.",
        sources: [
            { label: 'Kraken: fee schedule', url: 'https://www.kraken.com/features/fee-schedule' },
            { label: 'Kraken: Kraken+', url: 'https://www.kraken.com/kraken-plus' },
        ],
        verifiedOn: '2026-10-12',
        membership: {
            name: 'Kraken+',
            monthlyUsd: 4.99,
            annualUsd: 49.99,
            feeFreeUsdPerMonth: 10_000,
            note: 'Monthly billing is offered through the mobile app only and the website sells the yearly plan. Spread and payment fees still apply, and benefits vary by region.',
            source: { label: 'Kraken: Kraken+', url: 'https://www.kraken.com/kraken-plus' },
        },
    },
    {
        id: 'coinbase',
        name: 'Coinbase',
        percent: null,
        flatUsd: 0,
        rateLabel: 'Set per order',
        includes: null,
        note: 'no fixed rate published; shown in the order preview',
        detail:
            "Coinbase's fee page gives no fixed fee or spread figure for an ordinary buy, so no total is shown here. It says the fee is worked out when you place the order and depends on payment method, order size and market conditions, that the quoted price includes a spread, and that both appear in the order preview before you confirm. It also says it tests fee changes across regions and order sizes. The only trading-fee figures on that page are for limit orders: a 1% execution fee, and a 1.875% Coinbase fee that it says varies by payment method. Its Coinbase One subscription removes trading fees with certain limitations, though a spread may still be included.",
        sources: [
            { label: 'Coinbase: pricing and fees disclosures', url: 'https://help.coinbase.com/en/coinbase/trading-and-funding/pricing-and-fees/fees' },
        ],
        verifiedOn: '2026-10-12',
    },
] as const satisfies readonly ExchangeFeeRecord[];

export type ExchangeFeeId = (typeof REGISTRY)[number]['id'];

/** Every platform the site names, in display order. */
export const EXCHANGE_FEES: readonly ExchangeFeeRecord[] = REGISTRY;

/** A record with any promotion already applied for one moment in time. */
export interface ResolvedExchangeFee extends FeeTerms {
    id: string;
    name: string;
    detail: string;
    sources: readonly ExchangeFeeSource[];
    verifiedOn: string;
    membership: FeeMembership | null;
    /** Set while a promotion is in force: its last UTC day and the pricing label
     *  that returns afterwards. Null otherwise. */
    promo: { validUntil: string; thenRateLabel: string } | null;
}

/** The UTC calendar day of an instant, yyyy-MM-dd. A NaN instant means "now". */
const utcIsoDay = (ts: number): string =>
    new Date(Number.isFinite(ts) ? ts : Date.now()).toISOString().slice(0, 10);

const termsOf = (terms: FeeTerms): FeeTerms => ({
    percent: terms.percent,
    flatUsd: terms.flatUsd,
    rateLabel: terms.rateLabel,
    includes: terms.includes,
    note: terms.note,
});

/**
 * The terms in force on `asOf`'s UTC day.
 *
 * yyyy-MM-dd strings sort the same way their dates do, so the promotion test
 * is a plain string comparison: no local time, no parsing.
 */
export function resolveExchangeFee(record: ExchangeFeeRecord, asOf: number = Date.now()): ResolvedExchangeFee {
    const promoActive = record.promo !== undefined && utcIsoDay(asOf) <= record.promo.validUntil;
    return {
        id: record.id,
        name: record.name,
        ...termsOf(promoActive && record.promo ? record.promo.terms : record),
        detail: record.detail,
        sources: record.sources,
        verifiedOn: record.verifiedOn,
        membership: record.membership ?? null,
        promo: promoActive && record.promo
            ? { validUntil: record.promo.validUntil, thenRateLabel: record.rateLabel }
            : null,
    };
}

/** Every row as of `asOf`, in display order. */
export function resolveExchangeFees(
    asOf: number = Date.now(),
    registry: readonly ExchangeFeeRecord[] = EXCHANGE_FEES,
): ResolvedExchangeFee[] {
    return registry.map((record) => resolveExchangeFee(record, asOf));
}

/** One row by id. The id is a union of the registry's own keys, so a removed
 *  platform is a compile error at every call site rather than a silent miss. */
export function exchangeFeeById(id: ExchangeFeeId, asOf: number = Date.now()): ResolvedExchangeFee {
    const record = EXCHANGE_FEES.find((r) => r.id === id);
    if (!record) throw new Error(`Unknown exchange fee id: ${id}`);
    return resolveExchangeFee(record, asOf);
}

/** Rows that carry a figure and can therefore be priced. */
export type PublishedFee = ResolvedExchangeFee & { percent: number; includes: FeeIncludes };

export const hasPublishedFee = (fee: ResolvedExchangeFee): fee is PublishedFee =>
    fee.percent !== null && fee.includes !== null;

/**
 * What a row costs over a whole schedule, in USD, or null when the platform
 * publishes no figure.
 *
 * Same arithmetic as the engine's per-buy `min(amount, amount x pct / 100 +
 * flat)`, summed. It is exact when every buy is the same size. With a yearly
 * raise it can only differ when a single buy is smaller than its own fee.
 */
export function feeCostUsd(
    terms: Pick<FeeTerms, 'percent' | 'flatUsd'>,
    totalInvested: number,
    purchaseCount: number,
): number | null {
    if (terms.percent === null) return null;
    if (!(totalInvested > 0) || !(purchaseCount > 0)) return 0;
    const cost = totalInvested * (terms.percent / 100) + Math.max(0, terms.flatUsd) * purchaseCount;
    return Math.min(totalInvested, Math.max(0, cost));
}

/**
 * A cost as money, in a currency it has already been converted to: to the
 * cent below 1,000 and in whole units from there up. `minorDigits` is 0 for a
 * currency with no minor unit (the yen).
 *
 * A fee on one small buy is usually under one unit, and it is still read as
 * money, so it is not given the extra decimals a sub-unit bitcoin price gets.
 * A cost too small to print is "under" the smallest amount, never 0: only a
 * platform that charges nothing reads as zero.
 */
export function feeCostLabel(amount: number, symbol: string, minorDigits: 0 | 2 = 2): string {
    const digits = amount >= 1000 ? 0 : minorDigits;
    const smallest = 10 ** -digits;
    if (amount > 0 && amount < smallest / 2) return `under ${symbol}${smallest.toFixed(digits)}`;
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

const usd = (value: number): string => `$${value.toFixed(2).replace(/\.00$/, '')}`;

/** "1%", "$0.99 flat" or "$0.99 + 0.5%": the bare numbers, with no qualifier. */
export function plainRateLabel(percent: number, flatUsd: number): string {
    if (flatUsd > 0) return percent > 0 ? `${usd(flatUsd)} + ${percent}%` : `${usd(flatUsd)} flat`;
    return `${percent}%`;
}

/** One calculator fee chip. */
export interface FeePreset {
    /** The registry id. Key the pressed state on this, not on the numbers. */
    id: string;
    name: string;
    /** Goes into DcaParams.feePercentage. */
    feePercentage: number;
    /** USD per buy; goes into DcaParams.flatFee (0 when the platform has none). */
    flatFee: number;
    /** Chip text, e.g. "Swan 1%". */
    label: string;
    includes: FeeIncludes;
    /** What the figure is and what it leaves out, for a caption or title. */
    note: string;
}

/**
 * The calculator's fee chips: every platform that publishes a figure.
 *
 * Coinbase has no chip because it publishes no rate; a made-up percentage
 * would be wrong for most order sizes.
 */
export function feePresetsAsOf(
    asOf: number = Date.now(),
    registry: readonly ExchangeFeeRecord[] = EXCHANGE_FEES,
): FeePreset[] {
    return resolveExchangeFees(asOf, registry)
        .filter(hasPublishedFee)
        .map((fee) => ({
            id: fee.id,
            name: fee.name,
            feePercentage: fee.percent,
            flatFee: fee.flatUsd,
            label: `${fee.name} ${plainRateLabel(fee.percent, fee.flatUsd)}`,
            includes: fee.includes,
            note: fee.note,
        }));
}

/** One distinct cost among the published rows, and which platforms sit on it. */
export interface FeeTier {
    percent: number;
    flatUsd: number;
    ids: string[];
}

/** The distinct published costs, cheapest first. */
export function feeTiersAsOf(
    asOf: number = Date.now(),
    registry: readonly ExchangeFeeRecord[] = EXCHANGE_FEES,
): FeeTier[] {
    const tiers: FeeTier[] = [];
    for (const fee of resolveExchangeFees(asOf, registry).filter(hasPublishedFee)) {
        const existing = tiers.find((t) => t.percent === fee.percent && t.flatUsd === fee.flatUsd);
        if (existing) existing.ids.push(fee.id);
        else tiers.push({ percent: fee.percent, flatUsd: fee.flatUsd, ids: [fee.id] });
    }
    return tiers.sort((a, b) => a.flatUsd - b.flatUsd || a.percent - b.percent);
}

/**
 * The two rows the exchange-fees page builds its worked sentences on ("an X%
 * fee ... instead of Y%"). Named here, not in the page, so the test beside
 * this file can prove both still carry a figure.
 */
export const FEE_EXAMPLE_IDS = { higher: 'kraken', lower: 'river' } as const satisfies Record<string, ExchangeFeeId>;

/**
 * Those two rows as of `asOf`, or null when the comparison would not hold:
 * either row has no percentage, either has a flat component (the sentences
 * speak of a percentage), or the "higher" one is no longer higher.
 */
export function feeExamplePair(asOf: number = Date.now()): { higher: PublishedFee; lower: PublishedFee } | null {
    const higher = exchangeFeeById(FEE_EXAMPLE_IDS.higher, asOf);
    const lower = exchangeFeeById(FEE_EXAMPLE_IDS.lower, asOf);
    if (!hasPublishedFee(higher) || !hasPublishedFee(lower)) return null;
    if (higher.flatUsd > 0 || lower.flatUsd > 0) return null;
    if (!(lower.percent > 0) || !(higher.percent > lower.percent)) return null;
    return { higher, lower };
}

/**
 * Monthly buy volume at which a membership's price equals the fee it waives,
 * for each billing option. Null when there is no membership or no fee to waive.
 */
export function membershipBreakEvenUsdPerMonth(
    fee: Pick<ResolvedExchangeFee, 'percent' | 'membership'>,
): { monthlyPlan: number; annualPlan: number } | null {
    if (!fee.membership || fee.percent === null || !(fee.percent > 0)) return null;
    const rate = fee.percent / 100;
    return {
        monthlyPlan: fee.membership.monthlyUsd / rate,
        annualPlan: fee.membership.annualUsd / 12 / rate,
    };
}

/** The oldest check date among the rows, so one label can never over-claim. */
export function feesLastVerified(registry: readonly ExchangeFeeRecord[] = EXCHANGE_FEES): string {
    return registry.reduce((oldest, r) => (r.verifiedOn < oldest ? r.verifiedOn : oldest), registry[0]?.verifiedOn ?? '');
}

/** Past this age the figures are shown with a warning instead of as current. */
export const FEE_CHECK_MAX_AGE_DAYS = 180;

/**
 * True when the oldest check is more than FEE_CHECK_MAX_AGE_DAYS before
 * `asOf`. Platforms reprice without notice; an unmaintained table should say
 * so itself.
 */
export function feesCheckIsStale(
    asOf: number = Date.now(),
    registry: readonly ExchangeFeeRecord[] = EXCHANGE_FEES,
): boolean {
    const checked = Date.parse(`${feesLastVerified(registry)}T00:00:00Z`);
    if (!Number.isFinite(checked)) return true;
    const now = Number.isFinite(asOf) ? asOf : Date.now();
    return now - checked > FEE_CHECK_MAX_AGE_DAYS * 86_400_000;
}

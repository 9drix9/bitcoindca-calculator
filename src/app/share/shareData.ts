import type { CalculatorSearchParams, DcaToDateResult, Frequency, PriceMode, PricePoint } from '@/types';
import { decodeParams, encodeParams, UrlCurrency } from '@/utils/urlParams';
import { calculateDcaToDate, priceSeriesCovers, withPriceKinds } from '@/utils/dca';
import {
    EARLIEST_PRICE_DATE,
    defaultStartFor,
    formatUtc,
    parseUtcDate,
    utcDayStart,
    utcIsoToday,
} from '@/utils/dates';
import { getBitcoinPriceHistoryWithMeta, getBitcoinSpot } from '@/app/actions';
import { DEFAULT_PLAN } from '@/data/planDefaults';
import { DEFAULT_PRICE_PROVIDER, PRICE_PROVIDER_LABELS, type PriceProvider } from '@/data/priceSources';
import { resolveServerCurrency, type ServerCurrencyConfig } from '@/utils/serverCurrency';

// Server-side share computation, used by /share (metadata), /api/og (image)
// and /embed (widget). Mirrors DcaCalculator semantics: `amount`, `flatFee`
// and `startingAvgCost` are entered in the sharer's display currency (divided
// by the rate before USD math), while `manualPrice` and all engine math stay
// in USD.
//
// One pipeline for all three surfaces, on purpose. /embed used to carry its
// own copy of it, and the copies had drifted: the embed counted a starting
// stack as a "buy" and the cards did not say a plan had one at all.
//
// Two rules every surface here follows:
//  1. History only. A link may carry an end date in the future (the calculator
//     shows that as a labelled projection), but a card that says "invested" and
//     "stacked" must not count purchases that have not happened. The run is cut
//     off at today (UTC); the link itself keeps the full plan.
//  2. Say what shaped the number. An assumed price, coins held before the first
//     buy, one exchange rate for every buy, a yearly raise and the fees all
//     change the result, so each is named wherever it applies
//     (shareAssumptionNotes).

// Currency config comes from utils/serverCurrency, which prefers live ECB
// rates and keeps dated constants only as an outage fallback.

const FREQUENCY_TITLE_SUFFIX: Record<Frequency, string> = {
    daily: '/day',
    weekly: '/week',
    biweekly: ' every 2 weeks',
    monthly: '/month',
};

const FREQUENCY_PHRASE: Record<Frequency, string> = {
    daily: 'every day',
    weekly: 'every week',
    biweekly: 'every 2 weeks',
    monthly: 'every month',
};

export interface ResolvedShareParams {
    amount: number; // in the share currency's units
    frequency: Frequency;
    startDate: string; // yyyy-MM-dd
    /** The plan's own end date, yyyy-MM-dd. May be in the future: it is what the
     *  link carries, not what the cards count up to. */
    endDate: string;
    feePercentage: number;
    /** Fixed fee per buy, in the share currency's units. */
    flatFee: number;
    priceMode: PriceMode;
    provider: PriceProvider;
    manualPrice: number; // USD
    currency: UrlCurrency;
    startingBtc: number;
    startingAvgCost: number; // in the share currency's units, per BTC
    annualEscalationPct: number;
}

export interface ShareCardData {
    title: string;
    description: string;
    /** Caption above the big figure. "Current value", except at an assumed
     *  price, where nothing about the figure is current. */
    valueLabel: string;
    /** e.g. "$19,683" — portfolio value in the share currency */
    currentValueText: string;
    /** e.g. "+$6,633 (+50.8%)" */
    profitText: string;
    isProfit: boolean;
    /** e.g. "$50 every week · Jul 2021 → Jul 2026 · 0.3097 BTC stacked · 0.5% fee" */
    paramsLine: string;
    /** True when the figures rest on something other than the requested
     *  exchange's current prices and live FX (a fallback or earlier series, no
     *  live quote, constant exchange rates). Callers cache such a card briefly. */
    degraded: boolean;
}

/** Normalize Next.js searchParams (string | string[]) into the calculator's shape. */
export function toCalculatorParams(raw: Record<string, string | string[] | undefined>): CalculatorSearchParams {
    const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    return {
        amount: pick(raw.amount),
        frequency: pick(raw.frequency),
        startDate: pick(raw.startDate),
        endDate: pick(raw.endDate),
        fee: pick(raw.fee),
        flat: pick(raw.flat),
        mode: pick(raw.mode),
        provider: pick(raw.provider),
        manualPrice: pick(raw.manualPrice),
        currency: pick(raw.currency),
        startingBtc: pick(raw.startingBtc),
        startingCost: pick(raw.startingCost),
        esc: pick(raw.esc),
    };
}

/**
 * The start date a link gets when it names none: DEFAULT_YEARS_BACK years
 * before its end date, but never before the first day we can price.
 *
 * decodeParams clamps a start date that is written in the link; the default
 * was computed afterwards with no clamp, so `?endDate=2012-01-01` produced a
 * card reading "since Jan 2007", and ran its weekly schedule on a 2007 phase
 * that came out one buy short of the same window asked for explicitly.
 * The rule itself is defaultStartFor (utils/dates), shared with /api/v1/dca.
 */
export function defaultShareStartDate(endDate: string): string {
    const endTs = parseUtcDate(endDate);
    return Number.isFinite(endTs) ? defaultStartFor(endTs) : EARLIEST_PRICE_DATE;
}

/**
 * Apply the calculator's defaults (data/planDefaults, data/priceSources) to
 * whatever survived validation. `now` is the instant "today" is read from.
 */
export function resolveShareParams(sp: CalculatorSearchParams, now: number = Date.now()): ResolvedShareParams {
    const decoded = decodeParams(sp) ?? {};

    const endDate = decoded.endDate ?? utcIsoToday(now);
    const startDate = decoded.startDate ?? defaultShareStartDate(endDate);

    return {
        amount: decoded.amount ?? DEFAULT_PLAN.amount,
        frequency: decoded.frequency ?? DEFAULT_PLAN.frequency,
        startDate,
        endDate,
        feePercentage: decoded.feePercentage ?? DEFAULT_PLAN.feePercentage,
        flatFee: decoded.flatFee ?? 0,
        priceMode: decoded.priceMode ?? 'api',
        provider: decoded.provider ?? DEFAULT_PRICE_PROVIDER,
        manualPrice: decoded.manualPrice ?? 0,
        currency: decoded.currency ?? 'USD',
        startingBtc: decoded.startingBtc ?? 0,
        startingAvgCost: decoded.startingAvgCost ?? 0,
        annualEscalationPct: decoded.annualEscalationPct ?? 0,
    };
}

/**
 * Canonical query string for the resolved params (redirect target, OG image
 * URL, embed link). Carries the plan exactly as resolved, future end date
 * included, so whoever opens it lands on the sender's whole plan. The cut-off
 * at today happens where figures are computed, never here.
 */
export function encodeShareQuery(p: ResolvedShareParams): string {
    return encodeParams({
        amount: p.amount,
        frequency: p.frequency,
        startDate: p.startDate,
        endDate: p.endDate,
        feePercentage: p.feePercentage,
        flatFee: p.flatFee,
        priceMode: p.priceMode,
        provider: p.provider,
        manualPrice: p.manualPrice,
        currency: p.currency,
        startingBtc: p.startingBtc,
        startingAvgCost: p.startingAvgCost,
        annualEscalationPct: p.annualEscalationPct,
    });
}

// ── Computation ───────────────────────────────────────────────────────────────

export interface ShareComputed {
    status: 'ok';
    /** The plan up to today (UTC): nothing dated after today is in it. */
    result: DcaToDateResult;
    cfg: ServerCurrencyConfig;
    startTs: number;
    /** UTC midnight of the day these figures were computed on. */
    todayTs: number;
    /** Scheduled buys that have happened. The starting stack is a position, not a buy. */
    purchaseCount: number;
    /** Whose prices these are, or null at an assumed (manual) price. */
    prices: {
        provider: PriceProvider;
        /** The requested exchange could not be reached and the other one answered. */
        fallback: boolean;
        /** The exchange could not be reached just now; this is its series from earlier. */
        stale: boolean;
        /** False when no live quote was available and the stack is valued at the latest daily price. */
        liveQuote: boolean;
    } | null;
}

export type ShareOutcome =
    | ShareComputed
    /** The link's own settings leave nothing to show: no amount, a start after
     *  the end, manual mode with no price, or fees that take the whole of every
     *  buy. Retrying cannot help. */
    | { status: 'invalid' }
    /** The first purchase is dated after today: there is no history to show yet. */
    | { status: 'not-started'; startTs: number }
    /** Prices could not be had just now. */
    | { status: 'unavailable' };

/**
 * Run the plan as far as today and say whose prices it was run on.
 * Never throws: every failure is one of the non-'ok' outcomes above.
 *
 * `now` is the instant "today" and the valuation are read from.
 */
export async function computeShareResult(p: ResolvedShareParams, now: number = Date.now()): Promise<ShareOutcome> {
    try {
        const startTs = parseUtcDate(p.startDate);
        const plannedEndTs = parseUtcDate(p.endDate);
        if (!Number.isFinite(startTs) || !Number.isFinite(plannedEndTs)) return { status: 'invalid' };
        // A plan with no purchase amount is a held stack, not a schedule: there
        // is no "$0/week" to put in a headline.
        if (!(p.amount > 0)) return { status: 'invalid' };
        if (p.priceMode === 'manual' && !(p.manualPrice > 0)) return { status: 'invalid' };

        // Checked before anything is fetched. A start date in the future used
        // to reach the price lookup, find nothing, and come back as "price data
        // is temporarily unavailable": an outage message for a date problem.
        // And before the order check, as in /api/v1/dca: a link with only a
        // future start date has today as its end date, and would otherwise be
        // told its start is after an end date it never named.
        const todayTs = utcDayStart(now);
        if (startTs > todayTs) return { status: 'not-started', startTs };
        if (startTs > plannedEndTs) return { status: 'invalid' };

        // History is asked for through today even when the plan ended years
        // ago: the stack is valued at today's price, and with no live quote
        // the engine falls back to the last row it was given. That row has to
        // be the newest one we have, not the plan's last purchase day.
        const [cfg, market] = await Promise.all([
            resolveServerCurrency(p.currency),
            p.priceMode === 'api'
                ? Promise.all([
                    getBitcoinPriceHistoryWithMeta(startTs, todayTs, p.provider),
                    getBitcoinSpot(p.provider),
                ])
                : null,
        ]);

        let priceData: PricePoint[] | undefined;
        let currentPrice: number | null | undefined;
        let prices: ShareComputed['prices'] = null;
        if (market) {
            const [history, spot] = market;
            priceData = withPriceKinds(history.data, history.kinds);
            // The engine carries the last price forward without limit, so a
            // series that stops short of today would price recent buys, and the
            // "current" value, at an old close.
            if (!priceSeriesCovers(priceData, startTs, todayTs)) return { status: 'unavailable' };
            currentPrice = spot && spot.price > 0 ? spot.price : null;
            prices = {
                provider: history.servedProvider,
                fallback: history.fallback,
                stale: history.stale,
                liveQuote: currentPrice !== null,
            };
        }

        const result = calculateDcaToDate(
            {
                amount: p.amount / cfg.rate,
                frequency: p.frequency,
                startDate: new Date(startTs),
                endDate: new Date(plannedEndTs),
                feePercentage: p.feePercentage,
                flatFee: p.flatFee > 0 ? p.flatFee / cfg.rate : undefined,
                priceMode: p.priceMode,
                manualPrice: p.manualPrice,
                startingBtc: p.startingBtc > 0 ? p.startingBtc : undefined,
                startingAvgCost: p.startingAvgCost > 0 ? p.startingAvgCost / cfg.rate : undefined,
                annualEscalationPct: p.annualEscalationPct,
            },
            priceData,
            currentPrice,
            now,
        );

        // The prices were there, so a run that still bought nothing is the
        // plan's doing (a flat fee at least as large as the amount takes the
        // whole of every buy) and no retry will change it.
        if (
            !(result.totalInvested > 0) ||
            !(result.btcAccumulated > 0) ||
            !(result.currentValue > 0) ||
            !Number.isFinite(result.totalInvested) ||
            !Number.isFinite(result.currentValue) ||
            !Number.isFinite(result.roi)
        ) {
            return { status: 'invalid' };
        }

        return {
            status: 'ok',
            result,
            cfg,
            startTs,
            todayTs,
            purchaseCount: result.breakdown.filter((row) => !row.isStartingStack).length,
            prices,
        };
    } catch (error) {
        console.error('[computeShareResult] failed:', error);
        return { status: 'unavailable' };
    }
}

// ── Wording ───────────────────────────────────────────────────────────────────

/**
 * Format a USD value in the share currency (converted via cfg.rate: the live
 * ECB rate from resolveServerCurrency, dated constants only when the FX
 * provider is unreachable).
 *
 * Results are shown to the whole unit. `exact` keeps cents, for a figure the
 * sharer typed (an assumed price) rather than one we computed.
 */
function formatShareCurrency(usd: number, currency: UrlCurrency, cfg: ServerCurrencyConfig, exact = false): string {
    const converted = usd * cfg.rate;
    const sign = converted < 0 ? '-' : '';
    const abs = Math.abs(converted);
    // Sub-unit values (early BTC history) would otherwise render as "$0"
    const digits = currency === 'JPY' ? 0 : abs > 0 && abs < 1 ? 4 : exact ? 2 : 0;
    return `${sign}${cfg.symbol}${abs.toLocaleString('en-US', { maximumFractionDigits: digits })}`;
}

/** Format an amount already denominated in the share currency (no conversion).
 *  Whole amounts stay bare ("$50"); anything else gets both cents ("$2.50"). */
function formatDisplayAmount(amount: number, cfg: ServerCurrencyConfig): string {
    const cents = Number.isInteger(amount) ? 0 : 2;
    return `${cfg.symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: cents, maximumFractionDigits: 2 })}`;
}

function formatBtcAmount(btc: number): string {
    if (!Number.isFinite(btc) || btc <= 0) return '0 BTC';
    if (btc >= 1) return `${btc.toLocaleString('en-US', { maximumFractionDigits: 2 })} BTC`;
    if (btc < 1e-6) return `${btc.toFixed(8)} BTC`;
    return `${Number(btc.toPrecision(4))} BTC`;
}

const formatPlainNumber = (value: number, maximumFractionDigits: number): string =>
    value.toLocaleString('en-US', { maximumFractionDigits });

/** A bitcoin amount the sharer typed, to the satoshi: an input is repeated
 *  back as entered, not rounded the way a computed total is. */
const formatBtcInput = (btc: number): string => `${formatPlainNumber(btc, 8)} BTC`;

/** "+94%" / "-3.3%" / "0%". The sign follows the rounded figure, so a return
 *  that rounds to zero is never printed as "+0%" or "-0%". Exported for the
 *  embed, so the card and the widget cannot print one return two ways. */
export function formatSignedPercent(value: number, fractionDigits: number): string {
    const scale = 10 ** fractionDigits;
    const rounded = Math.round(value * scale) / scale || 0;
    const text = rounded.toLocaleString('en-US', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
    return `${rounded > 0 ? '+' : ''}${text}%`;
}

/** "0.5%", "0.5% + $2.99", "$2.99", or null when the plan pays no fee. */
function feeRateText(p: ResolvedShareParams, cfg: ServerCurrencyConfig): string | null {
    const percent = p.feePercentage > 0 ? `${formatPlainNumber(p.feePercentage, 3)}%` : null;
    const flat = p.flatFee > 0 ? formatDisplayAmount(p.flatFee, cfg) : null;
    if (percent && flat) return `${percent} + ${flat}`;
    return percent ?? flat;
}

export interface SharePlanWording {
    /** "$50/week" */
    cadence: string;
    /** "Jan 2021": the month of the first purchase. */
    since: string;
    /** The month the figures run to: the plan's last month, or this one. */
    until: string;
    /** True while the plan reaches today (or beyond): "since Jan 2021" is then
     *  accurate. False for a plan that ended in the past, which is a closed
     *  range and has to be worded as one. */
    running: boolean;
    /** Short clauses naming what shaped the number; see shareAssumptionNotes. */
    notes: string[];
}

/**
 * Everything that shapes the result besides amount, cadence and dates, as
 * short clauses in a fixed order. One list for the OG image, the page metadata
 * and the embed, so no surface can show the number and leave a cause out.
 *
 * The cards used to print "$100/week since Jan 2025 → $92,663" for a plan
 * where $95,000 of the total was a 1 BTC starting stack, and "$50/week … with
 * 15,024 BTC stacked" for a $1/BTC hypothetical, with nothing to tell either
 * from a real backtest.
 */
export function shareAssumptionNotes(p: ResolvedShareParams, computed: ShareComputed): string[] {
    const { result, cfg, purchaseCount, prices } = computed;
    const notes: string[] = [];

    // manualPrice is USD (the calculator's field says so); every other figure
    // on the card is in the share currency, so it is shown converted.
    if (p.priceMode === 'manual') {
        notes.push(`at an assumed ${formatShareCurrency(p.manualPrice, p.currency, cfg, true)}/BTC (hypothetical)`);
    }
    // Keyed on the cost the engine actually booked: a stack it could not put a
    // price on is left out of the result, so it is left out of the wording.
    if ((result.stats?.startingStackCost ?? 0) > 0) {
        notes.push(`incl. ${formatBtcInput(p.startingBtc)} held at the start`);
    }
    if (p.annualEscalationPct > 0) {
        notes.push(`amount rises ${formatPlainNumber(p.annualEscalationPct, 2)}%/yr`);
    }
    const fee = feeRateText(p, cfg);
    if (!fee) notes.push('no fee');
    else notes.push(p.flatFee > 0 ? `${fee} fee per buy` : `${fee} fee`);

    if (result.endsInFuture) {
        notes.push(`plan runs to ${formatUtc(result.plannedEndTs, 'monthYear')}`);
    }
    // Only a marked series can say this, and today only Kraken's has any:
    // its history is weekly closes with the days between filled in.
    const estimated = result.stats?.estimatedPrices?.purchases ?? 0;
    if (estimated > 0) {
        notes.push(`${formatPlainNumber(estimated, 0)} of ${formatPlainNumber(purchaseCount, 0)} buy prices are estimates`);
    }
    if (prices?.fallback) {
        notes.push(`${PRICE_PROVIDER_LABELS[prices.provider].name} prices`);
    }
    // Last, and short enough for one row of a phone-width embed: there the
    // line wraps, and this clause in the middle of it costs a row more.
    const exchangeRate = exchangeRateNote(p, cfg);
    if (exchangeRate) notes.push(exchangeRate);
    return notes;
}

/**
 * True when amounts were converted with the constant rates because the FX
 * provider could not be reached. The rate divides the contribution before any
 * bitcoin is bought, so BTC stacked and the average cost move with it.
 */
export function isApproximateFx(p: ResolvedShareParams, cfg: ServerCurrencyConfig): boolean {
    return p.currency !== 'USD' && !cfg.live;
}

/** " of 2026-10-09", or nothing when the rate carries no date. */
const rateDate = (cfg: ServerCurrencyConfig): string => (cfg.asOf ? ` of ${cfg.asOf}` : '');

/**
 * What a card in another currency has to say about its exchange rate, or null
 * when there is nothing to say (US dollars).
 *
 * All the math is in dollars, and one rate converts every amount whenever its
 * buy was made. A euro card is therefore the dollar result at that rate, not
 * what the plan cost in euros day by day: the bitcoin stacked and the return
 * both differ from a euro saver's. The rate is named by its date, not as
 * "today's": the ECB publishes on working days only, and a preview is read
 * long after it was built.
 *
 * At an assumed price there is no history to convert and the rate cancels out
 * of every money figure, so only a rate taken from the constants is named.
 */
function exchangeRateNote(p: ResolvedShareParams, cfg: ServerCurrencyConfig): string | null {
    if (p.currency === 'USD') return null;
    const rate = `${cfg.live ? '' : 'approx. '}${p.currency} rate${rateDate(cfg)}`;
    if (p.priceMode === 'manual') return cfg.live ? null : rate;
    return `every buy at ${cfg.live ? 'the' : 'an'} ${rate}`;
}

export function describeSharePlan(p: ResolvedShareParams, computed: ShareComputed): SharePlanWording {
    const { result, cfg, startTs, todayTs } = computed;
    return {
        cadence: `${formatDisplayAmount(p.amount, cfg)}${FREQUENCY_TITLE_SUFFIX[p.frequency]}`,
        since: formatUtc(startTs, 'monthYear'),
        until: formatUtc(result.throughTs, 'monthYear'),
        running: result.plannedEndTs >= todayTs,
        notes: shareAssumptionNotes(p, computed),
    };
}

/**
 * Run the DCA backtest server-side and produce the share-card copy.
 * Returns null when a meaningful result cannot be computed — callers fall back
 * to generic branded metadata/imagery. Never throws.
 */
export async function computeShareCard(p: ResolvedShareParams, now: number = Date.now()): Promise<ShareCardData | null> {
    try {
        const computed = await computeShareResult(p, now);
        if (computed.status !== 'ok') return null;
        const { result, cfg, prices } = computed;
        const plan = describeSharePlan(p, computed);
        const manual = p.priceMode === 'manual';
        const approxFx = isApproximateFx(p, cfg);

        const currentValueText = formatShareCurrency(result.currentValue, p.currency, cfg);
        const investedText = formatShareCurrency(result.totalInvested, p.currency, cfg);
        const btcText = `${approxFx ? 'about ' : ''}${formatBtcAmount(result.btcAccumulated)}`;

        const isProfit = result.profit >= 0;
        const roiWhole = formatSignedPercent(result.roi, 0);
        const roiFull = formatSignedPercent(result.roi, 1);
        const profitAbs = formatShareCurrency(Math.abs(result.profit), p.currency, cfg);
        const profitText = `${isProfit ? '+' : '-'}${profitAbs} (${roiFull})`;

        // "since Jan 2021" claims the buying continued to today. A plan that
        // ended in the past is a closed range and is worded as one.
        const period = plan.running
            ? `since ${plan.since}`
            : plan.since === plan.until ? `during ${plan.since}` : `from ${plan.since} to ${plan.until}`;

        const stackCost = result.stats?.startingStackCost ?? 0;
        const hasStack = stackCost > 0;
        const stackBtcText = formatBtcInput(p.startingBtc);
        const manualPriceText = formatShareCurrency(p.manualPrice, p.currency, cfg, true);
        const feeRate = feeRateText(p, cfg);

        // The title is what a platform truncates first, so it carries only
        // compact markers, each placed BEFORE the figure it qualifies: a cut
        // title loses the number, never the caveat.
        const title = [
            plan.cadence,
            p.annualEscalationPct > 0 ? ` (+${formatPlainNumber(p.annualEscalationPct, 2)}%/yr)` : '',
            ' in Bitcoin',
            hasStack ? ` plus ${stackBtcText} already held,` : '',
            ` ${period}`,
            manual ? ` at an assumed ${manualPriceText}/BTC` : '',
            ` → ${currentValueText} (${roiWhole})`,
        ].join('');

        const invested = `Invested ${investedText}${result.endsInFuture ? ' so far' : ''} ${period}`;
        const sentences = [
            manual
                ? `${invested} at an assumed ${manualPriceText} per BTC, worth ${currentValueText} at that price (${roiFull} ROI) with ${btcText} stacked. Hypothetical, not market data.`
                : `${invested}, now worth ${currentValueText} (${roiFull} ROI) with ${btcText} stacked.`,
        ];
        if (hasStack) {
            sentences.push(`Includes ${stackBtcText} already held at the start, counted at ${formatShareCurrency(stackCost, p.currency, cfg)}.`);
        }
        // Ahead of the fees: a platform cuts a long description short, and
        // this moves the return further than they do (see exchangeRateNote).
        if (p.currency !== 'USD' && !manual) {
            sentences.push(`Every buy is converted at ${approxFx ? 'an approximate' : 'the'} ${p.currency} exchange rate${rateDate(cfg)}, not the rate on its own date.`);
        }
        if (p.annualEscalationPct > 0) {
            sentences.push(`The amount rises ${formatPlainNumber(p.annualEscalationPct, 2)}% a year.`);
        }
        sentences.push(feeRate ? `Fees: ${feeRate} per buy.` : 'No fees applied.');
        if (result.endsInFuture) {
            sentences.push(`The plan runs to ${formatUtc(result.plannedEndTs, 'monthYear')}; only purchases made so far are counted.`);
        }
        const estimated = result.stats?.estimatedPrices?.purchases ?? 0;
        if (estimated > 0) {
            sentences.push(`${formatPlainNumber(estimated, 0)} of ${formatPlainNumber(computed.purchaseCount, 0)} purchase prices are estimates rather than recorded closes.`);
        }
        if (prices?.fallback) {
            sentences.push(`Priced on ${PRICE_PROVIDER_LABELS[prices.provider].name} data because ${PRICE_PROVIDER_LABELS[p.provider].name} could not be reached.`);
        }
        if (approxFx && manual) {
            sentences.push(`Converted at an approximate ${p.currency} rate${rateDate(cfg)}.`);
        }
        sentences.push('Backtest your own at btcdollarcostaverage.com.');

        return {
            title,
            description: sentences.join(' '),
            valueLabel: manual ? 'Value at the assumed price' : 'Current value',
            currentValueText,
            profitText,
            isProfit,
            paramsLine: [
                `${formatDisplayAmount(p.amount, cfg)} ${FREQUENCY_PHRASE[p.frequency]}`,
                `${plan.since} → ${plan.until}`,
                `${btcText} stacked`,
                ...plan.notes,
            ].join(' · '),
            degraded: approxFx || (prices !== null && (prices.fallback || prices.stale || !prices.liveQuote)),
        };
    } catch (error) {
        console.error('[computeShareCard] failed:', error);
        return null;
    }
}

import { DAY_MS, EARLIEST_PRICE_DATE, EARLIEST_PRICE_TS } from '@/utils/dates';

/**
 * Where the bitcoin price history comes from, and the words used to say so.
 *
 * One definition, so the series a page is computed on and the series its copy
 * describes cannot disagree: anything that picks a provider, names one, or
 * explains a fallback (the calculator's state, every page that seeds a
 * backtest, the public API) reads it from here.
 *
 * Safe to import from client components: constants only. The price rows
 * themselves live in data/btcHistorical.ts, which stays server-side.
 */

export type PriceProvider = 'coinbase' | 'kraken';

export const PRICE_PROVIDERS: readonly PriceProvider[] = ['coinbase', 'kraken'];

/**
 * The series every surface uses unless a visitor or a link asks otherwise.
 *
 * Coinbase, because it has a close for every UTC day from 2015-07-20. Kraken's
 * public API only reaches that far back as WEEKLY candles, so six days out of
 * seven in its series are straight-line estimates between two weekly closes.
 * That is close enough for totals and wrong for anything that reads single
 * days. Measured on 2026-10-12 with the default plan ($50 a week for five
 * years): bitcoin stacked differed by 0.13%, but max drawdown read 47.1% on
 * Kraken against 48.8% on Coinbase, and for the first half of 2020, 27% against
 * 41%. A straight line through a week cannot fall as far as the week did.
 *
 * The cost: Coinbase's history takes fourteen requests where Kraken's arrives
 * in one, about 0.8s cold when measured on 2026-10-12. fetchCoinbaseSeries in
 * app/actions.ts keeps that to one small request in normal running.
 */
export const DEFAULT_PRICE_PROVIDER: PriceProvider = 'coinbase';

/** The provider used when the requested one cannot be reached. */
export const fallbackProviderFor = (provider: PriceProvider): PriceProvider =>
    provider === 'coinbase' ? 'kraken' : 'coinbase';

export const isPriceProvider = (value: unknown): value is PriceProvider =>
    value === 'coinbase' || value === 'kraken';

/**
 * Last day of the bundled blockchain.info series (data/btcHistorical.ts), and
 * the day after it, which is the first day an exchange candle is used.
 * datasets.test.ts pins both to the data file so they cannot drift from it.
 */
export const SNAPSHOT_END_DATE = '2015-07-19';
export const SNAPSHOT_END_TS = Date.UTC(2015, 6, 19);
export const FIRST_EXCHANGE_CLOSE_DATE = '2015-07-20';
export const FIRST_EXCHANGE_CLOSE_TS = SNAPSHOT_END_TS + DAY_MS;

/** Plain-English names. `option` is the wording for a provider picker. */
export const PRICE_PROVIDER_LABELS: Record<PriceProvider, { name: string; option: string; cadence: string }> = {
    coinbase: {
        name: 'Coinbase',
        option: 'Coinbase (daily closes)',
        cadence: 'one close per UTC day',
    },
    kraken: {
        name: 'Kraken',
        option: 'Kraken (weekly closes; daily values are straight-line estimates)',
        cadence: 'one close per week, with the days in between filled in along a straight line',
    },
};

/**
 * What a visitor is told when the series on screen is not the one they asked
 * for. Null when the requested provider answered.
 */
export function priceFallbackNotice(requested: PriceProvider, served: PriceProvider): string | null {
    if (requested === served) return null;
    return served === 'kraken'
        ? 'Coinbase was unreachable; these prices are Kraken weekly closes with straight-line fills.'
        : 'Kraken was unreachable; these prices are Coinbase daily closes.';
}

/**
 * What a visitor is told when the exchange could not be reached just now and
 * the prices on screen are a copy fetched earlier (PriceHistoryResult.stale).
 * The time is UTC, like every date on the site.
 */
export function priceStaleNotice(served: PriceProvider, fetchedAt: number): string {
    const when = new Date(fetchedAt).toISOString();
    return `${PRICE_PROVIDER_LABELS[served].name} could not be reached just now; `
        + `these prices were fetched on ${when.slice(0, 10)} at ${when.slice(11, 16)} UTC.`;
}

/**
 * The two stretches of history a "same plan, every start date" comparison can
 * be run over. Split by where the data comes from, never by price level:
 * before 2015-07-20 every row is blockchain.info's cross-exchange average;
 * from then on every row is a Coinbase daily candle.
 */
export type PriceEra = 'all' | 'exchange';

export const PRICE_ERAS: Record<PriceEra, { label: string; startDate: string; startTs: number }> = {
    all: {
        label: `All history (from ${EARLIEST_PRICE_DATE})`,
        startDate: EARLIEST_PRICE_DATE,
        startTs: EARLIEST_PRICE_TS,
    },
    exchange: {
        label: `Real exchange closes only (from ${FIRST_EXCHANGE_CLOSE_DATE})`,
        startDate: FIRST_EXCHANGE_CLOSE_DATE,
        startTs: FIRST_EXCHANGE_CLOSE_TS,
    },
};

export const isPriceEra = (value: unknown): value is PriceEra => value === 'all' || value === 'exchange';

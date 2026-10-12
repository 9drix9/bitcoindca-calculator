import { NextResponse } from 'next/server';
import {
    probeProviderHistory,
    getCurrentBitcoinPrice,
    getAssetPriceHistory,
    getFxRates,
    getMempoolFees,
    getFearGreedIndex,
    getBlockHeight,
    getCpiData,
    getBitcoinDominance,
    getCirculatingSupply,
} from '@/app/actions';
import { DAY_MS } from '@/utils/dates';
import { MAX_SERIES_LAG_DAYS } from '@/utils/priceSeries';
import { runAsLiveProbe, withDeadline } from '@/utils/upstream';

/**
 * Machine-readable health check for the nine third-party data sources this site
 * depends on (kraken, coinbase, yahoo, frankfurter, mempool.space,
 * alternative.me, FRED, CoinGecko, blockchain.info).
 *
 * The site is built to degrade quietly: every widget falls back to an honest
 * "unavailable" state rather than showing a wrong number. That is right for
 * visitors and useless for the owner — a provider can change a field name and
 * the only signal is a card that stopped rendering. Point any uptime monitor at
 * this route and it will say so.
 *
 * Every check asks its provider directly. The route is dynamic, and each check
 * runs inside runAsLiveProbe, which sends its requests with `cache: 'no-store'`
 * and skips the in-memory caches and stale fallbacks that keep visitors going.
 * Answered from any of those, a poll would report what a provider said the
 * last time someone asked, however long ago. (One exception: the finished
 * chunks of Coinbase's history cannot change and are still read from the
 * cache; the chunk that includes today is fetched live.)
 *
 * So that it cannot be used to amplify traffic against the providers, each
 * check is repeated at most once a minute if critical and once every ten
 * minutes otherwise (once a minute while it is failing, so recovery shows
 * promptly). Between runs the last result is returned unchanged, and every
 * check carries its own `checkedAt`: nothing here is presented as fresher than
 * it is. A 200 may additionally sit at the CDN for up to 60 seconds; the
 * top-level `checkedAt` says when the response was put together.
 *
 * The history checks use probeProviderHistory, not getBitcoinPriceHistory: the
 * visitor-facing path falls back to the other exchange, which would keep both
 * checks green until BOTH exchanges were down at once.
 *
 * Returns 200 when everything critical works, 503 when a CRITICAL provider is
 * down. Degraded non-critical providers are reported but do not fail the check,
 * because the site is genuinely still usable without the fear/greed index.
 * 'unconfigured' (FRED without an API key) is a deployment choice, not an
 * outage, and never degrades the overall status.
 *
 * Disallowed in robots.txt (/api/ is blocked) so it is never indexed.
 */
export const dynamic = 'force-dynamic';

type Status = 'ok' | 'degraded' | 'down' | 'unconfigured';

interface Check {
    name: string;
    critical: boolean;
    status: Status;
    ms: number;
    /** When this check last asked its provider. */
    checkedAt: string;
    detail?: string;
}

const CRITICAL_INTERVAL_MS = 60_000;
const OPTIONAL_INTERVAL_MS = 10 * 60_000;
/**
 * A monitor typically gives up after 30 seconds. Checks run side by side, so
 * this bounds the whole response and a hung provider is reported as down
 * instead of taking the health check down with it.
 */
const CHECK_DEADLINE_MS = 10_000;

async function check(
    name: string,
    critical: boolean,
    run: () => Promise<unknown>,
    validate: (v: unknown) => boolean,
): Promise<Check> {
    const started = Date.now();
    const checkedAt = new Date(started).toISOString();
    try {
        const value = await withDeadline(runAsLiveProbe(run), CHECK_DEADLINE_MS, name);
        const ms = Date.now() - started;
        if (value === null || value === undefined) {
            return { name, critical, status: 'down', ms, checkedAt, detail: 'provider returned no data' };
        }
        if (!validate(value)) {
            // The dangerous case: a 200 response whose SHAPE changed. This is what
            // silently produces NaN on the page rather than an empty state.
            return { name, critical, status: 'down', ms, checkedAt, detail: 'payload failed shape validation' };
        }
        return { name, critical, status: 'ok', ms, checkedAt };
    } catch (error) {
        return {
            name,
            critical,
            status: 'down',
            ms: Date.now() - started,
            checkedAt,
            detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
        };
    }
}

// Module state is per server instance, which is the level the limit is for:
// one instance asks each provider no more often than the intervals above.
const lastRuns = new Map<string, { at: number; failing: boolean; result: Promise<Check> }>();

/** `check`, at most once per interval; concurrent polls share the run in flight. */
function throttled(
    name: string,
    critical: boolean,
    run: () => Promise<unknown>,
    validate: (v: unknown) => boolean,
): Promise<Check> {
    const last = lastRuns.get(name);
    const interval = critical || last?.failing ? CRITICAL_INTERVAL_MS : OPTIONAL_INTERVAL_MS;
    if (last && Date.now() - last.at < interval) return last.result;

    const entry = { at: Date.now(), failing: false, result: check(name, critical, run, validate) };
    // check() never rejects, so this cannot leave an unhandled rejection.
    void entry.result.then((c) => {
        entry.failing = c.status !== 'ok';
    });
    lastRuns.set(name, entry);
    return entry.result;
}

const isSeries = (v: unknown): boolean =>
    Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && Number.isFinite((v[0] as number[])[1]);

/**
 * A bitcoin history that reaches the present. isSeries alone only looks at the
 * first row, which is always the bundled 2010 one and says nothing about
 * whether the exchange's part arrived. Not used for the S&P 500 (no bars on
 * weekends) or CPI (monthly, published weeks in arrears).
 */
const isCurrentHistory = (v: unknown): boolean => {
    if (!isSeries(v)) return false;
    const rows = v as [number, number][];
    const [ts, price] = rows[rows.length - 1];
    return Number.isFinite(price) && price > 0 && ts >= Date.now() - (MAX_SERIES_LAG_DAYS + 1) * DAY_MS;
};

const isPositiveNumber = (v: unknown): boolean => typeof v === 'number' && v > 0;

export async function GET() {
    const now = Date.now();

    const checks = await Promise.all([
        // Critical: the calculator's prices. Either exchange can stand in for the
        // other, but a visitor then sees a series or a quote they did not ask for.
        throttled('coinbase-history', true, () => probeProviderHistory('coinbase'), isCurrentHistory),
        throttled('coinbase-spot', true, () => getCurrentBitcoinPrice('coinbase'), isPositiveNumber),
        throttled('kraken-history', true, () => probeProviderHistory('kraken'), isCurrentHistory),
        throttled('kraken-spot', true, () => getCurrentBitcoinPrice('kraken'), isPositiveNumber),

        // Non-critical: the page degrades to an honest empty state without them.
        throttled('yahoo-sp500', false, () => getAssetPriceHistory('^SP500TR', now - 365 * DAY_MS, now), isSeries),
        throttled('frankfurter-fx', false, () => getFxRates(), (v) => typeof v === 'object' && v !== null && Object.keys(v).length > 0),
        throttled('mempool-fees', false, () => getMempoolFees(), (v) => typeof (v as { highFee?: number }).highFee === 'number'),
        throttled('fear-greed', false, () => getFearGreedIndex(), (v) => Number.isFinite((v as { value?: number }).value)),
        throttled('block-height', false, () => getBlockHeight(), isPositiveNumber),
        throttled('coingecko-dominance', false, () => getBitcoinDominance(), (v) => Number.isFinite((v as { dominancePercent?: number }).dominancePercent)),
        throttled('blockchain-supply', false, () => getCirculatingSupply(), isPositiveNumber),
        // A present-but-expired key is the failure this route exists to catch;
        // an absent key means the inflation overlay is intentionally off.
        process.env.FRED_API_KEY
            ? throttled('fred-cpi', false, () => getCpiData(Date.UTC(2015, 0, 1), now), isSeries)
            : Promise.resolve<Check>({
                name: 'fred-cpi',
                critical: false,
                status: 'unconfigured',
                ms: 0,
                checkedAt: new Date(now).toISOString(),
                detail: 'FRED_API_KEY not set',
            }),
    ]);

    const failedCritical = checks.filter((c) => c.critical && c.status !== 'ok');
    const failedOptional = checks.filter((c) => !c.critical && c.status !== 'ok' && c.status !== 'unconfigured');

    const status: Status = failedCritical.length > 0 ? 'down' : failedOptional.length > 0 ? 'degraded' : 'ok';

    return NextResponse.json(
        {
            status,
            checkedAt: new Date(now).toISOString(),
            summary: `${checks.filter((c) => c.status === 'ok').length}/${checks.filter((c) => c.status !== 'unconfigured').length} providers ok`,
            failing: [...failedCritical, ...failedOptional].map((c) => c.name),
            checks,
        },
        {
            // 503 only for critical failures — a monitor should page for "the
            // calculator is broken", not for "the fear and greed widget is quiet".
            status: failedCritical.length > 0 ? 503 : 200,
            headers: {
                // No stale-while-revalidate: it would answer a poll with the
                // previous poll's result. And an outage is never held at the
                // CDN, so recovery is visible on the next request.
                'Cache-Control': failedCritical.length > 0 ? 'no-store' : 'public, max-age=0, s-maxage=60',
            },
        },
    );
}

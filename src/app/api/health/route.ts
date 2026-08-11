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
    getComparisonStaleness,
} from '@/app/actions';
import { DAY_MS } from '@/utils/dates';

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
 * The history checks use probeProviderHistory, not getBitcoinPriceHistory: the
 * visitor-facing path silently falls back to the other exchange, which would
 * keep both checks green until BOTH exchanges were down at once.
 *
 * Returns 200 when everything critical works, 503 when a CRITICAL provider is
 * down. Degraded non-critical providers are reported but do not fail the check,
 * because the site is genuinely still usable without the fear/greed index.
 * 'unconfigured' (FRED without an API key) is a deployment choice, not an
 * outage, and never degrades the overall status.
 *
 * Cached for 60s so it cannot be used to amplify traffic against the upstreams,
 * and disallowed in robots.txt (/api/ is blocked) so it is never indexed.
 */
export const revalidate = 60;

type Status = 'ok' | 'degraded' | 'down' | 'unconfigured';

interface Check {
    name: string;
    critical: boolean;
    status: Status;
    ms: number;
    detail?: string;
}

async function check(
    name: string,
    critical: boolean,
    run: () => Promise<unknown>,
    validate: (v: unknown) => boolean,
): Promise<Check> {
    const started = Date.now();
    try {
        const value = await run();
        const ms = Date.now() - started;
        if (value === null || value === undefined) {
            return { name, critical, status: 'down', ms, detail: 'provider returned no data' };
        }
        if (!validate(value)) {
            // The dangerous case: a 200 response whose SHAPE changed. This is what
            // silently produces NaN on the page rather than an empty state.
            return { name, critical, status: 'down', ms, detail: 'payload failed shape validation' };
        }
        return { name, critical, status: 'ok', ms };
    } catch (error) {
        return {
            name,
            critical,
            status: 'down',
            ms: Date.now() - started,
            detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
        };
    }
}

const isSeries = (v: unknown): boolean =>
    Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && Number.isFinite((v[0] as number[])[1]);

export async function GET() {
    const now = Date.now();

    const checks = await Promise.all([
        // Critical: without these the calculator itself cannot produce a result.
        check('kraken-history', true, () => probeProviderHistory('kraken'), isSeries),
        check('kraken-spot', true, () => getCurrentBitcoinPrice('kraken'), (v) => typeof v === 'number' && v > 0),
        check('coinbase-history', true, () => probeProviderHistory('coinbase'), isSeries),

        // Non-critical: the page degrades to an honest empty state without them.
        check('yahoo-sp500', false, () => getAssetPriceHistory('^SP500TR', now - 365 * DAY_MS, now), isSeries),
        check('frankfurter-fx', false, () => getFxRates(), (v) => typeof v === 'object' && v !== null && Object.keys(v).length > 0),
        check('mempool-fees', false, () => getMempoolFees(), (v) => typeof (v as { highFee?: number }).highFee === 'number'),
        check('fear-greed', false, () => getFearGreedIndex(), (v) => Number.isFinite((v as { value?: number }).value)),
        check('block-height', false, () => getBlockHeight(), (v) => typeof v === 'number' && v > 0),
        check('coingecko-dominance', false, () => getBitcoinDominance(), (v) => Number.isFinite((v as { dominancePercent?: number }).dominancePercent)),
        check('blockchain-supply', false, () => getCirculatingSupply(), (v) => typeof v === 'number' && v > 0),
        // A present-but-expired key is the failure this route exists to catch;
        // an absent key means the inflation overlay is intentionally off.
        process.env.FRED_API_KEY
            ? check('fred-cpi', false, () => getCpiData(Date.UTC(2015, 0, 1), now), isSeries)
            : Promise.resolve<Check>({ name: 'fred-cpi', critical: false, status: 'unconfigured', ms: 0, detail: 'FRED_API_KEY not set' }),
    ]);

    // getAssetPriceHistory/getCpiData serve an expired cache through an outage —
    // right for visitors, but it makes the checks above pass on stale data.
    // Read AFTER the checks ran, so the markers reflect this request's attempt.
    const staleness = await getComparisonStaleness();
    for (const c of checks) {
        if (c.status !== 'ok') continue;
        if ((c.name === 'yahoo-sp500' && staleness.yahooStale) || (c.name === 'fred-cpi' && staleness.fredStale)) {
            c.status = 'degraded';
            c.detail = 'serving stale cached series; provider unreachable';
        }
    }

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
            headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120' },
        },
    );
}

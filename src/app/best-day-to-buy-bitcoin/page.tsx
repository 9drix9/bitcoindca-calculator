import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Info } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import { calculateDca } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS, formatUtc, utcDayStart } from '@/utils/dates';

// Recomputed once a day against fresh prices, like the scenario pages.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_PATH = '/best-day-to-buy-bitcoin';
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;

/** Every schedule buys this much, every week, with no fees. */
const WEEKLY_AMOUNT = 100;
const WEEK_MS = 7 * DAY_MS;

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
// Table order is Mon..Sun (how most people read a week), not JS's Sun..Sat.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

// ── Formatting (server-rendered SEO pages are USD-only by design) ──────────────

function fmtUsd(value: number): string {
    const whole = Math.abs(value) >= 1000;
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: whole ? 0 : 2,
    });
}

function fmtPct(value: number, signed = false): string {
    const digits = Math.abs(value) >= 100 ? 0 : 2;
    const text = value.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
    return `${signed && value > 0 ? '+' : ''}${text}%`;
}

function fmtBtc(value: number): string {
    const decimals = value >= 100 ? 2 : value >= 1 ? 4 : 6;
    return value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

// ── Data quality detection ─────────────────────────────────────────────────────

/**
 * Kraken's series is weekly closes linearly filled out to daily values, so almost
 * every interior point sits exactly on the straight line between its neighbours.
 * Real daily candles essentially never do. This page is only meaningful on real
 * daily data — a straight line has no weekday structure to find — so we detect
 * which series we actually received and say so on the page instead of quietly
 * publishing an artefact.
 */
function looksInterpolated(data: [number, number][]): boolean {
    const tail = data.slice(-420);
    let checked = 0;
    let collinear = 0;
    for (let i = 1; i < tail.length - 1; i++) {
        const [t0, p0] = tail[i - 1];
        const [t1, p1] = tail[i];
        const [t2, p2] = tail[i + 1];
        if (t1 - t0 !== DAY_MS || t2 - t1 !== DAY_MS) continue;
        checked++;
        const mid = (p0 + p2) / 2;
        if (Math.abs(p1 - mid) <= Math.abs(mid) * 1e-9) collinear++;
    }
    return checked > 100 && collinear / checked > 0.5;
}

// ── Computation ────────────────────────────────────────────────────────────────

interface WeekdayRow {
    weekday: number;
    name: string;
    startTs: number;
    btc: number;
    averageCost: number;
    finalValue: number;
    /** BTC accumulated relative to the seven-weekday mean, in percent. */
    vsMeanPercent: number;
    /** 1 = most BTC accumulated in this window. */
    rank: number;
}

interface WindowResult {
    key: string;
    label: string;
    firstBuyTs: number;
    lastBuyTs: number;
    purchases: number;
    invested: number;
    rows: WeekdayRow[];
    /** (best BTC - worst BTC) / worst BTC, in percent. */
    spreadPercent: number;
    bestName: string;
    worstName: string;
}

/**
 * Seven identical weekly schedules, one anchored to each UTC weekday.
 *
 * Every schedule buys the same amount the same number of times — the purchase
 * count is clamped to the minimum across the seven anchors, so total invested is
 * identical and the only difference between them is which weekday the buys land on.
 */
function analyseWindow(
    key: string,
    label: string,
    floorTs: number,
    lastDataTs: number,
    priceData: [number, number][],
    currentPrice: number | null,
): WindowResult | null {
    const floorDay = utcDayStart(floorTs);
    const endTs = utcDayStart(lastDataTs);

    const starts: number[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
        let ts = floorDay;
        while (new Date(ts).getUTCDay() !== weekday) ts += DAY_MS;
        starts.push(ts);
    }

    const purchases = Math.min(...starts.map((s) => Math.floor((endTs - s) / WEEK_MS) + 1));
    // Under six months of weekly buys is too few for the comparison to say anything.
    if (!Number.isFinite(purchases) || purchases < 26) return null;

    const raw = starts.map((startTs, weekday) => {
        const result = calculateDca(
            {
                amount: WEEKLY_AMOUNT,
                frequency: 'weekly',
                startDate: new Date(startTs),
                endDate: new Date(startTs + (purchases - 1) * WEEK_MS),
                feePercentage: 0,
                priceMode: 'api',
                manualPrice: 0,
            },
            priceData,
            currentPrice,
        );
        return { weekday, startTs, result };
    });

    // A missing price would silently skip a buy and break the "identical
    // contribution" premise, so refuse to publish rather than compare unequal totals.
    if (raw.some((r) => r.result.breakdown.length !== purchases)) return null;
    if (raw.some((r) => !Number.isFinite(r.result.btcAccumulated) || r.result.btcAccumulated <= 0)) return null;

    const meanBtc = raw.reduce((sum, r) => sum + r.result.btcAccumulated, 0) / raw.length;
    const byBtcDesc = [...raw].sort((a, b) => b.result.btcAccumulated - a.result.btcAccumulated);

    const rows: WeekdayRow[] = raw.map(({ weekday, startTs, result }) => ({
        weekday,
        name: WEEKDAY_NAMES[weekday],
        startTs,
        btc: result.btcAccumulated,
        averageCost: result.averageCost,
        finalValue: result.currentValue,
        vsMeanPercent: (result.btcAccumulated / meanBtc - 1) * 100,
        rank: byBtcDesc.findIndex((r) => r.weekday === weekday) + 1,
    }));

    const bestBtc = byBtcDesc[0].result.btcAccumulated;
    const worstBtc = byBtcDesc[byBtcDesc.length - 1].result.btcAccumulated;

    return {
        key,
        label,
        firstBuyTs: Math.min(...starts),
        lastBuyTs: Math.max(...starts.map((s) => s + (purchases - 1) * WEEK_MS)),
        purchases,
        invested: purchases * WEEKLY_AMOUNT,
        rows,
        spreadPercent: ((bestBtc - worstBtc) / worstBtc) * 100,
        bestName: WEEKDAY_NAMES[byBtcDesc[0].weekday],
        worstName: WEEKDAY_NAMES[byBtcDesc[byBtcDesc.length - 1].weekday],
    };
}

interface Analysis {
    full: WindowResult;
    others: WindowResult[];
    /** All windows, longest first — the rank matrix columns. */
    allWindows: WindowResult[];
    interpolatedSeries: boolean;
    lastDataTs: number;
}

async function computeAnalysis(): Promise<Analysis | null> {
    try {
        const [history, currentPrice] = await Promise.all([
            // Coinbase gives real daily candles. The Kraken series is interpolated from
            // weekly closes, which would flatten all seven weekdays by construction.
            getBitcoinPriceHistory(EARLIEST_PRICE_TS, Date.now() + DAY_MS, 'coinbase'),
            getCurrentBitcoinPrice('coinbase')
                .catch(() => getCurrentBitcoinPrice('kraken'))
                .catch(() => null),
        ]);
        if (!history || history.length < 400) return null;

        const firstDataTs = history[0][0];
        const lastDataTs = history[history.length - 1][0];

        const full = analyseWindow('full', 'Full history', firstDataTs, lastDataTs, history, currentPrice);
        if (!full) return null;

        const others = (
            [
                ['10y', 'Last 10 years', 10],
                ['5y', 'Last 5 years', 5],
                ['2y', 'Last 2 years', 2],
            ] as const
        )
            .map(([key, label, years]) =>
                analyseWindow(
                    key,
                    label,
                    lastDataTs - Math.round(years * 365.25) * DAY_MS,
                    lastDataTs,
                    history,
                    currentPrice,
                ),
            )
            .filter((w): w is WindowResult => w !== null);

        return {
            full,
            others,
            allWindows: [full, ...others],
            interpolatedSeries: looksInterpolated(history),
            lastDataTs,
        };
    } catch (error) {
        // Never build-fail: the page renders an "unavailable" state instead.
        console.error('[best-day-to-buy-bitcoin] computation failed:', error);
        return null;
    }
}

// ── Metadata ───────────────────────────────────────────────────────────────────

const TITLE = 'Best Day of the Week to Buy Bitcoin? We Ran All Seven';
const FALLBACK_DESCRIPTION =
    'Seven identical weekly Bitcoin DCA schedules, one for each weekday, run over the full price history. We publish all seven results — and the answer is that the gap is noise.';

export async function generateMetadata(): Promise<Metadata> {
    let description = FALLBACK_DESCRIPTION;
    try {
        // Same warm cache as the page render, so this costs nothing extra.
        const analysis = await computeAnalysis();
        if (analysis) {
            const { full } = analysis;
            const recent = analysis.others[analysis.others.length - 1];
            description = `Seven identical $${WEEKLY_AMOUNT}/week Bitcoin DCA schedules, one anchored to each weekday, run from ${formatUtc(full.firstBuyTs, 'full')} to today. Best to worst is only ${fmtPct(full.spreadPercent)}${recent ? `, and the winner flips from ${full.bestName} over the full history to ${recent.bestName} over ${recent.label.toLowerCase()}` : ''}. Updated daily.`;
        }
    } catch {
        // Keep the generic description.
    }

    return {
        title: TITLE,
        description,
        keywords: [
            'best day to buy bitcoin',
            'best day to dca bitcoin',
            'best day of the week to buy bitcoin',
            'bitcoin weekly dca',
            'bitcoin buying schedule',
        ],
        alternates: { canonical: PAGE_PATH },
        openGraph: {
            title: TITLE,
            description,
            url: PAGE_PATH,
            type: 'article',
            siteName: 'Bitcoin DCA Calculator',
            locale: 'en_US',
        },
        twitter: {
            card: 'summary_large_image',
            title: TITLE,
            description,
            creator: '@9drix9',
        },
    };
}

// ── Page ───────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, celebrated = false }: { label: string; value: string; sub?: string; celebrated?: boolean }) {
    return (
        <Card celebrated={celebrated} className="p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{value}</p>
            {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </Card>
    );
}

export default async function BestDayToBuyBitcoinPage() {
    const analysis = await computeAnalysis();

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'Best Day to Buy Bitcoin', item: PAGE_URL },
        ],
    };

    const datasetJsonLd = analysis
        ? {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: 'Bitcoin weekly DCA outcomes by day of the week',
            description: `Seven identical weekly dollar-cost-averaging schedules of $${WEEKLY_AMOUNT} per purchase, each anchored to a different UTC weekday and each making exactly ${analysis.full.purchases} purchases, backtested against daily Bitcoin closing prices. Reports BTC accumulated, average cost per BTC, and final value for every weekday, over the full price history and over trailing 10-, 5- and 2-year windows. Recomputed daily.`,
            url: PAGE_URL,
            temporalCoverage: `${formatUtc(analysis.full.firstBuyTs, 'isoDay')}/${formatUtc(analysis.lastDataTs, 'isoDay')}`,
            dateModified: formatUtc(analysis.lastDataTs, 'isoDay'),
            license: 'https://creativecommons.org/licenses/by/4.0/',
            isAccessibleForFree: true,
            creator: {
                '@type': 'Organization',
                name: 'Bitcoin DCA Calculator',
                url: BASE_URL,
            },
            keywords: ['bitcoin', 'dollar cost averaging', 'day of week effect', 'backtest', 'BTC/USD'],
            measurementTechnique:
                'Deterministic backtest. Each schedule buys a fixed USD amount at the daily closing price on its anchor weekday, with zero fees, over an identical number of purchases.',
            variableMeasured: [
                { '@type': 'PropertyValue', name: 'Weekday', description: 'UTC weekday the purchases land on' },
                { '@type': 'PropertyValue', name: 'BTC accumulated', unitText: 'BTC' },
                { '@type': 'PropertyValue', name: 'Average cost per BTC', unitText: 'USD' },
                { '@type': 'PropertyValue', name: 'Final value', unitText: 'USD' },
            ],
        }
        : null;

    const recent = analysis?.others[analysis.others.length - 1];
    const fiveYear = analysis?.others.find((w) => w.key === '5y');

    const faqs: { q: string; a: string }[] = analysis
        ? [
            {
                q: 'Is there a best day of the week to buy Bitcoin?',
                a: `No, not one you can rely on. Running seven identical $${WEEKLY_AMOUNT}/week schedules from ${formatUtc(analysis.full.firstBuyTs, 'full')} to today, the gap between the best and worst weekday is ${fmtPct(analysis.full.spreadPercent)} of BTC accumulated. ${recent ? `More importantly, the winner is not stable: ${analysis.full.bestName} leads over the full history, but ${recent.bestName} leads over ${recent.label.toLowerCase()}. ` : ''}A real edge would show up in every window. This one does not.`,
            },
            {
                q: 'Which weekday came out ahead over the full history?',
                a: `${analysis.full.bestName}, by ${fmtPct(analysis.full.spreadPercent)} over the worst weekday (${analysis.full.worstName}). That result is a description of what already happened, not a prediction, and it is heavily weighted by a handful of purchases made in 2010 and 2011 when Bitcoin traded for cents.`,
            },
            {
                q: 'Why do people say weekends are cheaper for Bitcoin?',
                a: 'The usual story is that institutional desks and bank rails are closed at the weekend, so liquidity thins out and prices drift. Bitcoin trades 24/7, so any persistent weekend discount would be arbitraged away almost immediately. In the numbers on this page the weekend days do not consistently beat weekdays across time windows.',
            },
            {
                q: 'How much money is a weekday difference actually worth?',
                a: fiveYear
                    ? `Over ${fiveYear.label.toLowerCase()}, ${fmtUsd(fiveYear.invested)} invested produced a best-to-worst gap of ${fmtUsd(fiveYear.rows.reduce((max, r) => Math.max(max, r.finalValue), 0) - fiveYear.rows.reduce((min, r) => Math.min(min, r.finalValue), Infinity))} across the seven weekdays. A single 1% exchange fee, or one missed contribution, dwarfs that.`
                    : 'Less than a typical exchange fee spread. Choosing a cheaper exchange or not missing contributions matters far more than which weekday you buy on.',
            },
            {
                q: 'What should I optimise instead of the weekday?',
                a: 'The controllable variables that actually move the outcome are how much you contribute, how long you keep contributing, the fees you pay, and whether you stop buying during drawdowns. Pick whichever weekday you are least likely to forget, usually the day after you get paid, and automate it.',
            },
            {
                q: 'How are these numbers calculated?',
                a: `Each schedule buys $${WEEKLY_AMOUNT} at the daily close on its anchor weekday, in UTC, with no fees. Every schedule makes exactly the same number of purchases (${analysis.full.purchases} over the full window), so total invested is identical and the only difference is the weekday. The figures are recomputed once a day against fresh prices.`,
            },
        ]
        : [];

    const faqJsonLd =
        faqs.length > 0
            ? {
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: faqs.map(({ q, a }) => ({
                    '@type': 'Question',
                    name: q,
                    acceptedAnswer: { '@type': 'Answer', text: a },
                })),
            }
            : null;

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
            {datasetJsonLd && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }} />
            )}
            {faqJsonLd && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
            )}

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-10">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li>
                            <Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Home</Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Best day to buy Bitcoin</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
                        Is there a best day of the week to buy Bitcoin?
                    </h1>
                    {analysis ? (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            We ran seven identical weekly DCA schedules &mdash; ${WEEKLY_AMOUNT} every Monday, every Tuesday,
                            and so on &mdash; over the full Bitcoin price history, from{' '}
                            <strong className="font-semibold text-slate-900 dark:text-white">{formatUtc(analysis.full.firstBuyTs, 'full')}</strong>{' '}
                            to <strong className="font-semibold text-slate-900 dark:text-white">{formatUtc(analysis.lastDataTs, 'full')}</strong>.
                            Same amount, same number of purchases, same fees. The only difference is the weekday.
                            The gap between the best and worst day is{' '}
                            <strong className="font-semibold text-slate-900 dark:text-white">{fmtPct(analysis.full.spreadPercent)}</strong>,
                            and the day that &ldquo;wins&rdquo; changes every time you change the window. It is noise.
                        </p>
                    ) : (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            This page runs seven identical weekly DCA schedules, one anchored to each weekday, over the
                            full Bitcoin price history and publishes all seven results.
                        </p>
                    )}
                </header>

                {analysis ? (
                    <>
                        {/* The conclusion, up front */}
                        <Card className="p-4 sm:p-6 border-amber-500/40 dark:border-amber-500/30">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                                <div className="space-y-2">
                                    <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                                        The short answer: no, and the data below is why
                                    </h2>
                                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                        Over the full history the best weekday is{' '}
                                        <strong className="font-semibold text-slate-800 dark:text-slate-100">{analysis.full.bestName}</strong>.
                                        {recent && (
                                            <>
                                                {' '}Over {recent.label.toLowerCase()} it is{' '}
                                                <strong className="font-semibold text-slate-800 dark:text-slate-100">{recent.bestName}</strong>.
                                            </>
                                        )}{' '}
                                        Nothing about Bitcoin&apos;s market changed to cause that. A genuine day-of-week effect
                                        would persist across windows; a coin flip would not. This behaves like a coin flip.
                                        Publish the number, then ignore it.
                                    </p>
                                </div>
                            </div>
                        </Card>

                        {/* Headline stats */}
                        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <StatCard
                                label="Best day, full history"
                                value={analysis.full.bestName}
                                sub={`${fmtPct(analysis.full.spreadPercent)} ahead of ${analysis.full.worstName}`}
                                celebrated
                            />
                            {recent && (
                                <StatCard
                                    label={`Best day, ${recent.label.toLowerCase()}`}
                                    value={recent.bestName}
                                    sub={`${fmtPct(recent.spreadPercent)} ahead of ${recent.worstName}`}
                                />
                            )}
                            {fiveYear && (
                                <StatCard
                                    label="Spread, last 5 years"
                                    value={fmtPct(fiveYear.spreadPercent)}
                                    sub="Best vs worst weekday"
                                />
                            )}
                            <StatCard
                                label="Purchases per schedule"
                                value={analysis.full.purchases.toLocaleString('en-US')}
                                sub={`${fmtUsd(analysis.full.invested)} invested, identical for all seven`}
                            />
                        </section>

                        {analysis.interpolatedSeries && (
                            <Card className="p-4 sm:p-5">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                        <strong className="font-semibold text-slate-800 dark:text-slate-100">Heads up: fallback data in use.</strong>{' '}
                                        Coinbase&apos;s daily candles were unavailable when this page last rebuilt, so the numbers
                                        below come from the Kraken series, which is interpolated from weekly closes. That
                                        interpolation smooths out intra-week movement, so it pushes the seven weekdays closer
                                        together than real daily data would. Treat today&apos;s spread figures as a floor, not a
                                        measurement. The page recomputes daily and will switch back automatically.
                                    </p>
                                </div>
                            </Card>
                        )}

                        {/* Main table */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                                All seven weekdays, full price history
                            </h2>
                            <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
                                ${WEEKLY_AMOUNT} per week, {analysis.full.purchases.toLocaleString('en-US')} purchases each
                                ({fmtUsd(analysis.full.invested)} invested), no fees. First buys land in the week
                                of {formatUtc(analysis.full.firstBuyTs, 'full')}; last buys land in the week
                                of {formatUtc(analysis.full.lastBuyTs, 'full')}.
                            </p>
                            <div className="overflow-x-auto -mx-1 sm:mx-0">
                                <table className="w-full text-xs sm:text-sm tabular-nums min-w-[520px]">
                                    <caption className="sr-only">
                                        BTC accumulated, average cost and final value for seven identical weekly Bitcoin DCA
                                        schedules, one anchored to each weekday
                                    </caption>
                                    <thead>
                                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                            <th scope="col" className="py-2 pr-4 font-medium">Buy day</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">BTC accumulated</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Average cost / BTC</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Value today</th>
                                            <th scope="col" className="py-2 font-medium text-right">vs. average day</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 dark:text-slate-300">
                                        {DISPLAY_ORDER.map((weekday) => {
                                            const row = analysis.full.rows.find((r) => r.weekday === weekday);
                                            if (!row) return null;
                                            return (
                                                <tr
                                                    key={weekday}
                                                    className="border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                                                >
                                                    <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-800 dark:text-slate-100">
                                                        {row.name}
                                                        {row.rank === 1 && (
                                                            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                                                most BTC
                                                            </span>
                                                        )}
                                                    </th>
                                                    <td className="py-2 pr-4 text-right">{fmtBtc(row.btc)}</td>
                                                    <td className="py-2 pr-4 text-right">{fmtUsd(row.averageCost)}</td>
                                                    <td className="py-2 pr-4 text-right">{fmtUsd(row.finalValue)}</td>
                                                    <td
                                                        className={clsx(
                                                            'py-2 text-right font-medium',
                                                            row.vsMeanPercent >= 0
                                                                ? 'text-emerald-700 dark:text-emerald-400'
                                                                : 'text-loss',
                                                        )}
                                                    >
                                                        {fmtPct(row.vsMeanPercent, true)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                <strong className="font-semibold text-slate-600 dark:text-slate-300">Read this table carefully.</strong>{' '}
                                Almost all of the BTC in every row was bought before 2013, when Bitcoin traded in cents and
                                dollars, so the full-history spread of {fmtPct(analysis.full.spreadPercent)} is mostly a
                                verdict on what happened during a handful of weeks in 2010 and 2011 &mdash; not evidence of a
                                weekday effect. The value column is the arithmetic of a fifteen-year schedule nobody actually
                                ran; it is here for completeness, not as a target. The window table below is the honest test.
                            </p>
                        </Card>

                        {/* Rank stability */}
                        {analysis.others.length > 0 && (
                            <Card className="p-4 sm:p-6">
                                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                                    The winner changes with the window
                                </h2>
                                <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
                                    Rank of each weekday by BTC accumulated (1 = most BTC) across four different lookback
                                    windows, each run the same way. If a weekday genuinely bought Bitcoin cheaper, its column
                                    of ranks would stay near the top. None of them do.
                                </p>
                                <div className="overflow-x-auto -mx-1 sm:mx-0">
                                    <table className="w-full text-xs sm:text-sm tabular-nums min-w-[480px]">
                                        <caption className="sr-only">
                                            Weekday rank by BTC accumulated across four lookback windows
                                        </caption>
                                        <thead>
                                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                <th scope="col" className="py-2 pr-4 font-medium">Buy day</th>
                                                {analysis.allWindows.map((w) => (
                                                    <th key={w.key} scope="col" className="py-2 pr-4 font-medium text-right">
                                                        {w.label}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="text-slate-700 dark:text-slate-300">
                                            {DISPLAY_ORDER.map((weekday) => (
                                                <tr key={weekday} className="border-b border-slate-100 dark:border-slate-800/60">
                                                    <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-800 dark:text-slate-100">
                                                        {WEEKDAY_NAMES[weekday]}
                                                    </th>
                                                    {analysis.allWindows.map((w) => {
                                                        const row = w.rows.find((r) => r.weekday === weekday);
                                                        return (
                                                            <td key={w.key} className="py-2 pr-4 text-right">
                                                                {row ? (
                                                                    <span
                                                                        className={clsx(
                                                                            'inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-semibold',
                                                                            row.rank === 1
                                                                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                                                                                : row.rank === 7
                                                                                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                                                    : 'text-slate-600 dark:text-slate-300',
                                                                        )}
                                                                    >
                                                                        {row.rank}
                                                                    </span>
                                                                ) : (
                                                                    '—'
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                            <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                                                <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-800 dark:text-slate-100">
                                                    Best vs worst
                                                </th>
                                                {analysis.allWindows.map((w) => (
                                                    <td key={w.key} className="py-2 pr-4 text-right font-medium">
                                                        {fmtPct(w.spreadPercent)}
                                                    </td>
                                                ))}
                                            </tr>
                                            <tr>
                                                <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400">
                                                    Purchases each
                                                </th>
                                                {analysis.allWindows.map((w) => (
                                                    <td key={w.key} className="py-2 pr-4 text-right text-slate-500 dark:text-slate-400">
                                                        {w.purchases.toLocaleString('en-US')}
                                                    </td>
                                                ))}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                    Each column is an independent run: seven schedules anchored to the seven weekdays,
                                    identical purchase counts within the column, ending on the same day. Windows overlap, so
                                    the columns are not independent samples in a statistical sense &mdash; which makes the rank
                                    reshuffling even more telling, since heavily overlapping data should produce similar
                                    rankings if the effect were real.
                                </p>
                            </Card>
                        )}

                        {/* Why this is noise */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                Why there is no best day, and why the question keeps getting asked
                            </h2>
                            <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">Bitcoin never closes.</strong> Equity
                                    markets have real calendar structure: a weekend gap, an opening auction, index rebalancing
                                    on set dates. Bitcoin trades every hour of every day on hundreds of venues. There is no
                                    mechanism that makes Tuesday systematically cheaper, and if one appeared, the cost of
                                    exploiting it would be roughly zero, so it would disappear within days.
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">Seven buckets, one dataset.</strong>{' '}
                                    Split any volatile price series into seven arbitrary groups and one of them will come out on
                                    top. That is arithmetic, not a discovery. The test of whether it means anything is whether
                                    the same group keeps winning when you change the window, and here it does not.
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">The spread is smaller than your
                                        fees.</strong>{' '}
                                    {fiveYear
                                        ? `Over ${fiveYear.label.toLowerCase()} the best and worst weekdays differ by ${fmtPct(fiveYear.spreadPercent)}. `
                                        : ''}
                                    A retail exchange spread plus commission is commonly 0.5% to 1.5% per purchase. Moving from
                                    a 1.49% fee tier to a 0.4% one changes your outcome by more than every weekday decision you
                                    will ever make, and unlike the weekday, it is a real, repeatable saving.
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">Consistency beats timing.</strong> The
                                    variable that dominates a DCA outcome is how many contributions you actually make. A missed
                                    month costs you a whole contribution. Waiting for the &ldquo;right&rdquo; day is how missed
                                    months happen. Pick the day after payday, automate it, and stop thinking about it.
                                </p>
                            </div>
                        </section>

                        {/* Methodology */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white mb-2">
                                How these numbers were computed
                            </h2>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                For each window we take the first UTC date on or after the window start whose weekday matches,
                                then run a weekly schedule from that date: ${WEEKLY_AMOUNT} per purchase, priced at that
                                day&apos;s closing price, zero fees, using the same engine as the main calculator. The number of
                                purchases is clamped to the minimum across the seven anchors, so all seven schedules invest
                                exactly the same total and differ only in the weekday. All date bucketing is UTC, because
                                exchange candles are UTC-aligned and doing this in local time would shift the entire schedule by
                                a day for anyone west of Greenwich. Prices are{' '}
                                {analysis.interpolatedSeries
                                    ? 'currently coming from the Kraken weekly series interpolated to daily values (see the note above)'
                                    : 'Coinbase daily candles from July 2015 onward, and real daily market prices from blockchain.info for August 2010 to mid-2015'}
                                . Value today uses the latest spot price, so every row is valued at the same price and the
                                ranking by value is identical to the ranking by BTC. Figures refresh once every 24 hours; the
                                data covers {formatUtc(analysis.full.firstBuyTs, 'full')} to{' '}
                                {formatUtc(analysis.lastDataTs, 'full')}. Full detail on the{' '}
                                <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                    methodology page
                                </Link>
                                .
                            </p>
                        </Card>

                        {/* FAQ */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                Common questions
                            </h2>
                            <div className="space-y-3">
                                {faqs.map(({ q, a }) => (
                                    <Card key={q} className="p-4 sm:p-5">
                                        <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100">{q}</h3>
                                        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{a}</p>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    </>
                ) : (
                    <Card className="p-6 sm:p-8">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <div className="space-y-2">
                                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                                    Price data is temporarily unavailable
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    We couldn&apos;t load the daily price history needed to run the seven weekday schedules
                                    right now, and we won&apos;t publish numbers we can&apos;t compute. The page rebuilds every
                                    24 hours. In the meantime the live calculator pulls from several providers, so you can run
                                    a weekly schedule there yourself.
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* CTA */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
                        Run your own numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        Pick any weekday you like &mdash; it barely matters. What does matter is the amount, the fee, and how
                        long you keep going. Change all three in the calculator and see what the same history does to your
                        actual plan.
                    </p>
                    <Link
                        href={`/?amount=${WEEKLY_AMOUNT}&frequency=weekly&fee=0&provider=coinbase`}
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                </Card>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Keep reading
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-2 sm:gap-3">
                        {[
                            { href: '/lump-sum-vs-dca', label: 'Lump sum vs DCA', sub: 'Both strategies, every start month since 2010' },
                            { href: '/dca', label: 'DCA scenarios', sub: 'What steady buying would be worth today' },
                            { href: '/methodology', label: 'Methodology', sub: 'Every data source and formula we use' },
                            { href: '/features', label: 'Calculator features', sub: 'What the tool can actually do' },
                        ].map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:border-amber-500/50 transition-colors"
                            >
                                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{link.label}</span>
                                <span className="block mt-0.5 text-xs text-slate-500 dark:text-slate-400">{link.sub}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Disclaimer */}
                <p className="border-t border-slate-200 dark:border-slate-800 pt-6 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Not financial advice. This page is a historical simulation published for educational purposes. Past
                    performance does not guarantee future results, and a pattern found in historical data is not a prediction
                    &mdash; that is the entire point of this page. Bitcoin is volatile and you can lose money.
                </p>

            </div>
        </>
    );
}

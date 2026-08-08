import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Info } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import { calculateDca, calculateLumpSum } from '@/utils/dca';
import { DAY_MS, EARLIEST_PRICE_TS, addUtcMonths, formatUtc, utcDayIndex } from '@/utils/dates';
import { percentile, median } from '@/utils/datasets';

// Recomputed once a day against fresh prices, like the scenario pages.
export const revalidate = 86400;

const BASE_URL = 'https://btcdollarcostaverage.com';
const PAGE_PATH = '/lump-sum-vs-dca';
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;

/** The same total capital is deployed both ways in every window. */
const CAPITAL = 12_000;
/** The headline deployment period, in months. */
const HEADLINE_MONTHS = 12;
const DEPLOYMENT_PERIODS = [3, 6, 12, 24] as const;

// ── Formatting (server-rendered SEO pages are USD-only by design) ──────────────

function fmtUsd(value: number): string {
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

function fmtPct(value: number, signed = false): string {
    const digits = Math.abs(value) >= 100 ? 0 : 1;
    const text = value.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
    return `${signed && value > 0 ? '+' : ''}${text}%`;
}

// ── Computation ────────────────────────────────────────────────────────────────

interface WindowRow {
    startTs: number;
    lumpBtc: number;
    dcaBtc: number;
    /** How much more BTC the lump sum ended up holding, in percent. Negative = DCA won. */
    diffPercent: number;
    /** How far below the running all-time high the price was on the start date, 0–1. */
    drawdownAtStart: number;
}

interface PeriodSummary {
    months: number;
    perPurchase: number;
    windows: number;
    lumpWinPercent: number;
    medianDiff: number;
    p10: number;
    p90: number;
    worst: WindowRow;
    best: WindowRow;
}

interface RegimeSummary {
    key: string;
    label: string;
    windows: number;
    lumpWinPercent: number;
    medianDiff: number;
    worstDiff: number;
    bestDiff: number;
}

const REGIMES = [
    { key: 'top', label: 'Within 10% of the all-time high', test: (dd: number) => dd <= 0.1 },
    { key: 'mid', label: '10% to 50% below the high', test: (dd: number) => dd > 0.1 && dd < 0.5 },
    { key: 'deep', label: '50% or more below the high', test: (dd: number) => dd >= 0.5 },
] as const;


function summarise(months: number, rows: WindowRow[]): PeriodSummary | null {
    if (rows.length < 12) return null;
    const diffs = rows.map((r) => r.diffPercent);
    const sorted = [...diffs].sort((a, b) => a - b);
    let worst = rows[0];
    let best = rows[0];
    for (const row of rows) {
        if (row.diffPercent < worst.diffPercent) worst = row;
        if (row.diffPercent > best.diffPercent) best = row;
    }
    return {
        months,
        perPurchase: CAPITAL / months,
        windows: rows.length,
        lumpWinPercent: (rows.filter((r) => r.diffPercent > 0).length / rows.length) * 100,
        medianDiff: median(diffs),
        p10: percentile(sorted, 0.1),
        p90: percentile(sorted, 0.9),
        worst,
        best,
    };
}

interface Analysis {
    headline: PeriodSummary;
    periods: PeriodSummary[];
    regimes: RegimeSummary[];
    firstStartTs: number;
    lastStartTs: number;
    lastDataTs: number;
}

async function computeAnalysis(): Promise<Analysis | null> {
    try {
        const [history, currentPrice] = await Promise.all([
            // Coinbase gives real daily candles from 2015 on, with real daily
            // blockchain.info prices behind it for 2010–2015.
            getBitcoinPriceHistory(EARLIEST_PRICE_TS, Date.now() + DAY_MS, 'coinbase'),
            getCurrentBitcoinPrice('coinbase')
                .catch(() => getCurrentBitcoinPrice('kraken'))
                .catch(() => null),
        ]);
        if (!history || history.length < 400) return null;

        const price = currentPrice ?? history[history.length - 1][1];
        if (!Number.isFinite(price) || price <= 0) return null;

        const lastDataTs = history[history.length - 1][0];
        const firstDay = utcDayIndex(history[0][0]);
        const lastDay = utcDayIndex(lastDataTs);

        // Day-indexed running all-time high, used only to classify each start date's
        // market regime. The money math below goes through the shared DCA engine.
        const len = lastDay - firstDay + 1;
        const daily = new Float64Array(len);
        for (const [ts, p] of history) {
            const idx = utcDayIndex(ts) - firstDay;
            if (idx >= 0 && idx < len) daily[idx] = p;
        }
        let carried = history[0][1];
        const ath = new Float64Array(len);
        let runningMax = 0;
        for (let i = 0; i < len; i++) {
            if (daily[i] > 0) carried = daily[i];
            else daily[i] = carried;
            if (daily[i] > runningMax) runningMax = daily[i];
            ath[i] = runningMax;
        }

        // Start dates step one calendar month at a time, from the first full month
        // of price data onward.
        const firstDate = new Date(history[0][0]);
        const firstStartTs = Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 1);

        const rowsByPeriod = new Map<number, WindowRow[]>();
        let lastStartTs = firstStartTs;

        for (const months of DEPLOYMENT_PERIODS) {
            const rows: WindowRow[] = [];
            const perPurchase = CAPITAL / months;
            for (let startTs = firstStartTs; ; startTs = addUtcMonths(startTs, 1, 1)) {
                // The deployment period has to finish inside the data, otherwise the
                // DCA leg would be silently truncated and the comparison unfair.
                const endTs = addUtcMonths(startTs, months - 1, 1);
                if (utcDayIndex(endTs) > lastDay) break;

                const dca = calculateDca(
                    {
                        amount: perPurchase,
                        frequency: 'monthly',
                        startDate: new Date(startTs),
                        endDate: new Date(endTs),
                        feePercentage: 0,
                        priceMode: 'api',
                        manualPrice: 0,
                    },
                    history,
                    price,
                );
                if (dca.breakdown.length !== months || dca.btcAccumulated <= 0) continue;

                const lump = calculateLumpSum(CAPITAL, new Date(startTs), history, price, 0);
                if (!Number.isFinite(lump.btcAccumulated) || lump.btcAccumulated <= 0) continue;

                const idx = utcDayIndex(startTs) - firstDay;
                const high = idx >= 0 && idx < len ? ath[idx] : 0;
                const spot = idx >= 0 && idx < len ? daily[idx] : 0;

                rows.push({
                    startTs,
                    lumpBtc: lump.btcAccumulated,
                    dcaBtc: dca.btcAccumulated,
                    diffPercent: (lump.btcAccumulated / dca.btcAccumulated - 1) * 100,
                    drawdownAtStart: high > 0 && spot > 0 ? 1 - spot / high : 0,
                });
                if (months === HEADLINE_MONTHS) lastStartTs = startTs;
            }
            rowsByPeriod.set(months, rows);
        }

        const periods = DEPLOYMENT_PERIODS.map((m) => summarise(m, rowsByPeriod.get(m) ?? [])).filter(
            (p): p is PeriodSummary => p !== null,
        );
        const headline = periods.find((p) => p.months === HEADLINE_MONTHS);
        if (!headline) return null;

        const headlineRows = rowsByPeriod.get(HEADLINE_MONTHS) ?? [];
        const regimes: RegimeSummary[] = REGIMES.map(({ key, label, test }) => {
            const group = headlineRows.filter((r) => test(r.drawdownAtStart));
            const diffs = group.map((r) => r.diffPercent);
            return {
                key,
                label,
                windows: group.length,
                lumpWinPercent: group.length > 0 ? (diffs.filter((d) => d > 0).length / group.length) * 100 : 0,
                medianDiff: median(diffs),
                worstDiff: group.length > 0 ? Math.min(...diffs) : 0,
                bestDiff: group.length > 0 ? Math.max(...diffs) : 0,
            };
        }).filter((r) => r.windows > 0);

        return { headline, periods, regimes, firstStartTs, lastStartTs, lastDataTs };
    } catch (error) {
        // Never build-fail: the page renders an "unavailable" state instead.
        console.error('[lump-sum-vs-dca] computation failed:', error);
        return null;
    }
}

// ── Metadata ───────────────────────────────────────────────────────────────────

const TITLE = 'Lump Sum vs DCA for Bitcoin: Every Start Month Since 2010';
const FALLBACK_DESCRIPTION =
    'We put the same capital into Bitcoin two ways — all at once, or spread over 12 monthly buys — starting on every month since 2010, and published the full comparison. Lump sum usually wins; here is by how much, and when it does not.';

export async function generateMetadata(): Promise<Metadata> {
    let description = FALLBACK_DESCRIPTION;
    try {
        // Same warm cache as the page render, so this costs nothing extra.
        const analysis = await computeAnalysis();
        if (analysis) {
            const { headline } = analysis;
            description = `Across ${headline.windows} historical start months, putting ${fmtUsd(CAPITAL)} into Bitcoin as a single lump sum beat spreading it over ${HEADLINE_MONTHS} monthly buys in ${fmtPct(headline.lumpWinPercent)} of windows, with a median edge of ${fmtPct(headline.medianDiff, true)}. The worst lump-sum window was ${fmtPct(headline.worst.diffPercent, true)}. Updated daily.`;
        }
    } catch {
        // Keep the generic description.
    }

    return {
        title: TITLE,
        description,
        keywords: [
            'lump sum vs dca bitcoin',
            'lump sum vs dollar cost averaging',
            'bitcoin lump sum investing',
            'dca vs lump sum backtest',
            'should i buy bitcoin all at once',
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
            <p className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
            {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </Card>
    );
}

const diffClass = (value: number): string =>
    value >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-loss';

export default async function LumpSumVsDcaPage() {
    const analysis = await computeAnalysis();

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'Lump Sum vs DCA', item: PAGE_URL },
        ],
    };

    const datasetJsonLd = analysis
        ? {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: 'Bitcoin lump sum versus dollar-cost averaging, by start month',
            description: `For every calendar month from ${formatUtc(analysis.firstStartTs, 'monthYear')} onward, ${fmtUsd(CAPITAL)} is deployed into Bitcoin two ways: as a single purchase on the first of the month, and as equal monthly purchases over 3, 6, 12 and 24 months. Reports the share of start months where the lump sum accumulated more BTC, the median and decile differences, and a breakdown by how far below the all-time high the market was on the start date. Recomputed daily.`,
            url: PAGE_URL,
            temporalCoverage: `${formatUtc(analysis.firstStartTs, 'isoDay')}/${formatUtc(analysis.lastDataTs, 'isoDay')}`,
            dateModified: formatUtc(analysis.lastDataTs, 'isoDay'),
            license: 'https://creativecommons.org/licenses/by/4.0/',
            isAccessibleForFree: true,
            creator: {
                '@type': 'Organization',
                name: 'Bitcoin DCA Calculator',
                url: BASE_URL,
            },
            keywords: ['bitcoin', 'lump sum', 'dollar cost averaging', 'backtest', 'BTC/USD'],
            measurementTechnique:
                'Deterministic backtest. Both legs deploy identical capital at daily closing prices with zero fees and are valued at the same spot price, so the difference in outcome equals the difference in BTC accumulated.',
            variableMeasured: [
                { '@type': 'PropertyValue', name: 'Start month' },
                { '@type': 'PropertyValue', name: 'Deployment period', unitText: 'months' },
                { '@type': 'PropertyValue', name: 'Share of windows where lump sum accumulated more BTC', unitText: 'percent' },
                { '@type': 'PropertyValue', name: 'Median difference in BTC accumulated', unitText: 'percent' },
                { '@type': 'PropertyValue', name: 'Drawdown from all-time high on the start date', unitText: 'percent' },
            ],
        }
        : null;

    const topRegime = analysis?.regimes.find((r) => r.key === 'top');
    const deepRegime = analysis?.regimes.find((r) => r.key === 'deep');

    const faqs: { q: string; a: string }[] = analysis
        ? [
            {
                q: 'Is lump sum or DCA better for Bitcoin?',
                a: `Historically, lump sum. Across ${analysis.headline.windows} start months since ${formatUtc(analysis.firstStartTs, 'monthYear')}, putting ${fmtUsd(CAPITAL)} in at once beat spreading it over ${HEADLINE_MONTHS} monthly buys in ${fmtPct(analysis.headline.lumpWinPercent)} of windows, with a median advantage of ${fmtPct(analysis.headline.medianDiff, true)} more BTC. But "better on average" and "better for you" are different questions: the worst lump-sum window in this sample ended ${fmtPct(analysis.headline.worst.diffPercent, true)} behind DCA, and most people never have the lump in the first place.`,
            },
            {
                q: 'Why does lump sum usually win?',
                a: 'Because Bitcoin has spent most of its history rising, and money that is still sitting in cash is not exposed to that rise. Spreading a fixed sum over 12 months means that on average only about half of it is invested during those 12 months. Any asset with a positive expected return rewards time in the market, so the strategy that gets invested sooner wins more often. The same result holds for stock indices in academic studies, for the same reason.',
            },
            {
                q: 'When does DCA beat lump sum?',
                a: topRegime && deepRegime
                    ? `When the market falls after you start. That is much more likely if you begin near a peak: for start months within 10% of the all-time high, lump sum won ${fmtPct(topRegime.lumpWinPercent)} of the time, versus ${fmtPct(deepRegime.lumpWinPercent)} for start months that began 50% or more below the high. DCA is the strategy that pays off precisely when you were unlucky about your entry.`
                    : 'When the market falls after you start. Spreading purchases means the later ones buy at lower prices, so a drawdown right after the start date is where DCA earns its keep.',
            },
            {
                q: 'Does DCA reduce risk?',
                a: `It reduces the spread of outcomes, not the risk of losing money. In this sample the middle 80% of ${HEADLINE_MONTHS}-month windows ran from ${fmtPct(analysis.headline.p10, true)} to ${fmtPct(analysis.headline.p90, true)} for lump sum versus DCA. DCA narrows that range because it averages several entry prices instead of betting everything on one. It does nothing about the risk that Bitcoin itself falls and stays down.`,
            },
            {
                q: 'I get paid monthly and do not have a lump sum. Does this page apply to me?',
                a: 'Not really, and that is the most important caveat here. This comparison only makes sense if the money already exists as a lump today — an inheritance, a bonus, a house sale. If you are investing out of income, you are not choosing between lump sum and DCA; you are choosing between DCA and doing nothing, and DCA wins that comparison by definition.',
            },
            {
                q: 'How were these numbers calculated?',
                a: `For each start month, ${fmtUsd(CAPITAL)} is deployed both ways at daily closing prices with zero fees, using the same engine as the main calculator, and both legs are valued at the same spot price. Because both hold only Bitcoin at the end, the ratio of final values equals the ratio of BTC accumulated, so the answer does not depend on today's price. All date bucketing is UTC. Windows overlap and Bitcoin has exactly one price history, so these are descriptive percentages, not probabilities.`,
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
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">Lump sum vs DCA</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white text-balance">
                        Lump sum vs dollar-cost averaging into Bitcoin
                    </h1>
                    {analysis ? (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            We took {fmtUsd(CAPITAL)} and deployed it into Bitcoin two ways &mdash; all at once, or in{' '}
                            {HEADLINE_MONTHS} equal monthly buys &mdash; starting on the first of{' '}
                            <strong className="font-semibold text-slate-900 dark:text-white">
                                every month from {formatUtc(analysis.firstStartTs, 'monthYear')} to {formatUtc(analysis.lastStartTs, 'monthYear')}
                            </strong>
                            . That is {analysis.headline.windows} overlapping windows. The lump sum ended up holding more BTC
                            in{' '}
                            <strong className="font-semibold text-slate-900 dark:text-white">{fmtPct(analysis.headline.lumpWinPercent)}</strong>{' '}
                            of them, by a median of{' '}
                            <strong className="font-semibold text-slate-900 dark:text-white">{fmtPct(analysis.headline.medianDiff, true)}</strong>.
                            The rest of this page is about why that number is less useful than it looks.
                        </p>
                    ) : (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            This page deploys the same capital into Bitcoin two ways &mdash; all at once, or spread over
                            several months &mdash; across every start month in Bitcoin&apos;s price history, and publishes the
                            full comparison.
                        </p>
                    )}
                </header>

                {analysis ? (
                    <>
                        {/* Headline stats */}
                        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <StatCard
                                label="Lump sum won"
                                value={fmtPct(analysis.headline.lumpWinPercent)}
                                sub={`of ${analysis.headline.windows} start months`}
                                celebrated
                            />
                            <StatCard
                                label="Median difference"
                                value={fmtPct(analysis.headline.medianDiff, true)}
                                sub="More BTC for the lump sum"
                            />
                            <StatCard
                                label="Worst lump-sum window"
                                value={fmtPct(analysis.headline.worst.diffPercent, true)}
                                sub={`Started ${formatUtc(analysis.headline.worst.startTs, 'monthYear')}`}
                            />
                            <StatCard
                                label="Best lump-sum window"
                                value={fmtPct(analysis.headline.best.diffPercent, true)}
                                sub={`Started ${formatUtc(analysis.headline.best.startTs, 'monthYear')}`}
                            />
                        </section>

                        {/* The framing note, up front */}
                        <Card className="p-4 sm:p-6 border-amber-500/40 dark:border-amber-500/30">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                                <div className="space-y-2">
                                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                        Read the question before the answer
                                    </h2>
                                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                                        This comparison only exists if you already have the money as a lump today. If you are
                                        investing out of a monthly paycheck, you are not choosing between lump sum and DCA
                                        &mdash; you are choosing between DCA and waiting, and DCA wins that by default.
                                        Everything below applies to a windfall: an inheritance, a bonus, a sale.
                                    </p>
                                </div>
                            </div>
                        </Card>

                        {/* Deployment period table */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                                The longer you spread it, the more often lump sum wins
                            </h2>
                            <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
                                {fmtUsd(CAPITAL)} deployed either at once, or in equal monthly buys over the period shown.
                                Every start month with a complete deployment period is included. Positive numbers mean the
                                lump sum ended with more BTC.
                            </p>
                            <div className="overflow-x-auto -mx-1 sm:mx-0">
                                <table className="w-full text-xs sm:text-sm tabular-nums min-w-[560px]">
                                    <caption className="sr-only">
                                        Lump sum versus dollar-cost averaging outcomes by deployment period
                                    </caption>
                                    <thead>
                                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                            <th scope="col" className="py-2 pr-4 font-medium">Spread over</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Windows</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Lump sum won</th>
                                            <th scope="col" className="py-2 pr-4 font-medium text-right">Median difference</th>
                                            <th scope="col" className="py-2 font-medium text-right">Middle 80% range</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 dark:text-slate-300">
                                        {analysis.periods.map((p) => (
                                            <tr
                                                key={p.months}
                                                className={clsx(
                                                    'border-b border-slate-100 dark:border-slate-800/60 last:border-0',
                                                    p.months === HEADLINE_MONTHS && 'bg-amber-50/60 dark:bg-amber-500/[0.06]',
                                                )}
                                            >
                                                <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-800 dark:text-slate-100">
                                                    {p.months} months
                                                    <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                                        {fmtUsd(p.perPurchase)} per month
                                                    </span>
                                                </th>
                                                <td className="py-2 pr-4 text-right">{p.windows}</td>
                                                <td className="py-2 pr-4 text-right font-medium">{fmtPct(p.lumpWinPercent)}</td>
                                                <td className={clsx('py-2 pr-4 text-right font-medium', diffClass(p.medianDiff))}>
                                                    {fmtPct(p.medianDiff, true)}
                                                </td>
                                                <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                                                    {fmtPct(p.p10, true)} to {fmtPct(p.p90, true)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                The pattern is mechanical, not mysterious. The longer you hold cash back, the more of the
                                asset&apos;s average drift you miss &mdash; so the lump sum&apos;s win rate and its median edge
                                both grow with the deployment period. Notice that the middle-80% range widens alongside them:
                                a longer deployment does not only shift the average outcome, it stretches the gap between the
                                two strategies in both directions.
                            </p>
                        </Card>

                        {/* Regime table */}
                        {analysis.regimes.length > 0 && (
                            <Card className="p-4 sm:p-6">
                                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                                    It depends where you are in the cycle &mdash; but less than you would think
                                </h2>
                                <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
                                    The same {HEADLINE_MONTHS}-month windows, grouped by how far below the running all-time
                                    high Bitcoin was on the start date.
                                </p>
                                <div className="overflow-x-auto -mx-1 sm:mx-0">
                                    <table className="w-full text-xs sm:text-sm tabular-nums min-w-[560px]">
                                        <caption className="sr-only">
                                            Lump sum versus DCA outcomes grouped by drawdown from the all-time high on the
                                            start date
                                        </caption>
                                        <thead>
                                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                <th scope="col" className="py-2 pr-4 font-medium">Price on the start date</th>
                                                <th scope="col" className="py-2 pr-4 font-medium text-right">Windows</th>
                                                <th scope="col" className="py-2 pr-4 font-medium text-right">Lump sum won</th>
                                                <th scope="col" className="py-2 pr-4 font-medium text-right">Median difference</th>
                                                <th scope="col" className="py-2 font-medium text-right">Worst / best</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-slate-700 dark:text-slate-300">
                                            {analysis.regimes.map((r) => (
                                                <tr key={r.key} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                    <th scope="row" className="py-2 pr-4 text-left font-medium text-slate-800 dark:text-slate-100">
                                                        {r.label}
                                                    </th>
                                                    <td className="py-2 pr-4 text-right">{r.windows}</td>
                                                    <td className="py-2 pr-4 text-right font-medium">{fmtPct(r.lumpWinPercent)}</td>
                                                    <td className={clsx('py-2 pr-4 text-right font-medium', diffClass(r.medianDiff))}>
                                                        {fmtPct(r.medianDiff, true)}
                                                    </td>
                                                    <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                                                        {fmtPct(r.worstDiff, true)} / {fmtPct(r.bestDiff, true)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {topRegime && deepRegime ? (
                                        <>
                                            Starting near an all-time high should be the worst case for a lump sum, and it is:
                                            its win rate is {fmtPct(topRegime.lumpWinPercent)} for start months near the high
                                            against {fmtPct(deepRegime.lumpWinPercent)} for start months 50% or more below it.
                                            {topRegime.lumpWinPercent > 50 ? (
                                                <>
                                                    {' '}But note what did <em>not</em> happen &mdash; even at the top, the
                                                    lump sum still came out ahead in most windows. Bitcoin has made new
                                                    all-time highs often enough that &ldquo;near the high&rdquo; has
                                                    historically not been a reliable reason to wait.
                                                </>
                                            ) : (
                                                <>
                                                    {' '}That is the one regime in this sample where waiting and averaging in
                                                    came out ahead more often than not.
                                                </>
                                            )}{' '}
                                            {topRegime.windows < 40 && (
                                                <>
                                                    Only {topRegime.windows} of the {analysis.headline.windows} start months
                                                    fall in the near-the-high bucket, though, so treat that row as suggestive
                                                    rather than settled.
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            Drawdown is measured against the running all-time high as of the start date, so no
                                            future information is used to classify a window.
                                        </>
                                    )}
                                </p>
                            </Card>
                        )}

                        {/* Explanation */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                                What the numbers actually mean
                            </h2>
                            <div className="space-y-4 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">Lump sum wins on average because
                                        of time in the market, not timing.</strong>{' '}
                                    If you spread {fmtUsd(CAPITAL)} over {HEADLINE_MONTHS} months, then on average only about
                                    half of it is invested at any point during that year. For an asset whose price has drifted
                                    upward over time, half-invested is a cost. It is not a Bitcoin-specific result: the same
                                    finding shows up in equity studies going back decades, for exactly the same reason.
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">DCA buys you a narrower range of
                                        outcomes.</strong>{' '}
                                    Averaging over {HEADLINE_MONTHS} entry prices instead of one means no single bad day can
                                    define your cost basis. In this sample the lump sum&apos;s edge ranged from{' '}
                                    {fmtPct(analysis.headline.p10, true)} to {fmtPct(analysis.headline.p90, true)} across the
                                    middle 80% of windows &mdash; that whole range is the uncertainty you are choosing to take
                                    on, or to give up.
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">The real product DCA sells is
                                        regret insurance.</strong>{' '}
                                    The worst {HEADLINE_MONTHS}-month lump-sum window here finished{' '}
                                    {fmtPct(analysis.headline.worst.diffPercent, true)} behind DCA, starting in{' '}
                                    {formatUtc(analysis.headline.worst.startTs, 'monthYear')}. An investor who deploys
                                    everything the week before a 70% drawdown often does not calmly wait it out &mdash; they
                                    sell. A strategy you can actually stick to beats a marginally better one you abandon.
                                    That is a behavioural argument, not a mathematical one, and it is still a good argument.
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">This is one price history, and
                                        the windows overlap.</strong>{' '}
                                    Bitcoin has a single realised path, and consecutive {HEADLINE_MONTHS}-month windows share
                                    eleven of their twelve months, so these {analysis.headline.windows} windows are nowhere
                                    near {analysis.headline.windows} independent samples. The sample is also dominated by the
                                    largest sustained appreciation in any liquid asset in modern history. A percentage on this
                                    page describes what happened; it is not a probability of what will happen.
                                </p>
                                <p>
                                    <strong className="text-slate-800 dark:text-slate-200">A middle path is legitimate.</strong>{' '}
                                    Deploying part now and averaging the rest over a few months is not a compromise between
                                    two correct answers &mdash; it is a deliberate trade of a little expected return for a lot
                                    less exposure to a single date. If that is the version you would hold through a 70%
                                    drawdown, it is the better plan for you regardless of what the median column says.
                                </p>
                            </div>
                        </section>

                        {/* Methodology */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-2">
                                How these numbers were computed
                            </h2>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                Start dates step one calendar month at a time from{' '}
                                {formatUtc(analysis.firstStartTs, 'full')} to {formatUtc(analysis.lastStartTs, 'full')}, keeping
                                only windows whose full deployment period completes inside the price data. For each one, the
                                lump-sum leg buys {fmtUsd(CAPITAL)} of Bitcoin at the closing price on the start date; the DCA
                                leg buys an equal share on the same day of each following month, using the same engine as the
                                main calculator. Fees are zero on both legs, and both are valued at the same current spot
                                price. Because both end holding only Bitcoin, the ratio of final values equals the ratio of BTC
                                accumulated, which is why the comparison does not depend on today&apos;s price at all. Market
                                regime is classified by the running all-time high as of the start date, so no future
                                information is used. All date bucketing is UTC. Prices come from Coinbase daily candles from
                                July 2015 onward and real daily market prices from blockchain.info for August 2010 to mid-2015;
                                if Coinbase is unavailable the calculator&apos;s Kraken series is used instead. Figures refresh
                                once every 24 hours &mdash; the data currently runs to{' '}
                                {formatUtc(analysis.lastDataTs, 'full')}. Full detail on the{' '}
                                <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline font-medium">
                                    methodology page
                                </Link>
                                .
                            </p>
                        </Card>

                        {/* FAQ */}
                        <section className="space-y-4">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
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
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                    Price data is temporarily unavailable
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    We couldn&apos;t load the price history needed to run the lump sum and DCA comparison right
                                    now, and we won&apos;t publish numbers we can&apos;t compute. The page rebuilds every 24
                                    hours. In the meantime the live calculator pulls from several providers and shows a
                                    lump-sum comparison alongside every DCA result.
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* CTA */}
                <Card celebrated className="p-6 sm:p-10 text-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                        Run your own numbers
                    </h2>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 max-w-xl mx-auto">
                        Your amount, your dates, your fees. The calculator backtests a DCA schedule against the same price
                        history and shows the lump-sum equivalent next to it, so you can see the trade-off on your actual
                        numbers instead of an average.
                    </p>
                    <Link
                        href={`/?amount=${CAPITAL / HEADLINE_MONTHS}&frequency=monthly&fee=0&provider=coinbase`}
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                </Card>

                {/* Related */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                        Keep reading
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-2 sm:gap-3">
                        {[
                            { href: '/best-day-to-buy-bitcoin', label: 'Best day to buy Bitcoin', sub: 'Seven weekday schedules, one honest answer' },
                            { href: '/dca', label: 'DCA scenarios', sub: 'What steady buying would be worth today' },
                            { href: '/methodology', label: 'Methodology', sub: 'Every data source and formula we use' },
                            { href: '/why-bitcoin', label: 'Why Bitcoin', sub: 'The case, and the counter-case' },
                        ].map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:border-amber-500/50 transition-colors"
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
                    performance does not guarantee future results, and a win rate measured on overlapping windows of a single
                    price history is not a probability. Bitcoin is volatile and you can lose money.
                </p>

            </div>
        </>
    );
}

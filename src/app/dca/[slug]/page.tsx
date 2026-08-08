import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import { calculateDca } from '@/utils/dca';
import { DAY_MS, formatUtc } from '@/utils/dates';
import type { DcaBreakdownItem, DcaResult } from '@/types';
import {
    SCENARIO_AMOUNTS,
    SCENARIO_YEARS,
    SCENARIOS,
    findScenario,
    getScenario,
    type Scenario,
} from '../scenarios';

// Prerender all 104 scenarios and recompute against fresh prices once a day.
export const revalidate = 86400;
// Anything outside the fixed matrix is a 404: never compute arbitrary slugs.
export const dynamicParams = false;

const BASE_URL = 'https://btcdollarcostaverage.com';

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams(): { slug: string }[] {
    return SCENARIOS.map(({ slug }) => ({ slug }));
}

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
    const digits = Math.abs(value) >= 100 ? 0 : 1;
    const text = value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
    });
    return `${signed && value > 0 ? '+' : ''}${text}%`;
}

function fmtBtc(value: number): string {
    const decimals = value >= 1 ? 4 : 8;
    const text = value
        .toFixed(decimals)
        .replace(/(\.\d*?)0+$/, '$1')
        .replace(/\.$/, '');
    return `${text} BTC`;
}

const fmtSats = (btc: number): string => `${Math.floor(btc * 1e8).toLocaleString('en-US')} sats`;

// ── Computation ────────────────────────────────────────────────────────────────

async function computeScenario(scenario: Scenario): Promise<DcaResult | null> {
    try {
        const now = Date.now();
        const [history, currentPrice] = await Promise.all([
            getBitcoinPriceHistory(scenario.startTs, now + DAY_MS, 'kraken'),
            getCurrentBitcoinPrice('kraken').catch(() => null),
        ]);
        if (!history || history.length === 0) return null;
        const result = calculateDca(
            {
                amount: scenario.amount,
                frequency: scenario.frequency,
                startDate: new Date(scenario.startTs),
                endDate: new Date(now),
                feePercentage: 0,
                priceMode: 'api',
                manualPrice: 0,
            },
            history,
            currentPrice,
        );
        if (result.totalInvested <= 0 || !Number.isFinite(result.currentValue)) return null;
        return result;
    } catch (error) {
        // Never build-fail: the page renders an "unavailable" state instead.
        console.error(`[dca/${scenario.slug}] scenario computation failed:`, error);
        return null;
    }
}

interface YearRow {
    year: number;
    invested: number;
    value: number;
    roi: number;
    isCurrentYear: boolean;
}

/** Last breakdown item of each calendar year (UTC) → cumulative table rows. */
function buildYearRows(breakdown: DcaBreakdownItem[]): YearRow[] {
    const currentYear = new Date().getUTCFullYear();
    const rows: YearRow[] = [];
    for (const item of breakdown) {
        const year = new Date(item.date).getUTCFullYear();
        const row: YearRow = {
            year,
            invested: item.totalInvested,
            value: item.portfolioValue,
            roi: item.totalInvested > 0
                ? ((item.portfolioValue - item.totalInvested) / item.totalInvested) * 100
                : 0,
            isCurrentYear: year === currentYear,
        };
        if (rows.length > 0 && rows[rows.length - 1].year === year) rows[rows.length - 1] = row;
        else rows.push(row);
    }
    return rows;
}

function relatedScenarios(scenario: Scenario): Scenario[] {
    const related: Scenario[] = [];
    // Same amount and year, the other cadence
    const mirror = findScenario(scenario.amount, scenario.freqSlug === 'week' ? 'month' : 'week', scenario.year);
    if (mirror) related.push(mirror);
    // Same amount and cadence, nearest other years
    const nearbyYears = SCENARIO_YEARS
        .filter((y) => y !== scenario.year)
        .sort((a, b) => Math.abs(a - scenario.year) - Math.abs(b - scenario.year))
        .slice(0, 3);
    for (const year of nearbyYears) {
        const s = findScenario(scenario.amount, scenario.freqSlug, year);
        if (s) related.push(s);
    }
    // Same year and cadence, other amounts
    for (const amount of SCENARIO_AMOUNTS.filter((a) => a !== scenario.amount).slice(0, 2)) {
        const s = findScenario(amount, scenario.freqSlug, scenario.year);
        if (s) related.push(s);
    }
    return related;
}

// ── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const scenario = getScenario(slug);
    if (!scenario) return {};
    const { amount, freqSlug, year } = scenario;

    // Root layout template appends "| Bitcoin DCA Calculator", so no suffix here.
    const title = `$${amount}/${freqSlug === 'week' ? 'Week' : 'Month'} in Bitcoin Since ${year}: What It's Worth Today`;

    let description = `See what buying $${amount} of Bitcoin every ${freqSlug} since January ${year} would be worth today: total invested, BTC accumulated, and year-by-year returns from real historical prices.`;
    try {
        // Hits the same warm cache as the page render, so this is cheap.
        const result = await computeScenario(scenario);
        if (result) {
            description = `Buying $${amount} of Bitcoin every ${freqSlug} since January ${year} adds up to ${fmtUsd(result.totalInvested)} invested, worth ${fmtUsd(result.currentValue)} today (${fmtPct(result.roi, true)}), with ${fmtBtc(result.btcAccumulated)} accumulated.`;
        }
    } catch {
        // Keep the generic description.
    }

    return {
        title,
        description,
        alternates: { canonical: `/dca/${slug}` },
        openGraph: {
            title,
            description,
            type: 'article',
            siteName: 'Bitcoin DCA Calculator',
            locale: 'en_US',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            creator: '@9drix9',
        },
    };
}

// ── Page ───────────────────────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    sub,
    celebrated = false,
    valueClassName,
}: {
    label: string;
    value: string;
    sub?: string;
    celebrated?: boolean;
    valueClassName?: string;
}) {
    return (
        <Card celebrated={celebrated} className="p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
            <p className={clsx('mt-1 text-2xl sm:text-3xl font-bold tracking-tight', valueClassName ?? 'text-slate-900 dark:text-white')}>
                {value}
            </p>
            {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </Card>
    );
}

export default async function DcaScenarioPage({ params }: PageProps) {
    const { slug } = await params;
    const scenario = getScenario(slug);
    if (!scenario) notFound();

    const { amount, freqSlug, frequency, year, startDateIso } = scenario;
    const result = await computeScenario(scenario);
    const related = relatedScenarios(scenario);

    const heading = `$${amount} per ${freqSlug} in Bitcoin since ${year}`;
    const ctaHref = `/?amount=${amount}&frequency=${frequency}&startDate=${startDateIso}&fee=0`;
    const pageUrl = `${BASE_URL}/dca/${slug}`;

    const stats = result?.stats;
    const yearRows = result ? buildYearRows(result.breakdown) : [];
    const profitClass = result && result.profit >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400';

    const breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
            { '@type': 'ListItem', position: 2, name: 'DCA Scenarios', item: `${BASE_URL}/dca` },
            { '@type': 'ListItem', position: 3, name: heading, item: pageUrl },
        ],
    };

    const faqJsonLd = result
        ? {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
                {
                    '@type': 'Question',
                    name: `How much would $${amount} per ${freqSlug} in Bitcoin since ${year} be worth today?`,
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: `Investing $${amount} every ${freqSlug} from January 1, ${year} totals ${fmtUsd(result.totalInvested)} across ${result.breakdown.length} purchases. At today's price that stack would be worth ${fmtUsd(result.currentValue)}, a return of ${fmtPct(result.roi, true)}.`,
                    },
                },
                {
                    '@type': 'Question',
                    name: `How much BTC would $${amount} per ${freqSlug} since ${year} accumulate?`,
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: `About ${fmtBtc(result.btcAccumulated)} (${fmtSats(result.btcAccumulated)}), at an average cost of ${fmtUsd(result.averageCost)} per BTC.`,
                    },
                },
                {
                    '@type': 'Question',
                    name: 'What is the annualized return of this DCA schedule?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: stats?.xirrPercent != null
                            ? `The money-weighted annualized return (XIRR) is ${fmtPct(stats.xirrPercent, true)} per year, with a maximum portfolio drawdown of ${fmtPct(stats.maxDrawdownPercent)} along the way.`
                            : `The total return since ${year} is ${fmtPct(result.roi, true)}. The period is too short for a meaningful annualized figure.`,
                    },
                },
            ],
        }
        : null;

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />
            {faqJsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
                />
            )}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-10">

                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><Link href="/" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link href="/dca" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">DCA Scenarios</Link></li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-slate-700 dark:text-slate-300">{scenario.shortLabel}</li>
                    </ol>
                </nav>

                {/* Heading + lead */}
                <header className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
                        {heading}
                    </h1>
                    {result && (
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                            Buying <strong className="font-semibold text-slate-900 dark:text-white">${amount}</strong> of
                            Bitcoin every {freqSlug} from January 1, {year} works out
                            to <strong className="font-semibold text-slate-900 dark:text-white">{fmtUsd(result.totalInvested)}</strong> put
                            in across {result.breakdown.length} purchases. Those buys total <strong className="font-semibold text-slate-900 dark:text-white">{fmtBtc(result.btcAccumulated)}</strong>,
                            worth <strong className="font-semibold text-slate-900 dark:text-white">{fmtUsd(result.currentValue)}</strong> at
                            today&apos;s price, a return of <strong className={clsx('font-semibold', profitClass)}>{fmtPct(result.roi, true)}</strong>.
                        </p>
                    )}
                </header>

                {result ? (
                    <>
                        {/* Stat cards */}
                        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <StatCard
                                label="Total invested"
                                value={fmtUsd(result.totalInvested)}
                                sub={`${result.breakdown.length} purchases of $${amount}`}
                            />
                            <StatCard
                                label="Value today"
                                value={fmtUsd(result.currentValue)}
                                sub="At the latest market price"
                                celebrated
                            />
                            <StatCard
                                label="Profit"
                                value={`${result.profit >= 0 ? '+' : ''}${fmtUsd(result.profit)}`}
                                sub={`${fmtPct(result.roi, true)} ROI`}
                                valueClassName={profitClass}
                            />
                            <StatCard
                                label="BTC stacked"
                                value={fmtBtc(result.btcAccumulated)}
                                sub={fmtSats(result.btcAccumulated)}
                            />
                        </section>

                        {/* Secondary stats */}
                        <Card className="p-4 sm:p-5">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Annualized (XIRR)</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                        {stats?.xirrPercent != null ? fmtPct(stats.xirrPercent, true) : '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Max drawdown</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                        {stats ? `−${fmtPct(stats.maxDrawdownPercent)}` : '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Purchases</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                        {result.breakdown.length}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Best buy</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                        {stats?.bestBuy
                                            ? `${fmtUsd(stats.bestBuy.price)} · ${formatUtc(stats.bestBuy.date, 'full')}`
                                            : '—'}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        {/* Year-by-year table */}
                        <Card className="p-4 sm:p-6">
                            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
                                Year-by-year breakdown
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs sm:text-sm tabular-nums">
                                    <thead>
                                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                            <th className="py-2 pr-4 font-medium">Year</th>
                                            <th className="py-2 pr-4 font-medium text-right">Total invested</th>
                                            <th className="py-2 pr-4 font-medium text-right">Value at year end</th>
                                            <th className="py-2 font-medium text-right">ROI</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-700 dark:text-slate-300">
                                        {yearRows.map((row) => (
                                            <tr key={row.year} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">
                                                    {row.year}{row.isCurrentYear ? ' (YTD)' : ''}
                                                </td>
                                                <td className="py-2 pr-4 text-right">{fmtUsd(row.invested)}</td>
                                                <td className="py-2 pr-4 text-right">{fmtUsd(row.value)}</td>
                                                <td className={clsx(
                                                    'py-2 text-right font-medium',
                                                    row.roi >= 0
                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                        : 'text-rose-600 dark:text-rose-400',
                                                )}>
                                                    {fmtPct(row.roi, true)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                Each row is measured at that year&apos;s final scheduled purchase. The current year shows the latest purchase so far.
                            </p>
                        </Card>

                        {/* Methodology note */}
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            <strong className="font-semibold text-slate-600 dark:text-slate-300">How this is calculated:</strong>{' '}
                            purchases are simulated on UTC calendar days against Kraken weekly candles interpolated to daily
                            prices, with real daily market data covering 2010&ndash;2015. Amounts are in USD. No exchange fees
                            are applied. The full{' '}
                            <Link href="/methodology" className="text-amber-700 dark:text-amber-400 hover:underline">methodology</Link>{' '}
                            covers the rest.
                        </p>
                    </>
                ) : (
                    <Card className="p-6 sm:p-8">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="space-y-2">
                                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                                    Price data is temporarily unavailable
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    We couldn&apos;t load historical Bitcoin prices for this scenario right now.
                                    The live calculator pulls from several providers, so try running the same schedule there.
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
                        This page assumes ${amount} every {freqSlug} and zero fees. Change any of it in the live
                        calculator: amount, cadence, dates, fees, all backtested against the same historical data.
                    </p>
                    <Link
                        href={ctaHref}
                        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm sm:text-base"
                    >
                        Open the calculator
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </Card>

                {/* Related scenarios */}
                <section className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Related scenarios
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                        {related.map((s) => (
                            <Link
                                key={s.slug}
                                href={`/dca/${s.slug}`}
                                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-400 transition-colors tabular-nums"
                            >
                                {s.shortLabel}
                            </Link>
                        ))}
                    </div>
                    <p className="text-sm">
                        <Link href="/dca" className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 hover:underline font-medium">
                            Browse all DCA scenarios
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </p>
                </section>

                {/* Disclaimer */}
                <p className="border-t border-slate-200 dark:border-slate-800 pt-6 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Not financial advice. This is a historical simulation for educational purposes; past performance does
                    not guarantee future results. Bitcoin is volatile and you can lose money.
                </p>

            </div>
        </>
    );
}

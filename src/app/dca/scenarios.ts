// Shared scenario matrix for the programmatic SEO pages (/dca and /dca/[slug])
// and sitemap.ts. The matrix is FIXED: amounts x frequencies x start years.
// Slugs outside it must 404 — scenario pages are never computed from arbitrary
// user-supplied input.

import { parseUtcDate } from '@/utils/dates';

export const SCENARIO_AMOUNTS = [10, 50, 100, 250] as const;
export const SCENARIO_FREQ_SLUGS = ['week', 'month'] as const;

const FIRST_YEAR = 2013;
const LAST_YEAR = 2025;
export const SCENARIO_YEARS: number[] = Array.from(
    { length: LAST_YEAR - FIRST_YEAR + 1 },
    (_, i) => FIRST_YEAR + i,
);

export type ScenarioFreqSlug = (typeof SCENARIO_FREQ_SLUGS)[number];
export type ScenarioFrequency = 'weekly' | 'monthly';

const FREQUENCY_BY_SLUG: Record<ScenarioFreqSlug, ScenarioFrequency> = {
    week: 'weekly',
    month: 'monthly',
};

export interface Scenario {
    /** `{amount}-per-{freq}-since-{year}`, e.g. `100-per-week-since-2020` */
    slug: string;
    /** Purchase amount in USD */
    amount: number;
    freqSlug: ScenarioFreqSlug;
    /** Frequency value understood by calculateDca and the calculator's URL params */
    frequency: ScenarioFrequency;
    /** Start year — the schedule begins Jan 1 of this year (UTC) */
    year: number;
    /** `yyyy-01-01` */
    startDateIso: string;
    /** Jan 1 of `year`, UTC midnight (ms) */
    startTs: number;
    /** `$100/week since 2020` */
    shortLabel: string;
}

export const scenarioSlug = (amount: number, freqSlug: ScenarioFreqSlug, year: number): string =>
    `${amount}-per-${freqSlug}-since-${year}`;

/** All 104 scenarios (4 amounts x 2 frequencies x 13 years), in stable order. */
export const SCENARIOS: Scenario[] = SCENARIO_AMOUNTS.flatMap((amount) =>
    SCENARIO_FREQ_SLUGS.flatMap((freqSlug) =>
        SCENARIO_YEARS.map((year): Scenario => ({
            slug: scenarioSlug(amount, freqSlug, year),
            amount,
            freqSlug,
            frequency: FREQUENCY_BY_SLUG[freqSlug],
            year,
            startDateIso: `${year}-01-01`,
            startTs: Date.UTC(year, 0, 1),
            shortLabel: `$${amount}/${freqSlug} since ${year}`,
        })),
    ),
);

const SCENARIOS_BY_SLUG = new Map(SCENARIOS.map((s) => [s.slug, s]));

/** Strict lookup — only slugs from the fixed matrix resolve. */
export const getScenario = (slug: string): Scenario | undefined => SCENARIOS_BY_SLUG.get(slug);

export const findScenario = (
    amount: number,
    freqSlug: ScenarioFreqSlug,
    year: number,
): Scenario | undefined => SCENARIOS_BY_SLUG.get(scenarioSlug(amount, freqSlug, year));

// ── Curated scenarios ──────────────────────────────────────────────────────────
// Hand-picked story schedules ("what if I bought the exact top?") with fixed,
// factual start dates. Like the matrix, this list is FIXED and slugs outside it
// must 404 — every date and amount below is a checkable fact, stated in the
// title/description exactly as computed.
//
// Kept in their own array, not merged into SCENARIOS: that one is the fixed
// 4 x 2 x 13 matrix behind the "104 scenarios" copy and the grid on /dca, and
// its entries all start on January 1 at a weekly or monthly cadence. These start
// mid-year and run daily or biweekly too, so /dca/[slug]/page.tsx builds each
// page from the entry's own fields (title, dates, frequency), and
// generateStaticParams, sitemap.ts and /dca list CURATED_SCENARIOS separately.

export type CuratedFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface CuratedScenario {
    /** Story slug, e.g. `bought-the-2021-top-weekly` — never overlaps the matrix pattern */
    slug: string;
    /** Factual page title (root layout appends "| Bitcoin DCA Calculator") */
    title: string;
    /**
     * What the schedule is and why its dates or amount were chosen. Shown under
     * the page's heading, so every figure in it has to be checkable.
     */
    description: string;
    /** Purchase amount in USD */
    amount: number;
    /** Frequency value understood by calculateDca and the calculator's URL params */
    frequency: CuratedFrequency;
    /** First purchase day, `yyyy-MM-dd` (UTC) — a real market date, not always Jan 1 */
    startDateIso: string;
    /** UTC midnight of startDateIso (ms) */
    startTs: number;
    /** Fixed last day, `yyyy-MM-dd` (UTC). Omitted = the schedule runs to today. */
    endDateIso?: string;
    /** UTC midnight of endDateIso (ms), when endDateIso is set */
    endTs?: number;
    /** `$100/week since Nov 2021` */
    shortLabel: string;
}

/** Derives the timestamps so a slipped month index can never contradict the ISO date. */
const curated = (s: Omit<CuratedScenario, 'startTs' | 'endTs'>): CuratedScenario => ({
    ...s,
    startTs: parseUtcDate(s.startDateIso),
    endTs: s.endDateIso !== undefined ? parseUtcDate(s.endDateIso) : undefined,
});

export const CURATED_SCENARIOS: CuratedScenario[] = [
    // 2021-11-10 on Coinbase, checked 2026-10-12: high $69,000.00, the highest
    // trade of that cycle, and close $64,912.20, which is what the first buy
    // is priced at.
    curated({
        slug: 'bought-the-2021-top-weekly',
        title: '$100 a Week in Bitcoin Since the November 2021 Top',
        description: 'Weekly $100 buys starting November 10, 2021, the day Bitcoin traded at $69,000 on Coinbase, its highest price of that cycle. Buys here are priced at the daily close, which was $64,912 that day.',
        amount: 100,
        frequency: 'weekly',
        startDateIso: '2021-11-10',
        shortLabel: '$100/week since Nov 2021',
    }),
    // 2025-10-06: the highest daily close ($124,720) and the highest trade
    // ($126,296) on Coinbase to date, checked 2026-10-12. Called an all-time
    // high, not a "top": it is only the top until a higher price trades, and
    // that title would then be wrong where this one stays true. The slug is in
    // links already and stays as it is.
    curated({
        slug: 'bought-the-2025-top-weekly',
        title: '$100 a Week in Bitcoin Since the October 2025 All-Time High',
        description: 'Weekly $100 buys starting October 6, 2025, the day Bitcoin set its October 2025 all-time high: $124,720 at the daily close on Coinbase.',
        amount: 100,
        frequency: 'weekly',
        startDateIso: '2025-10-06',
        shortLabel: '$100/week since Oct 2025',
    }),
    curated({
        slug: 'one-coffee-a-day-since-2018',
        title: 'A $5 Coffee a Day in Bitcoin Since 2018',
        description: 'Five dollars, about one coffee, put into Bitcoin every day since January 1, 2018.',
        amount: 5,
        frequency: 'daily',
        startDateIso: '2018-01-01',
        shortLabel: '$5/day since 2018',
    }),
    // US Netflix Standard (ad-free) plan, checked 2026-10-12: $12.99 until
    // October 2020, $13.99 until January 2022, $15.49 from 14 January 2022 to
    // January 2025, $17.99 from 21 January 2025, $19.99 from 26 March 2026.
    // $15.49 is a flat amount chosen for the scenario, not the price throughout:
    // it was the plan's price for 36 of the monthly buys (February 2022 to
    // January 2025), under half of a window that starts in 2020.
    curated({
        slug: 'skipped-netflix-since-2020',
        title: 'Skipping Netflix for Bitcoin: $15.49 a Month Since 2020',
        description: 'A flat $15.49 a month, what a Standard Netflix plan cost in the US from January 2022 to January 2025, put into Bitcoin every month since January 1, 2020.',
        amount: 15.49,
        frequency: 'monthly',
        startDateIso: '2020-01-01',
        shortLabel: '$15.49/month since 2020',
    }),
    // A completed calendar year, not a rolling window: a fixed range keeps the
    // page, its OG card and the sitemap telling the same story all day.
    curated({
        slug: 'first-year-of-dca',
        title: 'A First Year of DCA: $25 a Week Through 2025',
        description: 'One calendar year of $25 weekly buys, from January 1 to December 31, 2025. The buying stops there, and the stack is still valued at the latest price.',
        amount: 25,
        frequency: 'weekly',
        startDateIso: '2025-01-01',
        endDateIso: '2025-12-31',
        shortLabel: '$25/week through 2025',
    }),
    // $7.25/h US federal minimum wage (unchanged since 2009) × 8 hours = $58.
    curated({
        slug: 'minimum-wage-day-per-week',
        title: 'One Workday at Minimum Wage in Bitcoin Weekly Since 2020',
        description: 'Eight hours at the $7.25 US federal minimum wage is $58: one workday’s pay put into Bitcoin every week since January 1, 2020.',
        amount: 58,
        frequency: 'weekly',
        startDateIso: '2020-01-01',
        shortLabel: '$58/week since 2020',
    }),
    curated({
        slug: 'paycheck-percent-experiment',
        title: '$100 From Every Biweekly Paycheck in Bitcoin Since 2019',
        description: 'A flat $100 set aside every two weeks since January 1, 2019, the rhythm of a biweekly paycheck.',
        amount: 100,
        frequency: 'biweekly',
        startDateIso: '2019-01-01',
        shortLabel: '$100/2 weeks since 2019',
    }),
    // In the bundled blockchain.info rows: $1,133.95 on 2013-11-30, the year's
    // high of $1,136.90 on 2013-12-05, and the low that followed, $172.00 on
    // 2015-01-15, which is 84.9% below that high. The home page's "from 2013
    // peak" preset starts on the same day.
    curated({
        slug: 'lost-decade-test',
        title: 'The Lost Decade Test: $50 a Week Since the 2013 Peak',
        description: 'Weekly $50 buys starting November 30, 2013, within a week of that year’s high (about $1,137 on December 5 in the price history this page uses) and before a fall of about 85% by January 2015.',
        amount: 50,
        frequency: 'weekly',
        startDateIso: '2013-11-30',
        shortLabel: '$50/week since Nov 2013',
    }),
];

const CURATED_BY_SLUG = new Map(CURATED_SCENARIOS.map((s) => [s.slug, s]));

/** Strict lookup — only slugs from the curated list resolve. */
export const getCuratedScenario = (slug: string): CuratedScenario | undefined =>
    CURATED_BY_SLUG.get(slug);

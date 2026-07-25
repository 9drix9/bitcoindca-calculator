// Shared scenario matrix for the programmatic SEO pages (/dca and /dca/[slug])
// and sitemap.ts. The matrix is FIXED: amounts x frequencies x start years.
// Slugs outside it must 404 — scenario pages are never computed from arbitrary
// user-supplied input.

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

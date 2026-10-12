// All price data and DCA schedules are bucketed by UTC calendar day.
// Local-time APIs (getDate, toLocaleDateString) shift dates by a day for users
// west of UTC, so every date shown to the user must go through these.
//
// Nothing here reads the clock unless the caller leaves `now` out. Every helper
// that needs "today" takes an optional `now` (ms), so a server render and the
// browser hydrating it can be handed the same instant, and tests can pin time.

import { DEFAULT_PLAN } from '@/data/planDefaults';

export const DAY_MS = 86_400_000;

/**
 * First UTC day in our price data: the first row of the bundled
 * blockchain.info series in data/btcHistorical.ts. It is where our data
 * begins and makes no claim about when bitcoin first had a price. We cannot
 * price anything before it, so date inputs and shared links are clamped to it:
 * a 2009 start date must not buy 18 months of BTC at the first known price.
 */
export const EARLIEST_PRICE_DATE = '2010-08-18';
export const EARLIEST_PRICE_TS = Date.UTC(2010, 7, 18);

/**
 * Latest end date a plan may have. A future end date is a supported projection,
 * but it needs a ceiling: an end date centuries out compounds the yearly raise
 * to Infinity ("$∞", "NaN%") or runs into the engine's purchase limit and stops
 * early under a label that still shows the date typed in.
 *
 * Between EARLIEST_PRICE_DATE and this day there are 33,008 days, so even a
 * daily plan stays under MAX_SCHEDULE_PURCHASES (utils/dca) and every total
 * stays finite at the largest amount and raise a link can carry.
 *
 * Check typed input against MAX_END_TS, not the string. A date field can hand
 * over a five-digit year, and '20300-01-01' sorts before '2100-12-31' while
 * parseUtcDate turns it into NaN: `!(parseUtcDate(value) <= MAX_END_TS)`
 * rejects both that and a real date past the ceiling.
 */
export const MAX_END_DATE = '2100-12-31';
export const MAX_END_TS = Date.UTC(2100, 11, 31);

/** Canonical UTC day index for a timestamp (ms). Same-day timestamps map to the same index. */
export const utcDayIndex = (ts: number): number => Math.floor(ts / DAY_MS);

/** UTC midnight (ms) of the day containing ts. */
export const utcDayStart = (ts: number): number => utcDayIndex(ts) * DAY_MS;

/** 'yyyy-MM-dd' for the UTC day containing ts. */
const isoDay = (ts: number): string => new Date(ts).toISOString().slice(0, 10);

/**
 * The rule behind every "what you have stacked so far" figure: a purchase has
 * happened only if it is dated on or before today's UTC day. A buy scheduled
 * for tomorrow is a plan, not history, whatever the visitor's local clock says.
 */
export const hasHappenedUtc = (ts: number, now: number = Date.now()): boolean =>
    utcDayIndex(ts) <= utcDayIndex(now);

/**
 * The last UTC day (midnight ms) a schedule ending on `endTs` can have reached
 * as of `now`: its own end day, or today if it runs into the future.
 */
export const clampToTodayUtc = (endTs: number, now: number = Date.now()): number =>
    Math.min(utcDayStart(endTs), utcDayStart(now));

/**
 * Add whole months in UTC, clamping to month length but re-anchoring to the
 * original day-of-month so Jan 31 → Feb 28 → Mar 31 (no drift).
 */
export const addUtcMonths = (startTs: number, months: number, anchorDay: number): number => {
    const d = new Date(startTs);
    const total = d.getUTCMonth() + months;
    const year = d.getUTCFullYear() + Math.floor(total / 12);
    const month = ((total % 12) + 12) % 12;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Date.UTC(year, month, Math.min(anchorDay, daysInMonth));
};

/**
 * UTC midnight (ms) `months` calendar months before the day containing ts.
 * The day of month is kept and clamped to the target month's length, so
 * Mar 31 minus one month is Feb 28 (or 29), never Mar 3.
 */
export const utcMonthsBefore = (ts: number, months: number): number => {
    const day = utcDayStart(ts);
    return addUtcMonths(day, -months, new Date(day).getUTCDate());
};

/** UTC midnight (ms) `years` calendar years before the day containing ts (Feb 29 → Feb 28). */
export const utcYearsBefore = (ts: number, years: number): number => utcMonthsBefore(ts, years * 12);

/**
 * Default calculator window, derived in UTC.
 *
 * The homepage seeds the calculator with server-fetched prices, so the server and
 * the browser must independently arrive at the SAME default dates — otherwise the
 * seeded data covers a different range than the client asks for, and the result
 * flashes.
 *
 * Even in UTC the two can disagree when they read the clock separately: the home
 * page is a cached prerender, so the first visitor after UTC midnight hydrates
 * yesterday's HTML. Pass the server's render instant as `now` on both sides.
 */
export const utcIsoToday = (now: number = Date.now()): string => isoDay(now);

export const utcIsoYearsAgo = (years: number, now: number = Date.now()): string =>
    isoDay(utcYearsBefore(now, years));

/** The window the calculator opens on: the last 5 years. Defined in data/planDefaults. */
export const DEFAULT_YEARS_BACK = DEFAULT_PLAN.yearsBack;

/**
 * The start date ('yyyy-MM-dd') a plan gets when only its end is known:
 * DEFAULT_YEARS_BACK years before the end day, and never before the first day
 * that can be priced.
 */
export const defaultStartFor = (endTs: number): string =>
    isoDay(Math.max(utcYearsBefore(endTs, DEFAULT_YEARS_BACK), EARLIEST_PRICE_TS));

/**
 * The default plan's window as of `now`: the last DEFAULT_YEARS_BACK years,
 * ending today (UTC). The one derivation for every surface that falls back to
 * the default plan, so the hero stat, the seeded home page, the calculator and
 * a parameterless /share or /api call all cover the same days.
 */
export const defaultPlanWindow = (
    now: number = Date.now(),
): { startDate: string; endDate: string; startTs: number; endTs: number } => {
    const endTs = utcDayStart(now);
    const startDate = defaultStartFor(endTs);
    return { startDate, endDate: isoDay(endTs), startTs: parseUtcDate(startDate), endTs };
};

/**
 * Completed calendar months between two UTC instants (0 when `toTs` is not
 * after `fromTs`). Jan 1 → Jul 1 is 6.
 *
 * A month is complete once the start day, moved forward and clamped to the
 * month's length, has been reached — the same stepping a monthly schedule uses
 * (addUtcMonths), so Jan 31 → Feb 28 is one month, exactly one purchase apart.
 *
 * Counted in UTC: in local time a UTC-midnight purchase date falls on the
 * previous evening for anyone west of UTC, and a six-month plan reads "5mo" in
 * the Americas.
 */
export const utcMonthsBetween = (fromTs: number, toTs: number): number => {
    if (!(toTs > fromTs)) return 0;
    const from = new Date(fromTs);
    const to = new Date(toTs);
    const anchorDay = from.getUTCDate();
    let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
    while (months > 0 && addUtcMonths(fromTs, months, anchorDay) > toTs) {
        months--;
    }
    return Math.max(0, months);
};

/**
 * Completed 12-month anniversaries between two UTC instants (0 for the first year).
 *
 * Counted in the same clamped months as above, so a Feb 29 start has its
 * anniversary on Feb 28 in a non-leap year. That keeps the yearly raise on the
 * 13th monthly purchase for every start day; rolling Feb 29 over to Mar 1
 * would put it one whole purchase late for a plan started on a leap day.
 */
export const utcFullYearsBetween = (fromTs: number, toTs: number): number =>
    Math.floor(utcMonthsBetween(fromTs, toTs) / 12);

/** Parse a 'yyyy-MM-dd' input value as UTC midnight (ms). Returns NaN for invalid input. */
export const parseUtcDate = (value: string): number => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const MONTH_YEAR = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' });
const SHORT_MY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: '2-digit' });
const FULL = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const ISO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }); // yyyy-MM-dd

/** Format a UTC timestamp/ISO date for display without local-timezone day shifts. */
export const formatUtc = (
    date: string | number,
    style: 'monthDay' | 'monthYear' | 'shortMonthYear' | 'full' | 'isoDay',
): string => {
    const d = typeof date === 'number' ? new Date(date) : new Date(date);
    switch (style) {
        case 'monthDay': return MONTH_DAY.format(d);
        case 'monthYear': return MONTH_YEAR.format(d);
        case 'shortMonthYear': return SHORT_MY.format(d);
        case 'isoDay': return ISO_DAY.format(d);
        default: return FULL.format(d);
    }
};

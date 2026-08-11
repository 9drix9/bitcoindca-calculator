// All price data and DCA schedules are bucketed by UTC calendar day.
// Local-time APIs (date-fns startOfDay, toLocaleDateString) shift dates by a day
// for users west of UTC, so every date shown to the user must go through these.

export const DAY_MS = 86_400_000;

/**
 * First UTC day with a real market price (blockchain.info series in
 * data/btcHistorical.ts). Nothing before this can be priced honestly, so date
 * inputs and shared links are clamped to it — otherwise a 2009 start date used
 * to buy 18 months of BTC at $0.07 and report billions in gains.
 */
export const EARLIEST_PRICE_DATE = '2010-08-18';
export const EARLIEST_PRICE_TS = Date.UTC(2010, 7, 18);

/**
 * Default calculator window, derived in UTC.
 *
 * The homepage seeds the calculator with server-fetched prices, so the server and
 * the browser must independently arrive at the SAME default dates — otherwise the
 * seeded data covers a different range than the client asks for, and the result
 * flashes. date-fns `startOfToday`/`format` are local-time and would disagree.
 */
export const utcIsoToday = (): string => new Date().toISOString().slice(0, 10);

export const utcIsoYearsAgo = (years: number): string => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()))
        .toISOString()
        .slice(0, 10);
};

export const utcIsoMonthsAgo = (months: number): string => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()))
        .toISOString()
        .slice(0, 10);
};

/** The window the calculator opens on: the last 5 years. */
export const DEFAULT_YEARS_BACK = 5;

/** Canonical UTC day index for a timestamp (ms). Same-day timestamps map to the same index. */
export const utcDayIndex = (ts: number): number => Math.floor(ts / DAY_MS);

/** UTC midnight (ms) of the day containing ts. */
export const utcDayStart = (ts: number): number => utcDayIndex(ts) * DAY_MS;

/** Parse a 'yyyy-MM-dd' input value as UTC midnight (ms). Returns NaN for invalid input. */
export const parseUtcDate = (value: string): number => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

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

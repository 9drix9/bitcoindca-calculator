import { DAY_MS, utcDayIndex, utcDayStart } from '@/utils/dates';

/**
 * Pure helpers behind the computed dataset pages (/best-day-to-buy-bitcoin,
 * /lump-sum-vs-dca, /dca/start-date-heatmap).
 *
 * These live here rather than inside the page components for one reason: those
 * pages publish their numbers as fact, inside schema.org Dataset markup. A
 * defect here is a false claim, not a rendering glitch — and an earlier audit
 * caught one heatmap cell off by 378 percentage points. Logic that makes
 * assertions to search engines needs to be reachable from a test.
 */

// ── Price lookup ──────────────────────────────────────────────────────────────

/**
 * Binary-search lookup returning the last known price at or before a day.
 *
 * Returns null rather than the earliest price when the target predates every
 * bar. That distinction is the whole point: falling back to the first known
 * price is how a 2009 start date once "bought" 18 months of BTC at $0.07.
 */
export function makeDayPriceLookup(priceData: [number, number][]): (ts: number) => number | null {
    const days: number[] = [];
    const prices: number[] = [];
    for (const [ts, price] of priceData) {
        const day = utcDayIndex(ts);
        const lastIndex = days.length - 1;
        if (lastIndex >= 0 && days[lastIndex] === day) continue; // first bar of the day wins
        if (lastIndex >= 0 && day < days[lastIndex]) continue;   // guard: input expected sorted
        days.push(day);
        prices.push(price);
    }
    return (ts: number): number | null => {
        const target = utcDayIndex(ts);
        let lo = 0;
        let hi = days.length - 1;
        let found = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (days[mid] <= target) {
                found = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return found >= 0 ? prices[found] : null;
    };
}

// ── Weekday anchoring ─────────────────────────────────────────────────────────

/**
 * First UTC day on or after `ts` whose weekday matches (0 = Sunday).
 *
 * The day-of-week comparison MUST be UTC. A local-time getDay() shifts the
 * anchor by one for anyone west of UTC, which would silently compare "Tuesday"
 * against a schedule that actually starts on Monday.
 */
export function firstWeekdayOnOrAfter(ts: number, weekday: number): number {
    let day = utcDayStart(ts);
    for (let i = 0; i < 7; i++) {
        if (new Date(day).getUTCDay() === weekday) return day;
        day += DAY_MS;
    }
    return day;
}

// ── Interpolation detection ───────────────────────────────────────────────────

/**
 * True when a daily series looks linearly interpolated rather than sampled.
 *
 * Kraken returns WEEKLY candles which the data layer straight-lines to daily.
 * On an interpolated series every weekday is near-identical by construction, so
 * a day-of-week comparison built on it would be meaningless — the page has to
 * detect that and say so rather than publish a finding it cannot support.
 *
 * Test: for three consecutive daily points, an interpolated middle point sits
 * exactly on the line between its neighbours.
 */
export function looksInterpolated(data: [number, number][]): boolean {
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

// ── Summary statistics ────────────────────────────────────────────────────────

/** Nearest-rank percentile of an ALREADY-SORTED ascending array. */
export function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
    return sorted[idx];
}

/** Median. Sorts a copy, so the caller's array is untouched. */
export function median(values: number[]): number {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    const n = s.length;
    return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

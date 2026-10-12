import { DAY_MS } from '@/utils/dates';

/**
 * Drawdown detection for the history section of the drawdown page: the
 * episodes, the counts and the rows of the table. Kept out of the page so the
 * figures it prints can be tested against a series with known answers.
 */

export interface Episode {
    peakTs: number;
    peakPrice: number;
    troughTs: number;
    troughPrice: number;
    /** Positive percentage, peak close to trough close */
    depthPercent: number;
    daysToTrough: number;
    /** null while the previous peak has never been reclaimed */
    recoveredTs: number | null;
    daysToRecover: number | null;
}

/**
 * Walk a daily close series and record every peak-to-trough episode deeper
 * than `minDepth`, the one still under way included. A new peak closes the
 * running episode: the drawdown is "over" the day the previous high is
 * reclaimed, which is the standard definition.
 */
export function findDrawdowns(series: readonly (readonly [number, number])[], minDepth: number): Episode[] {
    const episodes: Episode[] = [];
    if (series.length < 2) return episodes;

    let peakTs = series[0][0];
    let peakPrice = series[0][1];
    let troughTs = peakTs;
    let troughPrice = peakPrice;
    let inDrawdown = false;

    const close = (recoveredTs: number | null) => {
        const depth = peakPrice > 0 ? (peakPrice - troughPrice) / peakPrice : 0;
        if (depth >= minDepth) {
            episodes.push({
                peakTs,
                peakPrice,
                troughTs,
                troughPrice,
                depthPercent: depth * 100,
                daysToTrough: (troughTs - peakTs) / DAY_MS,
                recoveredTs,
                daysToRecover: recoveredTs === null ? null : (recoveredTs - peakTs) / DAY_MS,
            });
        }
    };

    for (let i = 1; i < series.length; i++) {
        const [ts, price] = series[i];
        if (!Number.isFinite(price) || price <= 0) continue;

        if (price >= peakPrice) {
            if (inDrawdown) {
                close(ts);
                inDrawdown = false;
            }
            peakTs = ts;
            peakPrice = price;
            troughTs = ts;
            troughPrice = price;
        } else {
            if (!inDrawdown) {
                inDrawdown = true;
                troughTs = ts;
                troughPrice = price;
            } else if (price < troughPrice) {
                troughTs = ts;
                troughPrice = price;
            }
        }
    }
    if (inDrawdown) close(null);
    return episodes;
}

/** Deepest peak-to-trough decline inside a series, as a positive percentage. */
export function maxDrawdownPercent(series: readonly (readonly [number, number])[]): number {
    let peak = 0;
    let worst = 0;
    for (const [, price] of series) {
        if (!Number.isFinite(price) || price <= 0) continue;
        if (price > peak) peak = price;
        else if (peak > 0) {
            const dd = (peak - price) / peak;
            if (dd > worst) worst = dd;
        }
    }
    return worst * 100;
}

/**
 * The middle value, or the mean of the two middle values when there is an even
 * number of them. Null for an empty list.
 */
export function median(values: readonly number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The rows of the history table, in date order: the deepest `rows` episodes,
 * never fewer than every episode of `alwaysPercent` or more, and the fall
 * still under way wherever it ranks. That one has no recovery date yet, so it
 * can sit just below the cut while being the fall the reader is living through
 * and one of the falls the counts above the table include.
 */
export function listedEpisodes(all: readonly Episode[], rows: number, alwaysPercent: number): Episode[] {
    const always = all.filter((e) => e.depthPercent >= alwaysPercent).length;
    const listed = [...all]
        .sort((a, b) => b.depthPercent - a.depthPercent)
        .slice(0, Math.max(rows, always));
    const open = all.find((e) => e.recoveredTs === null);
    if (open && !listed.includes(open)) listed.push(open);
    return listed.sort((a, b) => a.peakTs - b.peakTs);
}

import { calculateDca } from '@/utils/dca';
import { DAY_MS, utcDayStart } from '@/utils/dates';
import { firstWeekdayOnOrAfter, median } from '@/utils/datasets';
import { FIRST_EXCHANGE_CLOSE_TS } from '@/data/priceSources';
import type { PricePair } from '@/utils/priceSeries';

/**
 * The numbers behind /best-day-to-buy-bitcoin.
 *
 * Kept out of page.tsx so they can be tested: a Next page file can only export
 * the page, and this one publishes its results as fact in Dataset markup.
 *
 * There are two analyses here and they answer different questions.
 *
 * sevenPlans() is the comparison the page is named after: seven weekly plans,
 * one per weekday, same amount, same number of buys. It is what a reader
 * expects to see and it is published in full, but it does not measure
 * weekdays. Seven weekdays cannot share a start date, so the plans start on
 * seven consecutive days, and every purchase of the plan that starts first
 * lands six days ahead of the matching purchase of the plan that starts last.
 * While the price is climbing, earlier is cheaper. Run from the first exchange
 * close (2015-07-20, a Monday) the seven finish Monday, Tuesday, ... Sunday:
 * exactly the order they started in. The page used to say this only mattered
 * for the 2010 start and offered the ranking over the last 10, 5 and 2 years
 * as "the honest test". On the closes to 2026-10-11, starting the 10-year
 * window on Oct 10, 2016 put Monday first; starting it on Oct 11 put Monday
 * last.
 *
 * weekdayAgainstItsWeek() is the test that does measure weekdays: every day's
 * price against the seven days centred on it. No plan starts before another,
 * every week counts the same, and the result comes with a margin of error.
 */

/** Every plan buys this much, every week, with no fees. */
export const WEEKLY_AMOUNT = 100;
const WEEK_MS = 7 * DAY_MS;

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

// ── Seven plans ───────────────────────────────────────────────────────────────

export interface PlanRow {
    weekday: number;
    name: string;
    startTs: number;
    /** 1 = this plan made its first buy before the other six. */
    startOrder: number;
    btc: number;
    averageCost: number;
    /** Worth at the last daily close. */
    finalValue: number;
    /** BTC accumulated relative to the seven-plan mean, in percent. */
    vsMeanPercent: number;
    /** 1 = most BTC accumulated. */
    rank: number;
}

/** How much of each plan rests on its opening purchases. */
export interface OpeningBuys {
    /** How many opening purchases this covers. */
    buys: number;
    /** Mean share of each plan's final BTC that those purchases bought, in percent. */
    sharePercent: number;
    /** Date of the last of them, across the seven plans. */
    endTs: number;
    /** Lowest and highest price paid in them, across the seven plans. */
    minPrice: number;
    maxPrice: number;
    /** True when every one of those prices is a whole number of cents. */
    wholeCents: boolean;
    /**
     * What happens to a plan's final BTC, in percent, if each of those prices
     * had been one cent higher, or one cent lower. Mean of the seven plans.
     * Null when a cent lower would make a price zero.
     */
    centHigherPercent: number;
    centLowerPercent: number | null;
}

export interface SevenPlans {
    firstBuyTs: number;
    lastBuyTs: number;
    purchases: number;
    invested: number;
    /** In weekday order, Sunday first. */
    rows: PlanRow[];
    /** (best BTC - worst BTC) / worst BTC, in percent. */
    spreadPercent: number;
    bestName: string;
    worstName: string;
    /** How many of the seven finished in the place they started in (rank = start order). */
    ranksInStartOrder: number;
    opening: OpeningBuys;
    /**
     * Mean share of each plan's final BTC bought before the first exchange
     * close (2015-07-20), in percent. Those purchases are priced on the bundled
     * blockchain.info rows, which are 00:00 UTC figures: a row dated Monday is
     * in effect Sunday's close, so the weekday label is a day out.
     */
    beforeExchangePercent: number;
}

/**
 * Seven identical weekly plans, one anchored to each UTC weekday, starting on
 * the first matching day on or after `floorTs` and running to the last close.
 *
 * Every plan makes the same number of buys (the smallest count that fits all
 * seven), so total invested is identical. Null when that is under six months
 * of weekly buys, or when a buy has no price: a skipped purchase would break
 * the "same money in" premise without showing anywhere.
 */
export function sevenPlans(floorTs: number, closes: PricePair[]): SevenPlans | null {
    if (closes.length === 0) return null;
    const floorDay = utcDayStart(floorTs);
    const endTs = closes[closes.length - 1][0];
    const lastClose = closes[closes.length - 1][1];

    const starts: number[] = [];
    for (let weekday = 0; weekday < 7; weekday++) starts.push(firstWeekdayOnOrAfter(floorDay, weekday));

    const purchases = Math.min(...starts.map((s) => Math.floor((endTs - s) / WEEK_MS) + 1));
    if (!Number.isFinite(purchases) || purchases < 26) return null;

    const raw = starts.map((startTs, weekday) => ({
        weekday,
        startTs,
        result: calculateDca(
            {
                amount: WEEKLY_AMOUNT,
                frequency: 'weekly',
                startDate: new Date(startTs),
                endDate: new Date(startTs + (purchases - 1) * WEEK_MS),
                feePercentage: 0,
                priceMode: 'api',
                manualPrice: 0,
            },
            closes,
            // Valued at the last close, and dated there, so the same closes
            // always give the same table whenever the page is rendered.
            lastClose,
            endTs,
        ),
    }));

    if (raw.some((r) => r.result.breakdown.length !== purchases)) return null;
    if (raw.some((r) => !Number.isFinite(r.result.btcAccumulated) || r.result.btcAccumulated <= 0)) return null;

    const meanBtc = raw.reduce((sum, r) => sum + r.result.btcAccumulated, 0) / raw.length;
    const byBtcDesc = [...raw].sort((a, b) => b.result.btcAccumulated - a.result.btcAccumulated);
    const byStart = [...raw].sort((a, b) => a.startTs - b.startTs);

    const rows: PlanRow[] = raw.map(({ weekday, startTs, result }) => ({
        weekday,
        name: WEEKDAY_NAMES[weekday],
        startTs,
        startOrder: byStart.findIndex((r) => r.weekday === weekday) + 1,
        btc: result.btcAccumulated,
        averageCost: result.averageCost,
        finalValue: result.currentValue,
        vsMeanPercent: (result.btcAccumulated / meanBtc - 1) * 100,
        rank: byBtcDesc.findIndex((r) => r.weekday === weekday) + 1,
    }));

    // How front-loaded is each plan? If a handful of opening buys account for
    // most of the BTC, the table ranks those few weeks, not the weekday.
    const openingBuys = Math.min(10, purchases);
    const heads = raw.map((r) => r.result.breakdown.slice(0, openingBuys));
    const openingPrices = heads.flatMap((head) => head.map((buy) => buy.price));
    const minPrice = Math.min(...openingPrices);
    const withShiftedOpening = (cents: number): number =>
        (raw.reduce((sum, r, i) => {
            const before = heads[i].reduce((btc, buy) => btc + buy.accumulated, 0);
            const after = heads[i].reduce((btc, buy) => btc + buy.invested / (buy.price + cents / 100), 0);
            return sum + (r.result.btcAccumulated - before + after) / r.result.btcAccumulated - 1;
        }, 0) /
            raw.length) *
        100;

    const meanShare = (share: (r: (typeof raw)[number], i: number) => number): number =>
        (raw.reduce((sum, r, i) => sum + share(r, i), 0) / raw.length) * 100;

    const bestBtc = byBtcDesc[0].result.btcAccumulated;
    const worstBtc = byBtcDesc[byBtcDesc.length - 1].result.btcAccumulated;

    return {
        firstBuyTs: Math.min(...starts),
        lastBuyTs: Math.max(...starts) + (purchases - 1) * WEEK_MS,
        purchases,
        invested: purchases * WEEKLY_AMOUNT,
        rows,
        spreadPercent: ((bestBtc - worstBtc) / worstBtc) * 100,
        bestName: WEEKDAY_NAMES[byBtcDesc[0].weekday],
        worstName: WEEKDAY_NAMES[byBtcDesc[byBtcDesc.length - 1].weekday],
        ranksInStartOrder: rows.filter((row) => row.rank === row.startOrder).length,
        opening: {
            buys: openingBuys,
            sharePercent: meanShare((r, i) => heads[i][openingBuys - 1].totalAccumulated / r.result.btcAccumulated),
            endTs: Math.max(...starts) + (openingBuys - 1) * WEEK_MS,
            minPrice,
            maxPrice: Math.max(...openingPrices),
            wholeCents: openingPrices.every((price) => Math.abs(price * 100 - Math.round(price * 100)) < 1e-6),
            centHigherPercent: withShiftedOpening(1),
            centLowerPercent: minPrice > 0.01 + 1e-9 ? withShiftedOpening(-1) : null,
        },
        beforeExchangePercent: meanShare((r) =>
            r.result.breakdown.reduce(
                (btc, buy) => (Date.parse(buy.date) < FIRST_EXCHANGE_CLOSE_TS ? btc + buy.accumulated : btc),
                0,
            ) / r.result.btcAccumulated,
        ),
    };
}

/** The plan whose place changes most when the same comparison starts one day later. */
export interface RankMove {
    name: string;
    from: number;
    to: number;
}

/**
 * Compare two runs of the seven plans and return the largest change of place.
 * Between two equal moves, the plan that started first in `before` is named:
 * moving the start a day later is what turns it into the last to start.
 */
export function largestRankMove(before: SevenPlans, after: SevenPlans): RankMove | null {
    let move: (RankMove & { startOrder: number }) | null = null;
    for (const row of before.rows) {
        const moved = after.rows.find((r) => r.weekday === row.weekday);
        if (!moved || moved.rank === row.rank) continue;
        const size = Math.abs(moved.rank - row.rank);
        const current = move ? Math.abs(move.to - move.from) : 0;
        if (size > current || (size === current && move !== null && row.startOrder < move.startOrder)) {
            move = { name: row.name, from: row.rank, to: moved.rank, startOrder: row.startOrder };
        }
    }
    return move ? { name: move.name, from: move.from, to: move.to } : null;
}

// ── The two September 2010 rows ───────────────────────────────────────────────

/**
 * The one place the bundled early rows look wrong (data/btcHistorical.ts):
 * 2010-09-15 and 2010-09-16 read $0.09 and $0.15 between days at $0.06, and
 * Coin Metrics has $0.0604 and $0.0619 for them (both sources read
 * 2026-10-12). The series keeps them as blockchain.info publishes them. Run
 * from the first day of data they are the fifth purchase of the Wednesday and
 * the Thursday plan, so the page has to say what its table comes to without
 * them.
 */
const SPIKE_DAYS = [Date.UTC(2010, 8, 15), Date.UTC(2010, 8, 16)] as const;

/** The seven plans with the two spike days priced like the days either side of them. */
export interface WithoutSpike {
    /** The two days as the series has them. */
    days: { ts: number; price: number }[];
    /** The price on the day before and the day after, used in their place. */
    neighbourPrice: number;
    bestName: string;
    worstName: string;
    spreadPercent: number;
}

/**
 * Re-run sevenPlans() with the spike days set to their neighbours' price.
 * Null when the series does not hold them, when they no longer stand out, or
 * when the days either side disagree and there is no one price to put in.
 */
export function sevenPlansWithoutSpike(floorTs: number, closes: PricePair[]): WithoutSpike | null {
    const first = closes.findIndex(([ts]) => ts === SPIKE_DAYS[0]);
    const after = first + SPIKE_DAYS.length;
    if (first < 1 || after >= closes.length) return null;
    if (SPIKE_DAYS.some((ts, i) => closes[first + i][0] !== ts)) return null;

    const neighbourPrice = closes[first - 1][1];
    if (closes[after][1] !== neighbourPrice) return null;
    const days = SPIKE_DAYS.map((ts, i) => ({ ts, price: closes[first + i][1] }));
    if (days.every((day) => day.price === neighbourPrice)) return null;

    const plans = sevenPlans(
        floorTs,
        closes.map((row, i): PricePair => (i >= first && i < after ? [row[0], neighbourPrice] : row)),
    );
    return plans
        ? { days, neighbourPrice, bestName: plans.bestName, worstName: plans.worstName, spreadPercent: plans.spreadPercent }
        : null;
}

// ── Each weekday against the week around it ───────────────────────────────────

export interface WeekdayEdge {
    weekday: number;
    name: string;
    /** Days of this weekday that were measured (one per week). */
    weeks: number;
    /**
     * Mean gap between this weekday's close and the geometric mean of the
     * seven closes centred on it: 100 x ln(week / day), which for gaps this
     * small is a percentage. Positive means the day closed below its week, so
     * it was the cheaper day to buy on.
     */
    edgePercent: number;
    /** Two standard errors of that mean, in percentage points. */
    marginPercent: number;
    /**
     * Whole calendar years in which the weekday came out cheaper than its week
     * (mean above zero) and dearer (below zero), and how many were counted.
     */
    yearsAhead: number;
    yearsBehind: number;
    yearsCounted: number;
}

/**
 * What the same days look like with the weekday taken out of them.
 *
 * Inside every run of seven consecutive measured days, the seven figures are
 * dealt to the seven weekdays at random. Any real weekday effect is gone;
 * everything else (how far prices swing, how the swings bunch together, the
 * years they fall in) is untouched. Doing that many times shows what a table
 * built from weekdays that mean nothing looks like, which is the only fair
 * yardstick for the real one.
 */
export interface ShuffleCheck {
    /** How many random deals were made. */
    deals: number;
    /** Share of deals whose best-minus-worst gap was at least the real one, in percent. */
    gapAtLeastPercent: number;
    /**
     * Share of deals with at least as many lopsided weekdays as the real
     * table, in percent. Null when the real table has none.
     */
    lopsidedAtLeastPercent: number | null;
}

export interface WeekTest {
    /** First and last day measured. */
    fromTs: number;
    toTs: number;
    /** Weeks measured: the smallest count among the seven weekdays. */
    weeks: number;
    /** In weekday order, Sunday first. */
    rows: WeekdayEdge[];
    best: WeekdayEdge;
    worst: WeekdayEdge;
    /** best.edgePercent - worst.edgePercent, in percentage points. */
    gapPercent: number;
    /** Largest margin of error among the seven, in percentage points. */
    widestMarginPercent: number;
    /** Weekdays whose mean is further from zero than its own margin of error. */
    beyondMargin: WeekdayEdge[];
    /** Weekdays on the same side of their week in at least four calendar years out of five. */
    lopsided: WeekdayEdge[];
    /** First and last whole calendar year measured; null when there is none. */
    years: { first: number; last: number; count: number } | null;
    /** How far one day's price typically sits from its own week (median absolute edge), in percent. */
    typicalDayPercent: number;
    shuffle: ShuffleCheck;
}

/** Fewest weeks worth averaging: two years. */
const MIN_TEST_WEEKS = 104;
/** A weekday counts as lopsided from this share of years on one side, given at least MIN_LOPSIDED_YEARS. */
const LOPSIDED_SHARE = 0.8;
const MIN_LOPSIDED_YEARS = 5;
/** Random deals in the shuffle check. Enough that a share moves by under a point or two between seeds. */
const SHUFFLE_DEALS = 2000;

/** One measured day: its weekday, which counted year it falls in (-1 for none), and its edge. */
export interface MeasuredDay {
    weekday: number;
    yearIndex: number;
    edge: number;
}

/** Whether a weekday sat on one side of its week in at least four years out of five. A level year is neither side. */
const isLopsided = (ahead: number, behind: number, yearCount: number): boolean =>
    yearCount >= MIN_LOPSIDED_YEARS && Math.max(ahead, behind) >= Math.ceil(LOPSIDED_SHARE * yearCount - 1e-9);

/**
 * Seeded generator (mulberry32). The shuffle has to give the same answer for
 * the same closes: the page is rendered more than once from one set of prices,
 * and a figure that changed between renders would not be a figure.
 */
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Run the shuffle check on days in date order. Only whole runs of seven are
 * used (each holds every weekday once), and the real table is re-tallied over
 * those same days so that like is compared with like.
 */
export function shuffleWeekdays(days: MeasuredDay[], yearCount: number, deals: number = SHUFFLE_DEALS): ShuffleCheck {
    const blocks = Math.floor(days.length / 7);
    const sums = new Float64Array(7);
    const yearSums = new Float64Array(7 * Math.max(1, yearCount));
    const order = [0, 1, 2, 3, 4, 5, 6];

    // One table: the real labels, or each run of seven dealt at random.
    const tally = (shuffled: boolean, random: () => number): { gap: number; lopsided: number } => {
        sums.fill(0);
        yearSums.fill(0);
        for (let block = 0; block < blocks; block++) {
            const base = block * 7;
            if (shuffled) {
                for (let i = 6; i > 0; i--) {
                    const j = Math.floor(random() * (i + 1));
                    const swap = order[i];
                    order[i] = order[j];
                    order[j] = swap;
                }
            }
            for (let d = 0; d < 7; d++) {
                const day = days[base + d];
                const weekday = shuffled ? days[base + order[d]].weekday : day.weekday;
                sums[weekday] += day.edge;
                if (day.yearIndex >= 0) yearSums[weekday * yearCount + day.yearIndex] += day.edge;
            }
        }
        let high = -Infinity;
        let low = Infinity;
        let lopsided = 0;
        for (let weekday = 0; weekday < 7; weekday++) {
            const mean = sums[weekday] / blocks;
            if (mean > high) high = mean;
            if (mean < low) low = mean;
            let ahead = 0;
            let behind = 0;
            for (let y = 0; y < yearCount; y++) {
                const sum = yearSums[weekday * yearCount + y];
                if (sum > 0) ahead++;
                else if (sum < 0) behind++;
            }
            if (isLopsided(ahead, behind, yearCount)) lopsided++;
        }
        return { gap: high - low, lopsided };
    };

    const random = seededRandom(20150720);
    const real = tally(false, random);
    let gapAtLeast = 0;
    let lopsidedAtLeast = 0;
    for (let deal = 0; deal < deals; deal++) {
        const dealt = tally(true, random);
        if (dealt.gap >= real.gap) gapAtLeast++;
        if (dealt.lopsided >= real.lopsided) lopsidedAtLeast++;
    }
    return {
        deals,
        gapAtLeastPercent: (gapAtLeast / deals) * 100,
        lopsidedAtLeastPercent: real.lopsided > 0 ? (lopsidedAtLeast / deals) * 100 : null,
    };
}

/**
 * For every day from `fromTs` on, compare that day's close with the geometric
 * mean of the seven closes centred on it (three before, the day, three
 * after), then average by UTC weekday.
 *
 * The comparison is made on log prices so that a day with nothing special
 * about it scores zero. The more literal measure, what a dollar bought on the
 * day against the same dollar spread evenly over the week, does not: a fixed
 * amount spread over seven moving prices buys more than the same amount on the
 * middle day whatever the weekday, by about 2/7 of the daily variance. On the
 * 2015 to 2026 closes that is 0.035% of a purchase off every weekday, about a
 * seventh of the whole best-to-worst gap, and it tips the calendar-year count:
 * on that measure Monday comes out dearer than its week in eight years of
 * ten, on this one in five.
 *
 * Centring the week on the day is what keeps a rising market out of the
 * answer. Against a fixed Monday-to-Sunday week, Sunday is six days later than
 * Monday and so dearer by six days of whatever the price was drifting at;
 * centred, every weekday is compared with three days either side of itself.
 * Each centred week holds every weekday exactly once.
 *
 * `closes` must be one row per consecutive UTC day (StudyCloses guarantees
 * it). Days whose centred week reaches before `fromTs` or past the last close
 * are left out. Null when fewer than two years of weeks can be measured.
 */
export function weekdayAgainstItsWeek(closes: PricePair[], fromTs: number): WeekTest | null {
    const first = closes.findIndex(([ts]) => ts >= fromTs);
    if (first < 0) return null;
    const lo = first + 3;
    const hi = closes.length - 4;
    if (hi - lo + 1 < MIN_TEST_WEEKS * 7) return null;

    // A calendar year is counted only when every one of its days was measured.
    const firstDay = new Date(closes[lo][0]);
    const lastDay = new Date(closes[hi][0]);
    const firstYear = firstDay.getUTCFullYear() + (firstDay.getUTCMonth() === 0 && firstDay.getUTCDate() === 1 ? 0 : 1);
    const lastYear = lastDay.getUTCFullYear() - (lastDay.getUTCMonth() === 11 && lastDay.getUTCDate() === 31 ? 0 : 1);
    const yearCount = Math.max(0, lastYear - firstYear + 1);

    const days: MeasuredDay[] = [];
    for (let i = lo; i <= hi; i++) {
        let weekLog = 0;
        for (let j = -3; j <= 3; j++) weekLog += Math.log(closes[i + j][1]);
        weekLog /= 7;
        const day = new Date(closes[i][0]);
        const year = day.getUTCFullYear();
        days.push({
            weekday: day.getUTCDay(),
            yearIndex: year >= firstYear && year <= lastYear ? year - firstYear : -1,
            edge: (weekLog - Math.log(closes[i][1])) * 100,
        });
    }

    const rows: WeekdayEdge[] = WEEKDAY_NAMES.map((name, weekday) => {
        const own = days.filter((d) => d.weekday === weekday);
        const n = own.length;
        const mean = own.reduce((sum, d) => sum + d.edge, 0) / n;
        const variance = own.reduce((sum, d) => sum + (d.edge - mean) ** 2, 0) / (n - 1);
        let yearsAhead = 0;
        let yearsBehind = 0;
        for (let y = 0; y < yearCount; y++) {
            const sum = own.reduce((total, d) => (d.yearIndex === y ? total + d.edge : total), 0);
            if (sum > 0) yearsAhead++;
            else if (sum < 0) yearsBehind++;
        }
        return {
            weekday,
            name,
            weeks: n,
            edgePercent: mean,
            marginPercent: 2 * Math.sqrt(variance / n),
            yearsAhead,
            yearsBehind,
            yearsCounted: yearCount,
        };
    });

    const byEdge = [...rows].sort((a, b) => b.edgePercent - a.edgePercent);
    const best = byEdge[0];
    const worst = byEdge[byEdge.length - 1];

    return {
        fromTs: closes[lo][0],
        toTs: closes[hi][0],
        weeks: Math.min(...rows.map((row) => row.weeks)),
        rows,
        best,
        worst,
        gapPercent: best.edgePercent - worst.edgePercent,
        widestMarginPercent: Math.max(...rows.map((row) => row.marginPercent)),
        beyondMargin: rows.filter((row) => Math.abs(row.edgePercent) > row.marginPercent),
        lopsided: rows.filter((row) => isLopsided(row.yearsAhead, row.yearsBehind, yearCount)),
        years: yearCount > 0 ? { first: firstYear, last: lastYear, count: yearCount } : null,
        typicalDayPercent: median(days.map((d) => Math.abs(d.edge))),
        shuffle: shuffleWeekdays(days, yearCount),
    };
}

// ── The page's analysis ───────────────────────────────────────────────────────

export interface BestDayAnalysis {
    /** The seven plans from the first day of price data. */
    full: SevenPlans;
    /** What moving that start one day later does to the ranking; null when nothing moves. */
    fullOneDayLater: RankMove | null;
    /** The same table without the two September 2010 rows that look wrong; null when they are not in it. */
    fullWithoutSpike: WithoutSpike | null;
    /** The seven plans from the first exchange close; null when that is under six months ago. */
    exchange: SevenPlans | null;
    /** Each weekday against the week around it, on exchange closes only. */
    test: WeekTest;
    lastCloseTs: number;
    lastClose: number;
}

/** Everything the page publishes, from finished daily closes. Null when there is too little data. */
export function analyseBestDay(closes: PricePair[]): BestDayAnalysis | null {
    if (closes.length === 0) return null;
    const full = sevenPlans(closes[0][0], closes);
    const test = weekdayAgainstItsWeek(closes, FIRST_EXCHANGE_CLOSE_TS);
    if (!full || !test) return null;

    const shifted = sevenPlans(closes[0][0] + DAY_MS, closes);
    const last = closes[closes.length - 1];
    return {
        full,
        fullOneDayLater: shifted ? largestRankMove(full, shifted) : null,
        fullWithoutSpike: sevenPlansWithoutSpike(closes[0][0], closes),
        exchange: sevenPlans(FIRST_EXCHANGE_CLOSE_TS, closes),
        test,
        lastCloseTs: last[0],
        lastClose: last[1],
    };
}

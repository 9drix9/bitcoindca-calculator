import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import {
    computeShareResult,
    describeSharePlan,
    encodeShareQuery,
    formatSignedPercent,
    isApproximateFx,
    resolveShareParams,
    toCalculatorParams,
    type ResolvedShareParams,
    type ShareComputed,
    type ShareOutcome,
} from '@/app/share/shareData';
import { EARLIEST_PRICE_TS, formatUtc } from '@/utils/dates';
import { btcToSats } from '@/utils/units';
import type { UrlCurrency } from '@/utils/urlParams';
import type { ServerCurrencyConfig } from '@/utils/serverCurrency';
import { Logo } from '@/components/brand/Logo';

// Rendered per request: the whole widget is a function of its query string and
// of prices that move, so a static prerender would only ever produce the
// fallback card. That makes the HTML itself uncacheable (Next sends a dynamic
// page as `private, no-store`), so every view of a page that embeds the widget
// is one render here. What keeps that render cheap is underneath it: the price
// history, the live quote and the FX rates are cached server-side, and nothing
// is fetched from an exchange per view.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Bitcoin DCA Result',
    description: 'Embeddable Bitcoin dollar-cost-averaging result card.',
    // The widget is a fragment of another site's page — it must never rank on its own,
    // and it must not inherit the root layout's canonical.
    robots: { index: false, follow: false },
    alternates: { canonical: null },
};

const SITE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://btcdollarcostaverage.com').replace(/\/+$/, '');
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

// The numbers come from computeShareResult (app/share/shareData), the same run
// that draws the /share card and the OG image: the plan up to today, in the
// link's currency. This file only lays it out.

// ── Theme ──────────────────────────────────────────────────────────────────────

type EmbedTheme = 'light' | 'dark' | 'auto';
const THEMES: readonly string[] = ['light', 'dark', 'auto'];

function resolveTheme(raw: string | string[] | undefined): EmbedTheme {
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value && THEMES.includes(value) ? (value as EmbedTheme) : 'auto';
}

/**
 * The root layout's theme script reads localStorage, which third-party iframes are
 * often denied — that silently falls back to light. This one is authoritative for
 * the embed: explicit theme wins, `auto` follows the host device's color scheme.
 */
const themeScript = (theme: EmbedTheme) =>
    `(function(){try{var t=${JSON.stringify(theme)};` +
    `var d=t==='dark'||(t==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);` +
    `var c=document.documentElement.classList;if(d){c.add('dark');}else{c.remove('dark');}}catch(e){}})();`;

/**
 * Strips the site chrome the root layout renders around every route. Scoped to this
 * page only: the tag is part of the embed's JSX, so it unmounts with the route and
 * cannot leak into a client-side navigation to another page.
 */
const EMBED_CSS = `
body{padding:0!important;margin:0!important}
#main-content{padding:0!important}
footer,[data-site-overlay],[role="dialog"],a[href="#main-content"]{display:none!important}
`;

// ── Formatting ─────────────────────────────────────────────────────────────────

/**
 * Format a USD figure in the requested display currency. An amount of money
 * stops at cents. `price` keeps four decimals below one unit: a plan that ran
 * in 2010 has an average cost of a few cents per bitcoin, and rounding that to
 * the cent can move it by several percent.
 */
function fmtMoney(usd: number, currency: UrlCurrency, cfg: ServerCurrencyConfig, price = false): string {
    const converted = usd * cfg.rate;
    const abs = Math.abs(converted);
    const digits = currency === 'JPY' || abs >= 1000 ? 0 : abs >= 1 || (abs >= 0.01 && !price) ? 2 : 4;
    // Cents come in pairs: "$75.50", never "$75.5". A whole amount stays bare.
    const cents = digits === 2 && !Number.isInteger(Math.round(abs * 100) / 100) ? 2 : 0;
    return `${converted < 0 ? '-' : ''}${cfg.symbol}${abs.toLocaleString('en-US', { minimumFractionDigits: cents, maximumFractionDigits: digits })}`;
}

/** One decimal below 100%, none from there up: the badge is short on room. */
const fmtPct = (value: number): string => formatSignedPercent(value, Math.abs(value) >= 100 ? 0 : 1);

/** The figure only: the "BTC" beside it is laid out on its own (see Stat). */
function fmtBtc(btc: number): string {
    if (!Number.isFinite(btc) || btc <= 0) return '0';
    return btc.toLocaleString('en-US', { maximumFractionDigits: btc >= 1 ? 4 : 8 });
}

// btcToSats rounds, the same as the calculator's sats figures: 0.755 * 1e8 is
// 75499999.99999999 in floating point, and flooring printed 0.755 BTC as
// 75,499,999 sats.
const fmtSats = (btc: number): string => `${btcToSats(btc).toLocaleString('en-US')} sats`;

/**
 * "$50/week since Jul 2021 · 0.5% fee": the plan, then everything else that
 * shaped the number (an assumed price, a starting stack, a yearly raise, the
 * fees). A plan that ended in the past is an explicit range; "since" is only
 * used while the buying runs up to today.
 */
function scenarioLine(p: ResolvedShareParams, computed: ShareComputed): string {
    const plan = describeSharePlan(p, computed);
    const period = plan.running
        ? `since ${plan.since}`
        : plan.since === plan.until ? `in ${plan.since}` : `${plan.since} → ${plan.until}`;
    return [`${plan.cadence} ${period}`, ...plan.notes].join(' · ');
}

// ── Computation ────────────────────────────────────────────────────────────────

/** Timestamp of this render, resolved in the async data path so render stays pure. */
async function resolveRenderedAt(): Promise<number> {
    return Date.now();
}

/**
 * What the card says when there is no result to show. A problem with the link
 * itself is named as one: telling a publisher that prices are "temporarily
 * unavailable" for a start date in the future would have them wait for an
 * outage that is not happening.
 */
function fallbackCopy(outcome: Exclude<ShareOutcome, ShareComputed> | null): { title: string; body: string } {
    if (outcome?.status === 'not-started') {
        return {
            title: 'This schedule has not started yet',
            body: `Its first purchase is dated ${formatUtc(outcome.startTs, 'full')}. The card only counts purchases that have already happened.`,
        };
    }
    if (outcome?.status === 'invalid') {
        return {
            title: 'Nothing to calculate for these settings',
            body: `Check the link: the amount has to be above zero and above any flat fee, the start date on or before the end date, and manual mode needs a price. Price data begins on ${formatUtc(EARLIEST_PRICE_TS, 'full')}.`,
        };
    }
    return {
        title: 'Price data is temporarily unavailable',
        body: "We couldn't compute this result right now. Please try again in a few minutes.",
    };
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

const MICRO_LABEL = 'text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400';

function Brand({ href }: { href: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener"
            // 44px tall for a thumb. The negative margin gives the height
            // back, so the header row and the card stay the size they were;
            // `relative` keeps the part that reaches over the line below on
            // top of it, where a tap lands on the link.
            className="group relative -my-3 flex min-h-11 min-w-0 items-center gap-2"
        >
            {/* The Ð monogram, same as every other surface. This was the last
                ₿-in-a-disc left in the codebase, and it was on the one component
                that renders on OTHER people's sites — so the most brand-visible
                surface was the only one still showing the retired mark. */}
            <Logo className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="truncate text-sm font-semibold text-slate-800 transition-colors group-hover:text-amber-700 dark:text-slate-100 dark:group-hover:text-amber-400">
                Bitcoin DCA Calculator
            </span>
        </a>
    );
}

function Attribution({ href }: { href: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener"
            className="mt-auto flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2 transition-colors hover:border-amber-500/60 hover:bg-amber-100/70 dark:border-amber-500/25 dark:bg-amber-950/40 dark:hover:bg-amber-900/40"
        >
            <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                    Backtest your own Bitcoin DCA
                </span>
                <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{SITE_HOST}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        </a>
    );
}

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub: string }) {
    return (
        <div className="rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-slate-800/50">
            <p className={MICRO_LABEL}>{label}</p>
            {/* One line high, and wrapping. Where the frame is too narrow for
                the figure and its unit together, the unit wraps to a second
                line and is clipped away, and the figure stays whole. Cut off
                as one string, a phone-width embed (under about 324px) read
                "0.10749469 B…". The label above already names the unit, and
                it is still in the text for a screen reader. */}
            <p className="mt-0.5 flex h-5 flex-wrap gap-x-1 overflow-hidden text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                <span className="min-w-0 truncate">{value}</span>
                {unit && <span> {unit}</span>}
            </p>
            <p className="truncate text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{sub}</p>
        </div>
    );
}

/** The result itself: the plan up to today, in the link's currency. */
function ResultBody({ params, computed }: { params: ResolvedShareParams; computed: ShareComputed }) {
    const { result, cfg, purchaseCount } = computed;
    const isProfit = result.profit >= 0;
    // With constant FX rates the bitcoin a schedule bought and its average cost
    // are off by however far the rate has moved, while its value and return are
    // not (the rate cancels out of both). So these two are the figures marked;
    // the scenario line above them says which rate was used.
    const approx = isApproximateFx(params, cfg) ? '≈ ' : '';

    return (
        <>
            <div className="min-w-0">
                <p className={MICRO_LABEL}>{scenarioLine(params, computed)}</p>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">
                        {fmtMoney(result.currentValue, params.currency, cfg)}
                    </p>
                    <span
                        className={clsx(
                            'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                            isProfit
                                ? 'bg-emerald-500/10 text-gain'
                                : 'bg-rose-500/10 text-loss',
                        )}
                    >
                        {fmtPct(result.roi)}
                    </span>
                </div>
                <p className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">
                    <span className={clsx('font-semibold tabular-nums', isProfit ? 'text-gain' : 'text-loss')}>
                        {isProfit ? '+' : ''}{fmtMoney(result.profit, params.currency, cfg)}
                    </span>
                    {/* "so far": the plan runs past today and only the buys made to date are counted. */}
                    {' '}on {fmtMoney(result.totalInvested, params.currency, cfg)} invested{result.endsInFuture ? ' so far' : ''}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Stat
                    label="BTC stacked"
                    value={`${approx}${fmtBtc(result.btcAccumulated)}`}
                    unit="BTC"
                    sub={fmtSats(result.btcAccumulated)}
                />
                <Stat
                    label="Average cost"
                    value={`${approx}${fmtMoney(result.averageCost, params.currency, cfg, true)}`}
                    // Scheduled buys only: a starting stack adds a row to the
                    // breakdown but was never a purchase.
                    sub={`${purchaseCount.toLocaleString('en-US')} ${purchaseCount === 1 ? 'buy' : 'buys'}`}
                />
            </div>
        </>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface EmbedPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EmbedPage({ searchParams }: EmbedPageProps) {
    let raw: Record<string, string | string[] | undefined> = {};
    try {
        raw = await searchParams;
    } catch (error) {
        console.error('[embed] failed to read search params:', error);
    }

    const theme = resolveTheme(raw.theme);
    const renderedAt = await resolveRenderedAt();

    let params: ResolvedShareParams | null = null;
    let outcome: ShareOutcome | null = null;
    try {
        // One instant for "today", the default dates and the date printed on
        // the card, so the three cannot disagree across a UTC midnight.
        params = resolveShareParams(toCalculatorParams(raw), renderedAt);
        // Never throws: an embed must degrade to a small branded card, never to a 500.
        outcome = await computeShareResult(params, renderedAt);
    } catch (error) {
        console.error('[embed] render failed:', error);
        params = null;
        outcome = null;
    }

    const computed = outcome?.status === 'ok' ? outcome : null;
    const fallback = fallbackCopy(outcome && outcome.status !== 'ok' ? outcome : null);

    // The link keeps the plan as written, future end date included, so the
    // reader lands on the publisher's whole plan in the calculator.
    const ctaHref = params ? `${SITE_URL}/?${encodeShareQuery(params)}` : `${SITE_URL}/`;

    return (
        <div className={clsx(theme === 'dark' && 'dark')}>
            <style dangerouslySetInnerHTML={{ __html: EMBED_CSS }} />
            <script dangerouslySetInnerHTML={{ __html: themeScript(theme) }} />

            {/* The gutter and the gaps are sized so the card fits a 300px-tall
                frame with its plan line on two rows (293px). The guide's
                snippet is 300px tall, and a phone-width column wraps that
                line as soon as it names a second thing. */}
            <div className="flex min-h-[100svh] w-full bg-slate-50 p-1.5 dark:bg-slate-950">
                {/* Capped so an over-wide host iframe (or a direct visit) doesn't stretch the card */}
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

                    <div className="flex items-center justify-between gap-2">
                        <Brand href={ctaHref} />
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                            {formatUtc(renderedAt, 'full')}
                        </span>
                    </div>

                    {computed && params ? (
                        <ResultBody params={params} computed={computed} />
                    ) : (
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {fallback.title}
                            </p>
                            <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                                {fallback.body}
                            </p>
                        </div>
                    )}

                    <Attribution href={ctaHref} />
                </div>
            </div>
        </div>
    );
}

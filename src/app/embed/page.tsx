import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import {
    encodeShareQuery,
    resolveShareParams,
    toCalculatorParams,
    type ResolvedShareParams,
} from '@/app/share/shareData';
import { calculateDca } from '@/utils/dca';
import { DAY_MS, formatUtc, parseUtcDate } from '@/utils/dates';
import type { UrlCurrency } from '@/utils/urlParams';
import type { DcaResult, Frequency } from '@/types';
import { resolveServerCurrency, type ServerCurrencyConfig } from '@/utils/serverCurrency';

// Embeds are cheap, cacheable, identical for everyone with the same params.
// Rendered per request: the whole widget is a function of its query string, so a
// static prerender would only ever produce the fallback card. Upstream price data is
// still cached server-side, so this stays cheap.
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

// Currency config comes from utils/serverCurrency (live ECB rates, constants only
// as an outage fallback). The fixed table that used to live here had drifted ~18
// months, so non-USD embeds understated BTC stacked by up to 7.2%.

const FREQUENCY_LABEL: Record<Frequency, string> = {
    daily: '/day',
    weekly: '/week',
    biweekly: ' every 2 weeks',
    monthly: '/month',
};

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

/** Format a USD figure in the requested display currency. */
function fmtMoney(usd: number, currency: UrlCurrency, cfg: ServerCurrencyConfig): string {
    const converted = usd * cfg.rate;
    const abs = Math.abs(converted);
    const digits = currency === 'JPY' || abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
    return `${converted < 0 ? '-' : ''}${cfg.symbol}${abs.toLocaleString('en-US', { maximumFractionDigits: digits })}`;
}

/** Format an amount that is already denominated in the display currency. */
function fmtAmount(amount: number, cfg: ServerCurrencyConfig): string {
    return `${cfg.symbol}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function fmtPct(value: number): string {
    const digits = Math.abs(value) >= 100 ? 0 : 1;
    return `${value >= 0 ? '+' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: digits })}%`;
}

function fmtBtc(btc: number): string {
    if (!Number.isFinite(btc) || btc <= 0) return '0 BTC';
    const decimals = btc >= 1 ? 4 : 8;
    const text = btc.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return `${text} BTC`;
}

const fmtSats = (btc: number): string => `${Math.floor(btc * 1e8).toLocaleString('en-US')} sats`;

/** "$50/week since Jul 2021" — or an explicit range when the end date isn't today. */
function scenarioLine(p: ResolvedShareParams, cfg: ServerCurrencyConfig): string {
    const amount = fmtAmount(p.amount, cfg);
    const cadence = `${amount}${FREQUENCY_LABEL[p.frequency]}`;
    const startTs = parseUtcDate(p.startDate);
    const endTs = parseUtcDate(p.endDate);
    const todayIso = formatUtc(Date.now(), 'isoDay');
    const period = p.endDate >= todayIso
        ? `since ${formatUtc(startTs, 'monthYear')}`
        : `${formatUtc(startTs, 'monthYear')} → ${formatUtc(endTs, 'monthYear')}`;
    const fee = p.feePercentage > 0 ? ` · ${p.feePercentage}% fee` : '';
    return `${cadence} ${period}${fee}`;
}

// ── Computation ────────────────────────────────────────────────────────────────

/** Timestamp of this render, resolved in the async data path so render stays pure. */
async function resolveRenderedAt(): Promise<number> {
    return Date.now();
}

async function computeEmbed(p: ResolvedShareParams, cfg: ServerCurrencyConfig): Promise<DcaResult | null> {
    try {
        const startTs = parseUtcDate(p.startDate);
        const endTs = parseUtcDate(p.endDate);
        if (isNaN(startTs) || isNaN(endTs) || startTs > endTs) return null;
        if (p.priceMode === 'manual' && p.manualPrice <= 0) return null;

        let priceData: [number, number][] | undefined;
        let currentPrice: number | null = null;
        if (p.priceMode === 'api') {
            const [history, price] = await Promise.all([
                getBitcoinPriceHistory(startTs, endTs + DAY_MS, p.provider),
                getCurrentBitcoinPrice(p.provider).catch(() => null),
            ]);
            if (!history || history.length === 0) return null;
            priceData = history;
            currentPrice = price && price > 0 ? price : null;
        }

        const result = calculateDca(
            {
                amount: p.amount / cfg.rate,
                frequency: p.frequency,
                startDate: new Date(startTs),
                endDate: new Date(endTs),
                feePercentage: p.feePercentage,
                priceMode: p.priceMode,
                manualPrice: p.manualPrice,
            },
            priceData,
            p.priceMode === 'api' ? currentPrice : undefined,
        );

        if (
            !(result.totalInvested > 0) ||
            !(result.btcAccumulated > 0) ||
            !Number.isFinite(result.currentValue) ||
            !Number.isFinite(result.roi)
        ) {
            return null;
        }
        return result;
    } catch (error) {
        // An embed must degrade to a small branded card, never to a 500.
        console.error('[embed] computation failed:', error);
        return null;
    }
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

const MICRO_LABEL = 'text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400';

function Brand({ href }: { href: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener"
            className="group flex min-w-0 items-center gap-2"
        >
            <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[13px] font-bold text-slate-950"
            >
                &#8383;
            </span>
            <span className="truncate text-sm font-semibold text-slate-800 transition-colors group-hover:text-amber-600 dark:text-slate-100 dark:group-hover:text-amber-400">
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

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <div className="rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-slate-800/50">
            <p className={MICRO_LABEL}>{label}</p>
            <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{value}</p>
            <p className="truncate text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{sub}</p>
        </div>
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
    let result: DcaResult | null = null;
    // Resolved before the try so it is in scope for rendering too. Live ECB rate
    // where available; the constants in utils/serverCurrency are the fallback.
    let cfg: ServerCurrencyConfig = { symbol: '$', rate: 1, live: true };
    try {
        params = resolveShareParams(toCalculatorParams(raw));
        cfg = await resolveServerCurrency(params.currency);
        result = await computeEmbed(params, cfg);
    } catch (error) {
        console.error('[embed] render failed:', error);
        params = null;
        result = null;
    }

    const ctaHref = params ? `${SITE_URL}/?${encodeShareQuery(params)}` : `${SITE_URL}/`;
    const isProfit = !!result && result.profit >= 0;
    const toneClass = isProfit
        ? 'text-gain'
        : 'text-loss';

    return (
        <div className={clsx(theme === 'dark' && 'dark')}>
            <style dangerouslySetInnerHTML={{ __html: EMBED_CSS }} />
            <script dangerouslySetInnerHTML={{ __html: themeScript(theme) }} />

            <div className="flex min-h-[100svh] w-full bg-slate-50 p-2 dark:bg-slate-950">
                {/* Capped so an over-wide host iframe (or a direct visit) doesn't stretch the card */}
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">

                    <div className="flex items-center justify-between gap-2">
                        <Brand href={ctaHref} />
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                            {formatUtc(renderedAt, 'full')}
                        </span>
                    </div>

                    {result && params ? (
                        <>
                            <div className="min-w-0">
                                <p className={MICRO_LABEL}>{scenarioLine(params, cfg)}</p>
                                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                                    <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
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
                                    <span className={clsx('font-semibold tabular-nums', toneClass)}>
                                        {isProfit ? '+' : ''}{fmtMoney(result.profit, params.currency, cfg)}
                                    </span>
                                    {' '}on {fmtMoney(result.totalInvested, params.currency, cfg)} invested
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <Stat
                                    label="BTC stacked"
                                    value={fmtBtc(result.btcAccumulated)}
                                    sub={fmtSats(result.btcAccumulated)}
                                />
                                <Stat
                                    label="Average cost"
                                    value={fmtMoney(result.averageCost, params.currency, cfg)}
                                    sub={`${result.breakdown.length} buys`}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                Price data is temporarily unavailable
                            </p>
                            <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                                This result could not be computed right now. The live calculator can run the same
                                schedule against multiple price sources.
                            </p>
                        </div>
                    )}

                    <Attribution href={ctaHref} />
                </div>
            </div>
        </div>
    );
}

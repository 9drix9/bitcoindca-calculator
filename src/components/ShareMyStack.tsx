'use client';

import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { Download, Zap, Twitter, Link2, Check } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { parseUtcDate, formatUtc, DAY_MS } from '@/utils/dates';
import { encodeParams } from '@/utils/urlParams';
import { getCostBasisPercentile } from '@/app/actions';
import type { Frequency, PriceMode } from '@/types';
import { Logo } from '@/components/brand/Logo';

interface ShareMyStackProps {
    totalInvested: number;
    currentValue: number;
    roi: number;
    btcAccumulated: number;
    unit: 'BTC' | 'SATS';
    startDate: string;
    /** Display window end — capped at today by the caller for future-dated
     *  plans, so every figure on the card describes coins actually bought. */
    endDate: string;
    /** The plan's real end date, used ONLY in share URLs so recipients get the
     *  full plan (including its future leg) even though the card shows history. */
    planEndDate?: string;
    /** Schedule inputs, in the user's display currency. Supplied so shared links can
     *  point at /share, which renders a result-specific social preview card. */
    amount?: number;
    frequency?: Frequency;
    feePercentage?: number;
    /** Pricing inputs — without them a Manual-mode share silently encoded
     *  api/kraken, and the recipient saw different numbers than the card. */
    priceMode?: PriceMode;
    provider?: 'kraken' | 'coinbase';
    manualPrice?: number;
    /** Starting stack / escalation plan inputs — passed through to the share
     *  link so recipients reconstruct the same plan. encodeParams only emits
     *  them when > 0, keeping pre-existing links byte-identical. */
    startingBtc?: number;
    startingAvgCost?: number;
    annualEscalationPct?: number;
    /** Extra receipt line items (all figures in USD, like the core props).
     *  Optional — the rows are simply omitted until the calculator passes them. */
    purchaseCount?: number;
    bestBuy?: { date: string; price: number } | null;
    maxDrawdownPercent?: number | null;
}

const SITE_URL = 'https://btcdollarcostaverage.com';

// Primal accepts a prefilled compose URL; every other "nostr intent" scheme
// (web+nostr:, njump, client-specific note composers) needs a handler the
// average visitor has never registered, so the note is always put on the
// clipboard too — that path works with any Nostr client.
const PRIMAL_COMPOSE = 'https://primal.net/new?content=';
const X_INTENT = 'https://twitter.com/intent/tweet';

const STATUS_MS = 3000;

type StatusSource = 'nostr' | 'x' | 'link';
interface ShareStatus {
    text: string;
    ok: boolean;
    source: StatusSource;
}

type ExportVariant = 'card' | 'receipt';

// Secondary action styling (DESIGN_SPEC §1) — the amber primary stays on "Download PNG".
// min-h-9 keeps every tap target comfortably past the 24px minimum.
const shareButtonClass =
    'inline-flex items-center gap-1.5 min-h-9 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg ' +
    'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ' +
    'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 ' +
    'hover:border-slate-300 dark:hover:border-slate-600 transition-colors';

const FREQUENCY_LABEL: Record<Frequency, string> = {
    daily: 'daily',
    weekly: 'weekly',
    biweekly: 'every 2 weeks',
    monthly: 'monthly',
};

const formatCardDate = (value: string): string => {
    const ts = parseUtcDate(value);
    return Number.isFinite(ts) ? formatUtc(ts, 'full') : value;
};

/** "Jul 2021" — month/year is enough context for a social post. */
const monthYear = (value: string): string | null => {
    const ts = parseUtcDate(value);
    return Number.isFinite(ts) ? formatUtc(ts, 'monthYear') : null;
};

/** Resolves false when the Clipboard API is missing (non-secure context) or denied. */
const copyToClipboard = async (text: string): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};

/** Returns false when the pop-up was blocked. Severs `opener` without the
 *  'noopener' feature string, which makes window.open return null even on success. */
const openTab = (url: string): boolean => {
    const win = window.open(url, '_blank');
    if (!win) return false;
    win.opener = null;
    return true;
};

/** One line item on the receipt export. */
const ReceiptRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline justify-between gap-3 text-xs leading-relaxed">
        <span className="uppercase tracking-wide text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
        <span className="font-semibold tabular-nums text-right text-slate-800 dark:text-slate-100">{value}</span>
    </div>
);

/** Dashed tear-line separator. */
const ReceiptRule = () => (
    <div className="my-3.5 border-t border-dashed border-slate-300 dark:border-slate-600" aria-hidden="true" />
);

export const ShareMyStack = ({
    totalInvested,
    currentValue,
    roi,
    btcAccumulated,
    unit,
    startDate,
    endDate,
    planEndDate,
    amount,
    frequency,
    feePercentage,
    priceMode,
    provider,
    manualPrice,
    startingBtc,
    startingAvgCost,
    annualEscalationPct,
    purchaseCount,
    bestBuy,
    maxDrawdownPercent,
}: ShareMyStackProps) => {
    const { formatCurrency, formatBtc, formatSats, currencyConfig } = useCurrency();
    const cardRef = useRef<HTMLDivElement>(null);
    const receiptRef = useRef<HTMLDivElement>(null);
    const [downloading, setDownloading] = useState(false);
    const [exportVariant, setExportVariant] = useState<ExportVariant>('card');
    const [status, setStatus] = useState<ShareStatus | null>(null);
    const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    }, []);

    const showStatus = useCallback((source: StatusSource, text: string, ok: boolean) => {
        if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
        setStatus({ source, text, ok });
        statusTimerRef.current = setTimeout(() => setStatus(null), STATUS_MS);
    }, []);

    const profit = currentValue - totalInvested;
    const isProfit = profit >= 0;

    const formattedBtc = unit === 'SATS' ? formatSats(btcAccumulated) : formatBtc(btcAccumulated);

    // ── Cost-basis percentile ──────────────────────────────────────────────────
    // "Average cost beats N% of all possible start dates for this schedule."
    // Debounced like DcaCalculator's ProfitableWindows and cancelled on unmount;
    // degrades silently to nothing. Skipped whenever the comparison would not be
    // like-for-like: manual mode prices every buy at a fixed made-up price, and
    // a starting stack or annual escalation makes the average cost more than the
    // flat fee-free schedule the historical windows simulate.
    const [costBasis, setCostBasis] = useState<{ percentile: number; windowCount: number } | null>(null);

    useEffect(() => {
        // Reset immediately so a stale percentile never lingers on the card
        // while new inputs are still being fetched.
        setCostBasis(null);
        if (!frequency || priceMode !== 'api' || totalInvested <= 0 || btcAccumulated <= 0) return;
        if ((startingBtc ?? 0) > 0 || (annualEscalationPct ?? 0) > 0) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            const startTs = parseUtcDate(startDate);
            const endTs = Math.min(parseUtcDate(endDate), Date.now());
            const durationDays = Math.round((endTs - startTs) / DAY_MS);
            if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || durationDays < 90) return;
            // Fees are stripped before comparing: the historical windows are
            // fee-free, and the line is about start-date luck, not fees — the
            // rendered text says "before fees" for exactly this reason.
            const clampedFee = Math.min(100, Math.max(0, feePercentage ?? 0));
            const averageCostUsd = (totalInvested / btcAccumulated) * (1 - clampedFee / 100);
            if (!Number.isFinite(averageCostUsd) || averageCostUsd <= 0) return;
            try {
                const result = await getCostBasisPercentile(frequency, durationDays, averageCostUsd);
                if (!cancelled) setCostBasis(result);
            } catch {
                if (!cancelled) setCostBasis(null);
            }
        }, 800);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [frequency, priceMode, startDate, endDate, totalInvested, btcAccumulated, feePercentage, startingBtc, annualEscalationPct]);

    // Floored, never rounded: 99.6% must claim "beats 99%", not a false 100%.
    const costBasisPct = costBasis ? Math.floor(costBasis.percentile) : null;

    // Plain-language summary, no hype and no emoji (DESIGN_SPEC §6). Every figure
    // runs through the currency formatters so non-USD users share their own symbols.
    const noteText = useMemo(() => {
        const from = monthYear(startDate);
        const to = monthYear(endDate);
        const range = !from || !to
            ? 'Bitcoin DCA'
            : from === to
                ? `Bitcoin DCA in ${from}`
                : `Bitcoin DCA from ${from} to ${to}`;
        const roiText = `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`;
        const base = `${range}: ${formatCurrency(totalInvested)} invested, now worth ${formatCurrency(currentValue)} (${roiText}). ${formattedBtc} stacked.`;
        return costBasisPct !== null
            ? `${base} Average cost beats ${costBasisPct}% of all possible start dates for this schedule.`
            : base;
    }, [startDate, endDate, roi, totalInvested, currentValue, formatCurrency, formattedBtc, costBasisPct]);

    const buildShareUrl = useCallback(() => {
        const origin = typeof window === 'undefined' ? SITE_URL : window.location.origin;
        // /share renders a preview card built from these exact params. Only use it
        // when the full plan is known — a partial set would render a wrong card.
        // priceMode/provider/manualPrice are part of that plan: hardcoding
        // api/kraken here sent Manual-mode recipients to different numbers than
        // the card they were shown.
        if (amount !== undefined && frequency !== undefined && feePercentage !== undefined && priceMode !== undefined && provider !== undefined) {
            const params = encodeParams({
                amount,
                frequency,
                startDate,
                endDate: planEndDate ?? endDate,
                feePercentage,
                priceMode,
                provider,
                manualPrice: manualPrice ?? 0,
                currency: currencyConfig.code,
                startingBtc,
                startingAvgCost,
                annualEscalationPct,
            });
            return `${origin}/share?${params}`;
        }
        return typeof window === 'undefined' ? SITE_URL : window.location.href;
    }, [amount, frequency, feePercentage, priceMode, provider, manualPrice, startDate, endDate, planEndDate, currencyConfig.code, startingBtc, startingAvgCost, annualEscalationPct]);

    const handleNostr = useCallback(async () => {
        const url = buildShareUrl();
        const note = `${noteText}\n\n${url}`;
        // Open first: awaiting the clipboard before window.open costs the user
        // gesture in some browsers and gets the tab blocked.
        const opened = openTab(`${PRIMAL_COMPOSE}${encodeURIComponent(note)}`);
        const copied = await copyToClipboard(note);
        if (copied) {
            showStatus('nostr', opened ? 'Note copied and opened in Primal.' : 'Note copied. Paste it into your Nostr client.', true);
        } else {
            showStatus(
                'nostr',
                opened
                    ? 'Opened in Primal. Clipboard unavailable, so the note was not copied.'
                    : 'Pop-up blocked and clipboard unavailable. Allow pop-ups to post to Nostr.',
                opened,
            );
        }
    }, [buildShareUrl, noteText, showStatus]);

    const handleX = useCallback(() => {
        const url = buildShareUrl();
        const intent = `${X_INTENT}?text=${encodeURIComponent(noteText)}&url=${encodeURIComponent(url)}`;
        if (openTab(intent)) {
            showStatus('x', 'Opened a post on X.', true);
        } else {
            showStatus('x', 'Pop-up blocked. Allow pop-ups to share on X.', false);
        }
    }, [buildShareUrl, noteText, showStatus]);

    const handleCopyLink = useCallback(async () => {
        const copied = await copyToClipboard(buildShareUrl());
        showStatus(
            'link',
            copied ? 'Link copied to clipboard.' : 'Clipboard unavailable. Copy the link from your address bar.',
            copied,
        );
    }, [buildShareUrl, showStatus]);

    const linkCopied = status?.source === 'link' && status.ok;

    const handleDownload = useCallback(async () => {
        const node = exportVariant === 'receipt' ? receiptRef.current : cardRef.current;
        if (!node || downloading) return;
        setDownloading(true);
        try {
            const { toPng } = await import('html-to-image');
            const isDark = document.documentElement.classList.contains('dark');
            const dataUrl = await toPng(node, {
                // The receipt is story-sized: 360×640 CSS at 3x = 1080×1920.
                pixelRatio: exportVariant === 'receipt' ? 3 : 2,
                skipFonts: true,
                // Fill the rounded corners with the page surface so pasted PNGs
                // never show transparent/black notches; follows the active theme.
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
            });
            const link = document.createElement('a');
            link.download = `my-btc-${exportVariant === 'receipt' ? 'receipt' : 'stack'}-${new Date().toISOString().split('T')[0]}.png`;
            link.href = dataUrl;
            link.click();
        } catch {
            // Share card export failed silently
        } finally {
            setDownloading(false);
        }
    }, [downloading, exportVariant]);

    if (totalInvested <= 0) return null;

    // Same formula as calculateDca: totalInvested / totalBtc (both props are USD).
    const averageCost = btcAccumulated > 0 ? totalInvested / btcAccumulated : 0;
    // `amount` is in the display currency; formatCurrency expects USD.
    const amountUsd = amount !== undefined && currencyConfig.rate > 0 ? amount / currencyConfig.rate : undefined;
    const planLabel = amountUsd !== undefined && frequency !== undefined
        ? `${formatCurrency(amountUsd, 2)} ${FREQUENCY_LABEL[frequency]}`
        : null;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100">Share My Stack</h3>
                <div className="flex items-center gap-2">
                    {/* Card stays the default; the receipt is opt-in. */}
                    <div
                        role="group"
                        aria-label="Image format"
                        className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
                    >
                        {(['card', 'receipt'] as const).map((variant) => (
                            <button
                                key={variant}
                                type="button"
                                onClick={() => setExportVariant(variant)}
                                aria-pressed={exportVariant === variant}
                                className={`min-h-9 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                    exportVariant === variant
                                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                }`}
                            >
                                {variant === 'card' ? 'Card' : 'Receipt'}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="inline-flex items-center gap-1.5 min-h-9 shrink-0 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        {downloading ? 'Generating...' : 'Download PNG'}
                    </button>
                </div>
            </div>

            {/* Fixed widths (card 440px, receipt 360px) so every exported PNG is
                identical; the actions sit beside it on wide screens so the row
                doesn't end in dead space. */}
            <div className="grid items-start gap-4 lg:grid-cols-[440px_minmax(0,1fr)]">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                {exportVariant === 'card' ? (
                <div
                    ref={cardRef}
                    className="rounded-2xl border border-amber-500/30 dark:border-amber-500/25 bg-gradient-to-br from-amber-50 to-white dark:from-amber-500/[0.07] dark:to-slate-900 text-slate-900 dark:text-white font-sans"
                    style={{ width: 440, minWidth: 440, padding: 28 }}
                >
                    {/* Header */}
                    <div className="flex items-center gap-2.5 mb-6">
                        <Logo className="w-8 h-8 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="text-base font-bold text-slate-900 dark:text-white">
                            My Bitcoin Stack
                        </span>
                    </div>

                    {/* Hero stat */}
                    <div className="mb-5">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Current Value</div>
                        <div className="flex items-baseline gap-2.5">
                            <span className="text-3xl font-bold text-amber-700 dark:text-amber-400">
                                {formatCurrency(currentValue)}
                            </span>
                            <span className={`text-sm font-semibold px-2 py-0.5 rounded-full tabular-nums ${
                                isProfit
                                    ? 'bg-emerald-500/10 text-gain'
                                    : 'bg-rose-500/10 text-loss'
                            }`}>
                                {isProfit ? '+' : ''}{roi.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    {/* Supporting rows */}
                    <div className="space-y-2 mb-5">
                        <div className="flex items-baseline justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Total Invested</span>
                            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(totalInvested)}</span>
                        </div>
                        <div className="flex items-baseline justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">{isProfit ? 'Profit' : 'Loss'}</span>
                            <span className={`font-semibold tabular-nums ${isProfit ? 'text-gain' : 'text-loss'}`}>
                                {isProfit ? '+' : ''}{formatCurrency(profit)}
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Accumulated</span>
                            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formattedBtc}</span>
                        </div>
                    </div>

                    {costBasis && costBasisPct !== null && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3.5 fade-in">
                            Average cost beats <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{costBasisPct}%</span> of
                            all possible start dates for this schedule · {costBasis.windowCount.toLocaleString('en-US')} windows since 2010, before fees
                        </div>
                    )}

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3.5 tabular-nums">
                        {formatCardDate(startDate)} &mdash; {formatCardDate(endDate)}
                    </div>

                    <div className="border-t border-amber-500/20 dark:border-slate-700 pt-2.5 flex justify-between items-center">
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">btcdollarcostaverage.com</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">@9drix9</span>
                    </div>
                </div>
                ) : (
                <div
                    ref={receiptRef}
                    className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono flex flex-col"
                    // minHeight rather than height: 640px is the story-format target
                    // (1080×1920 at 3x), but long figures must grow the page, never
                    // be clipped out of an exported image.
                    style={{ width: 360, minWidth: 360, minHeight: 640, padding: 24 }}
                >
                    {/* Header */}
                    <div className="flex flex-col items-center gap-1 text-center">
                        <Logo className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                        <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-900 dark:text-white">Bitcoin DCA</span>
                        <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Stack receipt</span>
                    </div>

                    <ReceiptRule />

                    {/* Plan */}
                    <div className="space-y-1.5">
                        {planLabel && <ReceiptRow label="Plan" value={planLabel} />}
                        <ReceiptRow label="From" value={formatCardDate(startDate)} />
                        <ReceiptRow label="To" value={formatCardDate(endDate)} />
                        {purchaseCount !== undefined && purchaseCount > 0 && (
                            <ReceiptRow label="Purchases" value={purchaseCount.toLocaleString('en-US')} />
                        )}
                    </div>

                    <ReceiptRule />

                    {/* Line items */}
                    <div className="space-y-1.5">
                        <ReceiptRow label="Invested" value={formatCurrency(totalInvested)} />
                        <ReceiptRow label="BTC stacked" value={formattedBtc} />
                        {averageCost > 0 && <ReceiptRow label="Avg cost" value={`${formatCurrency(averageCost)}/BTC`} />}
                        {bestBuy && (
                            <ReceiptRow label="Best buy" value={`${formatCurrency(bestBuy.price)} · ${formatUtc(bestBuy.date, 'full')}`} />
                        )}
                        {maxDrawdownPercent != null && (
                            <ReceiptRow
                                label="Max drawdown"
                                value={maxDrawdownPercent > 0 ? `-${maxDrawdownPercent.toFixed(1)}%` : '0%'}
                            />
                        )}
                    </div>

                    <ReceiptRule />

                    {/* Total */}
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Worth today</span>
                        <span className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(currentValue)}</span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-xs">
                        <span className="uppercase tracking-wide text-slate-500 dark:text-slate-400">{isProfit ? 'Profit' : 'Loss'}</span>
                        <span className={`font-bold tabular-nums ${isProfit ? 'text-gain' : 'text-loss'}`}>
                            {isProfit ? '+' : ''}{formatCurrency(profit)} ({isProfit ? '+' : ''}{roi.toFixed(1)}%)
                        </span>
                    </div>

                    {costBasis && costBasisPct !== null && (
                        <p className="mt-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                            Average cost beats {costBasisPct}% of all possible start dates for this
                            schedule · {costBasis.windowCount.toLocaleString('en-US')} windows since 2010, before fees
                        </p>
                    )}

                    <div className="flex-1" />

                    <ReceiptRule />

                    {/* Footer */}
                    <div className="flex flex-col items-center gap-1 text-center">
                        <Logo compact className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">btcdollarcostaverage.com</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {/* In manual mode every buy is priced at the entered price —
                                claiming "real market data" there would be a lie. */}
                            {priceMode === 'manual' ? 'manual price' : 'real market data'} · not financial advice
                        </span>
                    </div>
                </div>
                )}
            </div>

            {/* Share actions — outside cardRef/receiptRef so they never land in the PNG export */}
            <div className="space-y-3 lg:pt-1">
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Download the card or the story-sized receipt as an image, or post your result straight
                    to Nostr or X. The link carries your settings, so anyone who opens it lands on these
                    exact numbers.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={handleNostr}
                    className={shareButtonClass}
                    title="Copy the note and open a Primal compose window"
                    aria-label="Share on Nostr: copies the note and opens Primal in a new tab"
                >
                    <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                    Share on Nostr
                </button>
                <button
                    type="button"
                    onClick={handleX}
                    className={shareButtonClass}
                    title="Open a prefilled post on X"
                    aria-label="Share on X: opens a prefilled post in a new tab"
                >
                    <Twitter className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    Share on X
                </button>
                <button
                    type="button"
                    onClick={handleCopyLink}
                    className={shareButtonClass}
                    title="Copy a link to this page"
                    aria-label="Copy link to this page"
                >
                    {linkCopied
                        ? <Check className="w-3.5 h-3.5 text-gain shrink-0" aria-hidden="true" />
                        : <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                    Copy link
                </button>
                </div>

                <div role="status" aria-live="polite">
                    {status && (
                        <p className={`text-xs sm:text-sm fade-in ${status.ok ? 'text-gain' : 'text-slate-500 dark:text-slate-400'}`}>
                            {status.text}
                        </p>
                    )}
                </div>
            </div>
            </div>
        </div>
    );
};

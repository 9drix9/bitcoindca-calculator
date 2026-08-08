'use client';

import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { Download, Zap, Twitter, Link2, Check } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { parseUtcDate, formatUtc } from '@/utils/dates';
import { encodeParams } from '@/utils/urlParams';
import type { Frequency } from '@/types';

interface ShareMyStackProps {
    totalInvested: number;
    currentValue: number;
    roi: number;
    btcAccumulated: number;
    unit: 'BTC' | 'SATS';
    startDate: string;
    endDate: string;
    /** Schedule inputs, in the user's display currency. Supplied so shared links can
     *  point at /share, which renders a result-specific social preview card. */
    amount?: number;
    frequency?: Frequency;
    feePercentage?: number;
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

// Secondary action styling (DESIGN_SPEC §1) — the amber primary stays on "Download PNG".
// min-h-9 keeps every tap target comfortably past the 24px minimum.
const shareButtonClass =
    'inline-flex items-center gap-1.5 min-h-9 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg ' +
    'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ' +
    'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 ' +
    'hover:border-slate-300 dark:hover:border-slate-600 transition-colors';

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

export const ShareMyStack = ({
    totalInvested,
    currentValue,
    roi,
    btcAccumulated,
    unit,
    startDate,
    endDate,
    amount,
    frequency,
    feePercentage,
}: ShareMyStackProps) => {
    const { formatCurrency, formatBtc, formatSats, currencyConfig } = useCurrency();
    const cardRef = useRef<HTMLDivElement>(null);
    const [downloading, setDownloading] = useState(false);
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
        return `${range}: ${formatCurrency(totalInvested)} invested, now worth ${formatCurrency(currentValue)} (${roiText}). ${formattedBtc} stacked.`;
    }, [startDate, endDate, roi, totalInvested, currentValue, formatCurrency, formattedBtc]);

    const buildShareUrl = useCallback(() => {
        const origin = typeof window === 'undefined' ? SITE_URL : window.location.origin;
        // /share renders a preview card built from these exact params. Only use it when
        // the full schedule is known — a partial set would render a wrong card.
        if (amount !== undefined && frequency !== undefined && feePercentage !== undefined) {
            const params = encodeParams({
                amount,
                frequency,
                startDate,
                endDate,
                feePercentage,
                priceMode: 'api',
                provider: 'kraken',
                manualPrice: 0,
                currency: currencyConfig.code,
            });
            return `${origin}/share?${params}`;
        }
        return typeof window === 'undefined' ? SITE_URL : window.location.href;
    }, [amount, frequency, feePercentage, startDate, endDate, currencyConfig.code]);

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
        if (!cardRef.current || downloading) return;
        setDownloading(true);
        try {
            const { toPng } = await import('html-to-image');
            const isDark = document.documentElement.classList.contains('dark');
            const dataUrl = await toPng(cardRef.current, {
                pixelRatio: 2,
                skipFonts: true,
                // Fill the rounded corners with the page surface so pasted PNGs
                // never show transparent/black notches; follows the active theme.
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
            });
            const link = document.createElement('a');
            link.download = `my-btc-stack-${new Date().toISOString().split('T')[0]}.png`;
            link.href = dataUrl;
            link.click();
        } catch {
            // Share card export failed silently
        } finally {
            setDownloading(false);
        }
    }, [downloading]);

    if (totalInvested <= 0) return null;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100">Share My Stack</h3>
                <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="inline-flex items-center gap-1.5 min-h-9 shrink-0 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 transition-colors"
                >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    {downloading ? 'Generating...' : 'Download PNG'}
                </button>
            </div>

            {/* Card keeps a fixed 440px width so every exported PNG is identical; the
                actions sit beside it on wide screens so the row doesn't end in dead space. */}
            <div className="grid items-start gap-4 lg:grid-cols-[440px_minmax(0,1fr)]">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div
                    ref={cardRef}
                    className="rounded-2xl border border-amber-500/30 dark:border-amber-500/25 bg-gradient-to-br from-amber-50 to-white dark:from-amber-500/[0.07] dark:to-slate-900 text-slate-900 dark:text-white font-sans"
                    style={{ width: 440, minWidth: 440, padding: 28 }}
                >
                    {/* Header */}
                    <div className="flex items-center gap-2.5 mb-6">
                        <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-lg font-bold text-slate-950" aria-hidden="true">
                            &#8383;
                        </div>
                        <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                            My Bitcoin Stack
                        </span>
                    </div>

                    {/* Hero stat */}
                    <div className="mb-5">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Current Value</div>
                        <div className="flex items-baseline gap-2.5">
                            <span className="text-3xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
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

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3.5 tabular-nums">
                        {formatCardDate(startDate)} &mdash; {formatCardDate(endDate)}
                    </div>

                    <div className="border-t border-amber-500/20 dark:border-slate-700 pt-2.5 flex justify-between items-center">
                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">btcdollarcostaverage.com</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">@9drix9</span>
                    </div>
                </div>
            </div>

            {/* Share actions — outside cardRef so they never land in the PNG export */}
            <div className="space-y-3 lg:pt-1">
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Download the card as an image, or post your result straight to Nostr or X. The link
                    carries your settings, so anyone who opens it lands on these exact numbers.
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

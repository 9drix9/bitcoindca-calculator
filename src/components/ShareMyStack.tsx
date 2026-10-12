'use client';

import { useRef, useCallback, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { Download, Zap, Twitter, Link2, Check } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { parseUtcDate, formatUtc, clampToTodayUtc, utcIsoToday, DAY_MS } from '@/utils/dates';
import { encodeParams } from '@/utils/urlParams';
import { getCostBasisPercentile } from '@/app/actions';
import { fullPostText, xPostText } from '@/app/share/postText';
import type { PriceProvider } from '@/data/priceSources';
import type { DcaStats, Frequency, PriceMode } from '@/types';
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
    /** Fixed fee per buy, in the user's display currency like `amount`. */
    flatFee?: number;
    /** Pricing inputs — without them a Manual-mode share silently encoded
     *  api/kraken, and the recipient saw different numbers than the card. */
    priceMode?: PriceMode;
    provider?: PriceProvider;
    manualPrice?: number;
    /** Starting stack / escalation plan inputs — passed through to the share
     *  link so recipients reconstruct the same plan. encodeParams only emits
     *  them when > 0, keeping pre-existing links byte-identical. */
    startingBtc?: number;
    startingAvgCost?: number;
    annualEscalationPct?: number;
    /** Extra receipt line items (all figures in USD, like the core props).
     *  Optional: a row is left out when its prop is. `purchaseCount` is the
     *  scheduled buys made so far, like every other figure on the card, not
     *  the number the whole plan will make. */
    purchaseCount?: number;
    bestBuy?: DcaStats['bestBuy'];
    maxDrawdownPercent?: number | null;
    /** How much of the result rests on estimated prices instead of recorded
     *  closes (the engine's own count). In practice that is a plan priced on
     *  Kraken's series, where the days between two weekly closes are filled in
     *  along a straight line. Left out, nothing is marked as an estimate. */
    estimatedPrices?: DcaStats['estimatedPrices'] | null;
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
// min-h-11 is the site's 44px touch-target floor. It has to be spelled out on
// every control here: a min-h utility overrides the 44px base rule for buttons
// in globals.css, and the min-h-9 these used to carry made all six 36px tall.
const shareButtonClass =
    'inline-flex items-center gap-1.5 min-h-11 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg ' +
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

/** "0.5%" from 0.5: a percentage the user typed, without float noise. */
const plainPercent = (value: number): string => `${value.toLocaleString('en-US', { maximumFractionDigits: 3 })}%`;

/** "+94.4%", "-6.1%", "+2,677.8%". Grouped like the /share card's return: a
 *  plan started early enough runs to four figures, and the image leaves the
 *  page where "+2677.8%" has to be read cold. Rounded by toFixed, as the
 *  calculator's own headline is, so the two never differ in the last digit;
 *  only the whole part goes through the grouping. */
const signedReturn = (value: number): string => {
    const [whole, tenth] = Math.abs(value).toFixed(1).split('.');
    return `${value < 0 ? '-' : '+'}${Number(whole).toLocaleString('en-US')}.${tenth}%`;
};

const EXPORT_FAILED = 'Could not create the image. Try again, or use Copy link to share this result.';

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
    flatFee,
    priceMode,
    provider,
    manualPrice,
    startingBtc,
    startingAvgCost,
    annualEscalationPct,
    purchaseCount,
    bestBuy,
    maxDrawdownPercent,
    estimatedPrices,
}: ShareMyStackProps) => {
    const { formatCurrency, formatBtc, formatSats, currencyConfig, ratesLive, ratesAsOf } = useCurrency();
    const cardRef = useRef<HTMLDivElement>(null);
    const receiptRef = useRef<HTMLDivElement>(null);
    const [downloading, setDownloading] = useState(false);
    const [exportVariant, setExportVariant] = useState<ExportVariant>('card');
    // Shown beside the Download button until the next attempt. Not routed
    // through the timed status line below: on a phone that line sits a full
    // screen under the button, and three seconds is gone before it is found.
    const [exportError, setExportError] = useState<string | null>(null);
    const [status, setStatus] = useState<ShareStatus | null>(null);
    const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    }, []);

    // ── Preview fit ────────────────────────────────────────────────────────────
    // The card and the receipt are laid out at a fixed width (440px and 360px)
    // so every exported PNG is identical. A phone is narrower than either, and
    // the preview used to run off the right edge of the screen, figures first:
    // "Total Invested  $13". So on a narrow screen the preview is scaled down
    // to the width there is.
    //
    // The scale goes on a wrapper, never on the exported node. html-to-image
    // works from that node's own styles and layout size, neither of which an
    // ancestor's transform changes, so the PNG is the same file at any width.
    const previewFrameRef = useRef<HTMLDivElement>(null);
    const [previewFit, setPreviewFit] = useState<{ scale: number; height: number } | null>(null);
    const hasResult = totalInvested > 0;

    // A layout effect, so the fit is in place before the first paint. An
    // ordinary effect runs after it: the card would be drawn cut off, then shrink.
    useLayoutEffect(() => {
        const frame = previewFrameRef.current;
        const node = exportVariant === 'receipt' ? receiptRef.current : cardRef.current;
        if (!hasResult || !frame || !node) return;
        const measure = () => {
            const available = frame.clientWidth;
            const natural = node.offsetWidth;
            if (!(available > 0) || !(natural > 0)) return;
            // Rounded down, so the scaled preview is never a fraction of a
            // pixel wider than the frame and never brings a scrollbar with it.
            const scale = Math.floor(Math.min(1, available / natural) * 1000) / 1000;
            // A transform does not shrink the space an element takes up, so
            // the frame is given the scaled height itself. Taken from the
            // rect, which keeps the fraction of a pixel offsetHeight rounds
            // away; the rect is the box as drawn, so whatever scale is on it
            // now is divided back out.
            const drawn = node.getBoundingClientRect();
            const naturalHeight = drawn.width > 0 ? drawn.height * (natural / drawn.width) : node.offsetHeight;
            const next = scale < 1 ? { scale, height: Math.ceil(naturalHeight * scale) } : null;
            setPreviewFit((prev) => (prev?.scale === next?.scale && prev?.height === next?.height ? prev : next));
        };
        measure();
        // The frame changes with the screen (a phone turned on its side); the
        // node grows when the cost-basis line arrives. Without ResizeObserver
        // the first measurement stands.
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(frame);
        observer?.observe(node);
        return () => observer?.disconnect();
    }, [exportVariant, hasResult]);

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
    // Debounced like DcaCalculator's OutcomeRangeCard and cancelled on unmount;
    // degrades silently to nothing. That includes the times Coinbase's daily
    // closes cannot be loaded: the action answers null rather than rank
    // against the other exchange's estimates. Skipped whenever the comparison
    // would not be like-for-like: manual mode prices every buy at a fixed
    // made-up price, and a starting stack or annual escalation makes the
    // average cost more than the flat fee-free schedule the historical windows
    // simulate. A flat fee is skipped too: it is a different share of every
    // buy, so it cannot be backed out of the average cost the way a percentage
    // is below.
    const [costBasis, setCostBasis] = useState<{ percentile: number; windowCount: number } | null>(null);

    useEffect(() => {
        // Reset immediately so a stale percentile never lingers on the card
        // while new inputs are still being fetched.
        setCostBasis(null);
        if (!frequency || priceMode !== 'api' || totalInvested <= 0 || btcAccumulated <= 0) return;
        if ((startingBtc ?? 0) > 0 || (annualEscalationPct ?? 0) > 0 || (flatFee ?? 0) > 0) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            const startTs = parseUtcDate(startDate);
            // Whole UTC days, like the schedule itself.
            const endTs = clampToTodayUtc(parseUtcDate(endDate));
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
    }, [frequency, priceMode, startDate, endDate, totalInvested, btcAccumulated, feePercentage, flatFee, startingBtc, annualEscalationPct]);

    // Floored, never rounded: 99.6% must claim "beats 99%", not a false 100%.
    const costBasisPct = costBasis ? Math.floor(costBasis.percentile) : null;
    // What the ranking was drawn from, worded once for the card and the
    // receipt. The windows start one day apart, so two neighbours share all
    // but one of their days. "Overlapping" keeps a count in the thousands
    // from reading as that many separate periods; the calculator's own range
    // card says the same of its runs.
    const costBasisScope = costBasis
        ? `${costBasis.windowCount.toLocaleString('en-US')} overlapping windows since 2010, before fees`
        : null;

    const isManual = priceMode === 'manual';
    const hasStack = (startingBtc ?? 0) > 0;
    // An amount of zero is a stack that is held and never added to. Nothing
    // was bought, so there is no schedule, raise or fee to print for it.
    const holdOnly = amount !== undefined && !(amount > 0);
    const hasRaise = !holdOnly && (annualEscalationPct ?? 0) > 0;
    // `flatFee` is in the display currency; formatCurrency expects USD.
    const flatFeeText = (flatFee ?? 0) > 0 && currencyConfig.rate > 0
        ? formatCurrency((flatFee ?? 0) / currencyConfig.rate, 2)
        : null;
    // null while the caller has not said what the fees are: better to state
    // nothing than to print "no fee" for a plan that has one.
    const feeText = feePercentage === undefined || holdOnly
        ? null
        : [feePercentage > 0 ? plainPercent(feePercentage) : null, flatFeeText].filter(Boolean).join(' + ') || 'none';
    // "EUR rate of 2026-10-09", or null for US dollars. One rate converts every
    // amount, whenever its buy was made, so a card in another currency is the
    // dollar result at that rate and not what the plan cost in that currency
    // day by day. "approx." marks a rate from the dated table.
    const rateText = currencyConfig.code === 'USD'
        ? null
        : `${ratesLive ? '' : 'approx. '}${currencyConfig.code} rate of ${ratesAsOf}`;
    const planEndsLater = planEndDate !== undefined && planEndDate > endDate;
    // "93 of 93", or the bare count when the caller did not say how many buys there were.
    const estimatedBuys = estimatedPrices?.purchases ?? 0;
    const estimatedBuysText = estimatedBuys > 0
        ? `${estimatedBuys.toLocaleString('en-US')}${purchaseCount !== undefined && purchaseCount > 0 ? ` of ${purchaseCount.toLocaleString('en-US')}` : ''}`
        : null;

    // What shaped the number besides amount, schedule and dates. The image and
    // the post leave the page, so they carry it with them: a card reading
    // "Current Value $15,025" for a $1/BTC hypothetical, or "$104,385 invested"
    // where $95,000 was coins already held, says something else without it.
    // The same things as the /share card names (shareAssumptionNotes in
    // app/share/shareData), ordered by how far each moves the figures: a post
    // on X keeps only as many as fit, counted from the front.
    const assumptions = useMemo(() => {
        const notes: string[] = [];
        // manualPrice is USD, like the field it comes from.
        if (isManual && manualPrice) notes.push(`every buy priced at an assumed ${formatCurrency(manualPrice, 2)}/BTC (hypothetical)`);
        if (hasStack) {
            const held = `${formatBtc(startingBtc ?? 0)} held at the start`;
            notes.push(holdOnly ? `no purchases, only ${held}` : `includes ${held}`);
        }
        // At an assumed price there is no history to convert and the rate
        // cancels out of every money figure, so only an approximate one is named.
        if (rateText && !isManual) notes.push(`${holdOnly ? 'converted' : 'every buy'} at ${ratesLive ? 'the' : 'an'} ${rateText}`);
        else if (rateText && !ratesLive) notes.push(rateText);
        if (hasRaise) notes.push(`amount rises ${plainPercent(annualEscalationPct ?? 0)}/yr`);
        if (feeText !== null) notes.push(feeText === 'none' ? 'no fee' : `${feeText} fee${flatFeeText ? ' per buy' : ''}`);
        if (planEndsLater) notes.push(`plan runs to ${monthYear(planEndDate ?? '') ?? planEndDate}`);
        if (estimatedBuysText) notes.push(`${estimatedBuysText} buy prices are estimates`);
        return notes;
    }, [isManual, manualPrice, hasStack, holdOnly, startingBtc, hasRaise, annualEscalationPct, feeText, flatFeeText, planEndsLater, planEndDate, estimatedBuysText, rateText, ratesLive, formatCurrency, formatBtc]);

    // Plain-language summary, no hype and no emoji (DESIGN_SPEC §6). Every figure
    // runs through the currency formatters so non-USD users share their own symbols.
    const postParts = useMemo(() => {
        const from = monthYear(startDate);
        const to = monthYear(endDate);
        const subject = holdOnly ? 'Bitcoin held' : 'Bitcoin DCA';
        const range = !from || !to
            ? subject
            : from === to
                ? `${subject} in ${from}`
                : `${subject} from ${from} to ${to}`;
        const roiText = signedReturn(roi);
        // At an assumed price nothing is "now": the value is that price times the stack.
        const worth = isManual ? 'worth' : 'now worth';
        const value = `${worth} ${formatCurrency(currentValue)} (${roiText})`;
        return {
            summary: holdOnly
                ? `${range}: counted at ${formatCurrency(totalInvested)}, ${value}.`
                : `${range}: ${formatCurrency(totalInvested)} invested, ${value}. ${formattedBtc} stacked.`,
            assumptions,
            extra: costBasisPct === null
                ? null
                : `Average cost beats ${costBasisPct}% of all possible start dates for this schedule.`,
        };
    }, [startDate, endDate, roi, totalInvested, currentValue, formatCurrency, formattedBtc, costBasisPct, isManual, holdOnly, assumptions]);

    // Nostr and the clipboard take the whole note. X gets what fits in one
    // post beside the link, the assumptions before the ranking: they are what
    // make the figures mean what they say.
    const noteText = useMemo(() => fullPostText(postParts), [postParts]);
    const xText = useMemo(() => xPostText(postParts), [postParts]);

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
                flatFee,
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
    }, [amount, frequency, feePercentage, flatFee, priceMode, provider, manualPrice, startDate, endDate, planEndDate, currencyConfig.code, startingBtc, startingAvgCost, annualEscalationPct]);

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
        const intent = `${X_INTENT}?text=${encodeURIComponent(xText)}&url=${encodeURIComponent(url)}`;
        if (openTab(intent)) {
            showStatus('x', 'Opened a post on X.', true);
        } else {
            showStatus('x', 'Pop-up blocked. Allow pop-ups to share on X.', false);
        }
    }, [buildShareUrl, xText, showStatus]);

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
        setExportError(null);
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
            // An export can fail without throwing: toDataURL answers with the
            // empty "data:," URL for a canvas that has no pixels or is over the
            // browser's maximum canvas size. Saved as it came, that was a
            // 0-byte PNG with nothing said.
            if (!dataUrl.startsWith('data:image/png') || dataUrl.length < 200) throw new Error('empty canvas');
            const link = document.createElement('a');
            link.download = `my-btc-${exportVariant === 'receipt' ? 'receipt' : 'stack'}-${utcIsoToday()}.png`;
            link.href = dataUrl;
            link.click();
        } catch {
            setExportError(EXPORT_FAILED);
        } finally {
            setDownloading(false);
        }
    }, [downloading, exportVariant]);

    if (totalInvested <= 0) return null;

    // Same formula as calculateDca: totalInvested / totalBtc (both props are USD).
    const averageCost = btcAccumulated > 0 ? totalInvested / btcAccumulated : 0;
    // `amount` is in the display currency; formatCurrency expects USD.
    const amountUsd = amount !== undefined && currencyConfig.rate > 0 ? amount / currencyConfig.rate : undefined;
    const planLabel = amountUsd !== undefined && frequency !== undefined && !holdOnly
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
                                onClick={() => { setExportVariant(variant); setExportError(null); }}
                                aria-pressed={exportVariant === variant}
                                className={`min-h-11 min-w-11 px-2.5 py-1.5 text-xs font-medium transition-colors ${
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
                        type="button"
                        onClick={handleDownload}
                        disabled={downloading}
                        className="inline-flex items-center gap-1.5 min-h-11 shrink-0 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        {downloading ? 'Generating...' : 'Download PNG'}
                    </button>
                </div>
            </div>

            {/* Directly under the button that failed, and kept until the next attempt. */}
            {exportError && (
                <p role="alert" className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 fade-in">{exportError}</p>
            )}

            {/* Fixed widths (card 440px, receipt 360px) so every exported PNG is
                identical; the actions sit beside it on wide screens so the row
                doesn't end in dead space. Narrower than that, the preview is
                scaled to fit (see "Preview fit" above). The scroll container
                stays for the one case the fit cannot cover: a browser that
                could not measure the frame still lets the card be swiped. */}
            <div className="grid items-start gap-4 lg:grid-cols-[440px_minmax(0,1fr)]">
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div ref={previewFrameRef} style={previewFit ? { height: previewFit.height } : undefined}>
                <div style={previewFit ? { transform: `scale(${previewFit.scale})`, transformOrigin: 'top left' } : undefined}>
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
                        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            {isManual ? 'Value at the assumed price' : 'Current Value'}
                        </div>
                        <div className="flex items-baseline gap-2.5">
                            <span className="text-3xl font-bold text-amber-700 dark:text-amber-400">
                                {formatCurrency(currentValue)}
                            </span>
                            <span className={`text-sm font-semibold px-2 py-0.5 rounded-full tabular-nums ${
                                isProfit
                                    ? 'bg-emerald-500/10 text-gain'
                                    : 'bg-rose-500/10 text-loss'
                            }`}>
                                {signedReturn(roi)}
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

                    {costBasisPct !== null && costBasisScope !== null && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3.5 fade-in">
                            Average cost beats <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{costBasisPct}%</span> of
                            all possible start dates for this schedule · {costBasisScope}
                        </div>
                    )}

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3.5 tabular-nums">
                        {formatCardDate(startDate)} &mdash; {formatCardDate(endDate)}
                        {assumptions.length > 0 && (
                            <span className="block mt-1 leading-relaxed">{assumptions.join(' · ')}</span>
                        )}
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
                        {planEndsLater && planEndDate && <ReceiptRow label="Plan ends" value={formatCardDate(planEndDate)} />}
                        {purchaseCount !== undefined && purchaseCount > 0 && (
                            <ReceiptRow label="Purchases" value={purchaseCount.toLocaleString('en-US')} />
                        )}
                        {estimatedBuysText && <ReceiptRow label="Estimated prices" value={`${estimatedBuysText} buys`} />}
                        {feeText !== null && (
                            <ReceiptRow label="Fee per buy" value={feeText} />
                        )}
                        {hasRaise && <ReceiptRow label="Yearly raise" value={`+${plainPercent(annualEscalationPct ?? 0)}`} />}
                        {hasStack && <ReceiptRow label="Held at start" value={formatBtc(startingBtc ?? 0)} />}
                        {isManual && !!manualPrice && (
                            <ReceiptRow label="Assumed price" value={`${formatCurrency(manualPrice, 2)}/BTC`} />
                        )}
                        {/* The card's exchange-rate note, as a row. */}
                        {rateText && (!isManual || !ratesLive) && (
                            <ReceiptRow label={isManual || holdOnly ? 'Converted at' : 'Every buy at'} value={rateText} />
                        )}
                    </div>

                    <ReceiptRule />

                    {/* Line items */}
                    <div className="space-y-1.5">
                        <ReceiptRow label="Invested" value={formatCurrency(totalInvested)} />
                        <ReceiptRow label="BTC stacked" value={formattedBtc} />
                        {averageCost > 0 && <ReceiptRow label="Avg cost" value={`${formatCurrency(averageCost)}/BTC`} />}
                        {/* "(est.)" where the calculator's own stats strip says "est.":
                            a best buy priced on an estimate, a drawdown walked over
                            estimated days. */}
                        {bestBuy && (
                            <ReceiptRow
                                label="Best buy"
                                value={`${formatCurrency(bestBuy.price)} · ${formatUtc(bestBuy.date, 'full')}${bestBuy.priceKind === 'estimated' ? ' (est.)' : ''}`}
                            />
                        )}
                        {maxDrawdownPercent != null && (
                            <ReceiptRow
                                label="Max drawdown"
                                value={`${maxDrawdownPercent > 0 ? `-${maxDrawdownPercent.toFixed(1)}%` : '0%'}${(estimatedPrices?.drawdownDays ?? 0) > 0 ? ' (est.)' : ''}`}
                            />
                        )}
                    </div>

                    <ReceiptRule />

                    {/* Total */}
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {isManual ? 'Worth at assumed price' : 'Worth today'}
                        </span>
                        <span className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(currentValue)}</span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-xs">
                        <span className="uppercase tracking-wide text-slate-500 dark:text-slate-400">{isProfit ? 'Profit' : 'Loss'}</span>
                        <span className={`font-bold tabular-nums ${isProfit ? 'text-gain' : 'text-loss'}`}>
                            {isProfit ? '+' : ''}{formatCurrency(profit)} ({signedReturn(roi)})
                        </span>
                    </div>

                    {costBasisPct !== null && costBasisScope !== null && (
                        <p className="mt-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                            Average cost beats {costBasisPct}% of all possible start dates for this
                            schedule · {costBasisScope}
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
                                claiming "real market data" there would be a lie. Nor is
                                it the whole truth where buys were priced on estimates;
                                an estimated best buy is enough to know there were some. */}
                            {priceMode === 'manual'
                                ? 'manual price'
                                : estimatedBuys > 0 || bestBuy?.priceKind === 'estimated'
                                    ? 'market data with estimated prices'
                                    : 'real market data'} · not financial advice
                        </span>
                    </div>
                </div>
                )}
                </div>
                </div>
            </div>

            {/* Share actions — outside cardRef/receiptRef so they never land in the PNG export */}
            <div className="space-y-3 lg:pt-1">
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Download the card or the story-sized receipt as an image, or post your result to
                    Nostr or X. The link holds this plan&apos;s settings in plain text: the amount, schedule,
                    dates, fees and any starting stack you entered. Whoever opens it gets the same plan,
                    priced on the day they open it.
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

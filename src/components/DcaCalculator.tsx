'use client';

import { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef, memo } from 'react';
import { format, subYears, subMonths, startOfToday, differenceInMonths } from 'date-fns';
import { Frequency, PriceMode, AssetDcaResult, DcaStats } from '@/types';
import { useCurrency, CurrencyCode } from '@/context/CurrencyContext';
import { calculateDca, calculateLumpSum, calculateAssetDca } from '@/utils/dca';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice, getAssetPriceHistory, getCpiData, getProfitableWindows } from '@/app/actions';
import { generateCsvContent, downloadCsv } from '@/utils/csv';
import { encodeParams, decodeParams } from '@/utils/urlParams';
import { formatUtc, parseUtcDate, DAY_MS } from '@/utils/dates';
import dynamic from 'next/dynamic';
import { SkeletonCard, SkeletonChart } from './Skeleton';
import { AdSlot } from './AdSlot';
import { Card } from './ui/Card';
import { useCountUp } from '@/hooks/useCountUp';

// Lazy-load result sub-components — none render until after a calculation
const DcaChart = dynamic(() => import('./DcaChart').then(m => m.DcaChart));
const TransactionTable = dynamic(() => import('./TransactionTable').then(m => m.TransactionTable));
const AssetComparison = dynamic(() => import('./AssetComparison').then(m => m.AssetComparison));
const ExchangeFeeComparison = dynamic(() => import('./ExchangeFeeComparison').then(m => m.ExchangeFeeComparison));
const StackingGoalTracker = dynamic(() => import('./StackingGoalTracker').then(m => m.StackingGoalTracker));
const ShareMyStack = dynamic(() => import('./ShareMyStack').then(m => m.ShareMyStack));
const UnitBiasCalculator = dynamic(() => import('./UnitBiasCalculator').then(m => m.UnitBiasCalculator));
const SavingsComparison = dynamic(() => import('./SavingsComparison').then(m => m.SavingsComparison));
const OpportunityCostCalculator = dynamic(() => import('./OpportunityCostCalculator').then(m => m.OpportunityCostCalculator));
const FireCalculator = dynamic(() => import('./FireCalculator').then(m => m.FireCalculator));
const CostBasisTracker = dynamic(() => import('./CostBasisTracker').then(m => m.CostBasisTracker));
const PlanComparison = dynamic(() => import('./PlanComparison').then(m => m.PlanComparison));
const FutureProjection = dynamic(() => import('./FutureProjection').then(m => m.FutureProjection));
import { TrendingUp, TrendingDown, DollarSign, Activity, Repeat, Download, Share2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

type Preset = { label: string; amount: number; frequency: Frequency; yearsBack?: number; monthsBack?: number; startDate?: string };

const FEE_PRESETS: { name: string; fee: number }[] = [
    { name: 'River', fee: 0 },
    { name: 'Strike', fee: 0 },
    { name: 'Kraken', fee: 0.26 },
    { name: 'Swan', fee: 0.99 },
    { name: 'Coinbase', fee: 1.49 },
];

/** Round to 2 significant figures (used to keep converted quick-pick prices tidy). */
const roundTo2Sig = (n: number): number => {
    if (!Number.isFinite(n) || n <= 0) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / mag) * mag;
};

/** Compact sats rendering for narrow columns. */
const satsShort = (btc: number): string => {
    const sats = Math.floor(btc * 100_000_000);
    if (sats >= 1_000_000_000) return `${(sats / 1_000_000_000).toFixed(2)}B sats`;
    if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M sats`;
    return `${sats.toLocaleString()} sats`;
};

export const DcaCalculator = () => {
    const { currency, setCurrency, currencyConfig, currencies, formatCurrency, formatCompact, formatBtc, formatSats } = useCurrency();
    const [today, setToday] = useState(() => startOfToday());

    useEffect(() => {
        const interval = setInterval(() => {
            const now = startOfToday();
            if (now.getTime() !== today.getTime()) {
                setToday(now);
            }
        }, 60_000);
        return () => clearInterval(interval);
    }, [today]);

    const [amount, setAmount] = useState<number>(50);
    const deferredAmount = useDeferredValue(amount);
    const [frequency, setFrequency] = useState<Frequency>('weekly');
    const [startDate, setStartDate] = useState<string>(format(subYears(today, 5), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState<string>(format(today, 'yyyy-MM-dd'));
    const [feePercentage, setFeePercentage] = useState<number>(0.5);
    const deferredFee = useDeferredValue(feePercentage);
    const [priceMode, setPriceMode] = useState<PriceMode>('api');
    const [manualPrice, setManualPrice] = useState<number>(50000);
    const deferredManualPrice = useDeferredValue(manualPrice);
    const [provider, setProvider] = useState<'kraken' | 'coinbase'>('kraken');
    const [unit, setUnit] = useState<'BTC' | 'SATS'>('BTC');
    const [priceData, setPriceData] = useState<[number, number][]>([]);
    const [livePrice, setLivePrice] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const [shareMessage, setShareMessage] = useState<string | null>(null);
    const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [sp500Data, setSp500Data] = useState<[number, number][] | null>(null);
    const [goldData, setGoldData] = useState<[number, number][] | null>(null);
    const [comparisonLoading, setComparisonLoading] = useState(false);
    const [cpiData, setCpiData] = useState<[number, number][] | null>(null);

    const applyPreset = useCallback((preset: Preset) => {
        const now = startOfToday();
        setAmount(preset.amount);
        setFrequency(preset.frequency);
        setEndDate(format(now, 'yyyy-MM-dd'));
        if (preset.startDate) {
            setStartDate(preset.startDate);
        } else if (preset.yearsBack) {
            setStartDate(format(subYears(now, preset.yearsBack), 'yyyy-MM-dd'));
        } else if (preset.monthsBack) {
            setStartDate(format(subMonths(now, preset.monthsBack), 'yyyy-MM-dd'));
        }
        setPriceMode('api');
    }, []);

    // Preset amounts are entered into the display-currency amount field, so the
    // labels carry the selected currency's symbol rather than a hardcoded '$'.
    const presetGroups = useMemo(() => {
        const s = currencyConfig.symbol;
        return [
            {
                title: 'Quick scenarios',
                presets: [
                    { label: `${s}50/week for 5 years`, amount: 50, frequency: 'weekly', yearsBack: 5 },
                    { label: `${s}100/week for 3 years`, amount: 100, frequency: 'weekly', yearsBack: 3 },
                    { label: `${s}200/month for 1 year`, amount: 200, frequency: 'monthly', yearsBack: 1 },
                    { label: `${s}25/week since 2013`, amount: 25, frequency: 'weekly', startDate: '2013-01-01' },
                ] as Preset[],
            },
            {
                title: 'What if I bought the peak?',
                presets: [
                    { label: `${s}50/week from 2013 peak`, amount: 50, frequency: 'weekly', startDate: '2013-12-04' },
                    { label: `${s}50/week from 2017 peak`, amount: 50, frequency: 'weekly', startDate: '2017-12-17' },
                    { label: `${s}50/week from 2021 peak`, amount: 50, frequency: 'weekly', startDate: '2021-11-10' },
                ] as Preset[],
            },
        ];
    }, [currencyConfig.symbol]);

    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        const params = decodeParams(Object.fromEntries(sp.entries()));
        if (params) {
            if (params.currency) setCurrency(params.currency as CurrencyCode);
            if (params.amount !== undefined) setAmount(params.amount);
            if (params.frequency) setFrequency(params.frequency);
            if (params.startDate) setStartDate(params.startDate);
            if (params.endDate) setEndDate(params.endDate);
            if (params.feePercentage !== undefined) setFeePercentage(params.feePercentage);
            if (params.priceMode) setPriceMode(params.priceMode);
            if (params.provider) setProvider(params.provider);
            if (params.manualPrice !== undefined) setManualPrice(params.manualPrice);
        }
    }, [setCurrency]);

    const dateError = useMemo(() => {
        if (!startDate || !endDate) return 'Please select both start and end dates';
        if (startDate > endDate) return 'Start date must be before end date';
        return null;
    }, [startDate, endDate]);

    useEffect(() => {
        if (priceMode !== 'api' || dateError) return;
        let cancelled = false;
        const fetchPrices = async () => {
            setLoading(true);
            setError(null);
            try {
                const startTs = new Date(startDate).getTime();
                const endTs = new Date(endDate).getTime();
                const [history, current] = await Promise.all([
                    getBitcoinPriceHistory(startTs, endTs + 86400000, provider),
                    getCurrentBitcoinPrice(provider)
                ]);
                if (cancelled) return;
                setPriceData(history);
                setLivePrice(current);
            } catch {
                if (cancelled) return;
                // Be honest: don't silently price everything at the manual default.
                setPriceData([]);
                setLivePrice(null);
                setError('Live price data is unavailable right now — showing no results. Try again or switch to Manual mode.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        const timer = setTimeout(fetchPrices, 500);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [startDate, endDate, priceMode, provider, dateError, retryToken]);

    useEffect(() => {
        if (priceMode !== 'api' || dateError) {
            setSp500Data(null);
            setGoldData(null);
            setCpiData(null);
            return;
        }
        let cancelled = false;
        const fetchComparison = async () => {
            setComparisonLoading(true);
            try {
                const startTs = new Date(startDate).getTime();
                const endTs = new Date(endDate).getTime() + 86400000;
                const [sp500, gold, cpi] = await Promise.all([
                    getAssetPriceHistory('^GSPC', startTs, endTs),
                    getAssetPriceHistory('GC=F', startTs, endTs),
                    getCpiData(startTs, endTs),
                ]);
                if (cancelled) return;
                setSp500Data(sp500);
                setGoldData(gold);
                setCpiData(cpi);
            } catch {
                if (cancelled) return;
                setSp500Data(null);
                setGoldData(null);
                setCpiData(null);
            } finally {
                if (!cancelled) setComparisonLoading(false);
            }
        };
        const timer = setTimeout(fetchComparison, 600);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [startDate, endDate, priceMode, dateError]);

    const amountUsd = useMemo(() => deferredAmount / currencyConfig.rate, [deferredAmount, currencyConfig.rate]);

    // Today as a UTC-midnight timestamp of the user's local calendar date — the
    // engine buckets by UTC day, so this is the correct "today" for comparisons.
    const todayUtcTs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const isFutureEndDate = parseUtcDate(endDate) > todayUtcTs;

    const results = useMemo(() => {
        if (dateError) {
            return { totalInvested: 0, btcAccumulated: 0, averageCost: 0, currentValue: 0, profit: 0, roi: 0, breakdown: [] };
        }
        return calculateDca({ amount: amountUsd, frequency, startDate: new Date(startDate), endDate: new Date(endDate), feePercentage: deferredFee, priceMode, manualPrice: deferredManualPrice }, priceData, priceMode === 'api' ? livePrice : undefined);
    }, [amountUsd, frequency, startDate, endDate, deferredFee, priceMode, deferredManualPrice, priceData, livePrice, dateError]);

    // Past-only run (end date capped at today). calculateDca already includes the
    // future leg at the last known price when the end date is in the future, so
    // FutureProjection must receive these figures — not the full-range ones — or
    // every future purchase would be counted twice.
    const pastResults = useMemo(() => {
        if (dateError || !isFutureEndDate) return results;
        return calculateDca(
            { amount: amountUsd, frequency, startDate: new Date(startDate), endDate: new Date(todayUtcTs), feePercentage: deferredFee, priceMode, manualPrice: deferredManualPrice },
            priceData,
            priceMode === 'api' ? livePrice : undefined
        );
    }, [results, dateError, isFutureEndDate, amountUsd, frequency, startDate, todayUtcTs, deferredFee, priceMode, deferredManualPrice, priceData, livePrice]);

    const lumpSumResult = useMemo(() => {
        if (priceMode !== 'api' || !priceData.length || !livePrice || dateError) return null;
        return calculateLumpSum(results.totalInvested, new Date(startDate), priceData, livePrice, deferredFee);
    }, [priceMode, priceData, livePrice, results.totalInvested, startDate, dateError, deferredFee]);

    const sp500Result: AssetDcaResult | null = useMemo(() => {
        if (!sp500Data) return null;
        return calculateAssetDca(amountUsd, frequency, new Date(startDate), new Date(endDate), deferredFee, sp500Data, '^GSPC', 'S&P 500');
    }, [sp500Data, amountUsd, frequency, startDate, endDate, deferredFee]);

    const goldResult: AssetDcaResult | null = useMemo(() => {
        if (!goldData) return null;
        return calculateAssetDca(amountUsd, frequency, new Date(startDate), new Date(endDate), deferredFee, goldData, 'GC=F', 'Gold');
    }, [goldData, amountUsd, frequency, startDate, endDate, deferredFee]);

    const btcAssetResult: AssetDcaResult = useMemo(() => ({
        asset: 'BTC', label: 'Bitcoin', totalInvested: results.totalInvested, currentValue: results.currentValue,
        profit: results.profit, roi: results.roi,
        breakdown: results.breakdown.map(b => ({ date: b.date, portfolioValue: b.portfolioValue })),
    }), [results]);

    const purchaseCount = results.breakdown.length;

    const durationText = useMemo(() => {
        if (results.breakdown.length < 2) return null;
        const first = new Date(results.breakdown[0].date);
        const last = new Date(results.breakdown[results.breakdown.length - 1].date);
        const totalMonths = differenceInMonths(last, first);
        const years = Math.floor(totalMonths / 12);
        const months = totalMonths % 12;
        if (years > 0 && months > 0) return `${years}y ${months}mo`;
        if (years > 0) return `${years}y`;
        return `${months}mo`;
    }, [results.breakdown]);

    const inflationStats = useMemo(() => {
        if (!cpiData || cpiData.length < 2) return null;
        const startCpi = cpiData[0][1];
        const endCpi = cpiData[cpiData.length - 1][1];
        if (startCpi <= 0 || endCpi <= 0) return null;
        const adjustmentFactor = startCpi / endCpi;
        const adjustedValue = results.currentValue * adjustmentFactor;
        const adjustedProfit = adjustedValue - results.totalInvested;
        const adjustedRoi = results.totalInvested > 0 ? (adjustedProfit / results.totalInvested) * 100 : 0;
        const cumulativeInflation = ((endCpi - startCpi) / startCpi) * 100;
        return { adjustedValue, adjustedProfit, adjustedRoi, cumulativeInflation };
    }, [cpiData, results.currentValue, results.totalInvested]);

    const isProfit = results.profit >= 0;

    const handleExportCsv = useCallback(() => {
        if (results.breakdown.length === 0) return;
        const csv = generateCsvContent(results.breakdown, { code: currencyConfig.code, rate: currencyConfig.rate });
        downloadCsv(csv, `bitcoin-dca-${startDate}-to-${endDate}.csv`);
    }, [results.breakdown, startDate, endDate, currencyConfig.code, currencyConfig.rate]);

    const handleShare = useCallback(async () => {
        const paramStr = encodeParams({ amount, frequency, startDate, endDate, feePercentage, priceMode, provider, manualPrice, currency: currencyConfig.code });
        // /share serves a result-specific OG card to link unfurlers, then forwards
        // humans to the calculator with the same params.
        const url = `${window.location.origin}/share?${paramStr}`;
        if (typeof navigator.share === 'function') {
            try {
                await navigator.share({ title: 'Bitcoin DCA Calculator', url });
                return;
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') return;
                // fall through to the clipboard path
            }
        }
        if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
        try {
            await navigator.clipboard.writeText(url);
            setShareMessage('Link copied to clipboard!');
        } catch {
            setShareMessage('Failed to copy link');
        }
        shareTimerRef.current = setTimeout(() => setShareMessage(null), 2000);
    }, [amount, frequency, startDate, endDate, feePercentage, priceMode, provider, manualPrice, currencyConfig.code]);

    const handleRetry = useCallback(() => setRetryToken(t => t + 1), []);

    const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.min(50, Math.max(0, Number(e.target.value)));
        setFeePercentage(val);
    };

    // In API mode with no data, results would be silently priced at the manual
    // default — never show those phantom numbers.
    const apiDataMissing = priceMode === 'api' && !dateError && priceData.length === 0;
    const showSkeleton = loading || (apiDataMissing && !error);
    const showEmptyError = !loading && apiDataMissing && !!error;

    const profitClass = isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

    return (
        <div className="space-y-6 sm:space-y-8">
            {/* Input Section */}
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <h2 className="text-lg sm:text-xl font-bold mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-500 shrink-0" />
                    Investment Parameters
                </h2>

                {/* Presets */}
                <div className="space-y-3 mb-5 sm:mb-6">
                    {presetGroups.map((group) => (
                        <div key={group.title}>
                            <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                {group.title}
                            </div>
                            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                {group.presets.map((preset) => (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => applyPreset(preset)}
                                        className="px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200/60 dark:border-amber-800/40 transition-colors"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 overflow-hidden">
                    {/* Amount */}
                    <div className="space-y-1.5">
                        <label htmlFor="dca-amount" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Amount ({currencyConfig.code})</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-sm">{currencyConfig.symbol}</span>
                            <input
                                id="dca-amount"
                                type="number"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                                onFocus={(e) => e.target.select()}
                                className="w-full pl-7 pr-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Frequency */}
                    <div className="space-y-1.5">
                        <label htmlFor="dca-frequency" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Frequency</label>
                        <select
                            id="dca-frequency"
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as Frequency)}
                            className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all"
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Bi-weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </div>

                    {/* Fee */}
                    <div className="space-y-1.5">
                        <label htmlFor="dca-fee" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Fee (%)</label>
                        <input
                            id="dca-fee"
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={0}
                            max={50}
                            value={feePercentage}
                            onChange={handleFeeChange}
                            onFocus={(e) => e.target.select()}
                            className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all"
                        />
                        <div className="pt-0.5">
                            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Exchange presets</div>
                            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Exchange fee presets">
                                {FEE_PRESETS.map((p) => (
                                    <button
                                        key={p.name}
                                        type="button"
                                        onClick={() => setFeePercentage(p.fee)}
                                        aria-pressed={feePercentage === p.fee}
                                        className={clsx(
                                            'px-2 py-1 min-h-[24px] text-[11px] font-medium rounded-full border transition-colors',
                                            feePercentage === p.fee
                                                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/40'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        )}
                                    >
                                        {p.name} {p.fee}%
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Currency */}
                    <div className="space-y-1.5">
                        <label htmlFor="dca-currency" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Currency</label>
                        <select
                            id="dca-currency"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                            className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all"
                        >
                            {currencies.map(c => (
                                <option key={c.code} value={c.code}>{c.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Start Date */}
                    <div className="space-y-1.5 min-w-0 overflow-hidden">
                        <label htmlFor="dca-start-date" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Start Date</label>
                        <input
                            id="dca-start-date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            aria-invalid={!!dateError}
                            aria-describedby={dateError ? 'dca-date-error' : undefined}
                            className={clsx(
                                "w-full min-w-0 max-w-full appearance-none box-border px-2 sm:px-3 py-2 text-base sm:text-sm rounded-lg border bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all min-h-[38px]",
                                dateError ? "border-rose-400 dark:border-rose-600" : "border-slate-200 dark:border-slate-700"
                            )}
                        />
                    </div>

                    {/* End Date */}
                    <div className="space-y-1.5 min-w-0 overflow-hidden">
                        <label htmlFor="dca-end-date" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">End Date</label>
                        <input
                            id="dca-end-date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            aria-invalid={!!dateError}
                            aria-describedby={dateError ? 'dca-date-error' : undefined}
                            className={clsx(
                                "w-full min-w-0 max-w-full appearance-none box-border px-2 sm:px-3 py-2 text-base sm:text-sm rounded-lg border bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all min-h-[38px]",
                                dateError ? "border-rose-400 dark:border-rose-600" : "border-slate-200 dark:border-slate-700"
                            )}
                        />
                        {dateError && <p id="dca-date-error" className="text-xs text-rose-600 dark:text-rose-400">{dateError}</p>}
                    </div>

                    {/* Price Mode + Provider */}
                    <div className="space-y-3 sm:col-span-2 lg:col-span-1">
                        <div className="space-y-1.5">
                            <span id="dca-price-mode-label" className="block text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Price Mode</span>
                            <div role="group" aria-labelledby="dca-price-mode-label" className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setPriceMode('api')}
                                    aria-pressed={priceMode === 'api'}
                                    className={clsx(
                                        "flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all",
                                        priceMode === 'api'
                                            ? "bg-white dark:bg-slate-700 shadow-sm text-amber-600 dark:text-amber-400"
                                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    )}
                                >
                                    Live API
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPriceMode('manual')}
                                    aria-pressed={priceMode === 'manual'}
                                    className={clsx(
                                        "flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all",
                                        priceMode === 'manual'
                                            ? "bg-white dark:bg-slate-700 shadow-sm text-amber-600 dark:text-amber-400"
                                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    )}
                                >
                                    Manual
                                </button>
                            </div>
                        </div>

                        {priceMode === 'api' && (
                            <div className="fade-in">
                                <label htmlFor="dca-provider" className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Data Source</label>
                                <select
                                    id="dca-provider"
                                    value={provider}
                                    onChange={(e) => setProvider(e.target.value as 'kraken' | 'coinbase')}
                                    className="w-full text-base sm:text-sm px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:border-amber-500 transition-all"
                                >
                                    <option value="kraken">Kraken</option>
                                    <option value="coinbase">Coinbase</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {priceMode === 'manual' && (
                        <div className="space-y-1.5 fade-in sm:col-span-2 lg:col-span-1">
                            <label htmlFor="dca-manual-price" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Avg. BTC Price (USD)</label>
                            <input
                                id="dca-manual-price"
                                type="number"
                                inputMode="decimal"
                                value={manualPrice}
                                onChange={(e) => setManualPrice(Math.max(1, Number(e.target.value)))}
                                onFocus={(e) => e.target.select()}
                                className="w-full px-3 py-2 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all"
                            />
                        </div>
                    )}
                </div>

                {/* Footer bar */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm text-slate-500">Projected</span>
                        <span className="text-base sm:text-lg font-bold text-slate-800 dark:text-white tabular-nums">{formatCurrency(results.totalInvested)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleShare}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            title="Share calculator settings"
                            aria-label="Share calculator settings"
                        >
                            <Share2 className="w-4 h-4" />
                        </button>
                        {results.breakdown.length > 0 && (
                            <button
                                onClick={handleExportCsv}
                                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                title="Export to CSV"
                                aria-label="Export transaction history to CSV"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
                <div role="status" aria-live="polite">
                    {shareMessage && <div className="mt-2 text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 fade-in">{shareMessage}</div>}
                </div>
            </div>

            {/* Loading / Error / Results */}
            {showSkeleton ? (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                    <SkeletonChart />
                </>
            ) : showEmptyError ? (
                <Card className="p-6 sm:p-10 text-center fade-in">
                    <p role="status" aria-live="polite" className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                        {error}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" aria-hidden="true" />
                            Retry
                        </button>
                        <button
                            type="button"
                            onClick={() => setPriceMode('manual')}
                            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Use Manual mode
                        </button>
                    </div>
                </Card>
            ) : (
                <>
                    {/* Result Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        <ResultCard
                            label={isFutureEndDate ? "Total to Invest" : "Total Invested"}
                            value={results.totalInvested}
                            format={formatCurrency}
                            formatShort={formatCompact}
                        />
                        <ResultCard
                            label={unit === 'BTC' ? (isFutureEndDate ? "BTC to Accumulate" : "BTC Accumulated") : (isFutureEndDate ? "Sats to Accumulate" : "Sats Accumulated")}
                            value={results.btcAccumulated}
                            format={(n) => unit === 'BTC' ? formatBtc(n) : formatSats(n)}
                            formatShort={(n) => unit === 'BTC' ? `${n < 1 ? n.toFixed(4) : n.toFixed(2)} ₿` : satsShort(n)}
                            subValue={isFutureEndDate ? "at current prices" : `Avg: ${formatCurrency(results.averageCost)}`}
                            action={
                                <button
                                    type="button"
                                    onClick={() => setUnit(prev => prev === 'BTC' ? 'SATS' : 'BTC')}
                                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                    title={`Switch to ${unit === 'BTC' ? 'Sats' : 'BTC'}`}
                                    aria-label={`Switch to ${unit === 'BTC' ? 'sats' : 'BTC'}`}
                                >
                                    <Repeat className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                </button>
                            }
                        />
                        <ResultCard
                            label={isFutureEndDate ? "Value at Current Price" : "Current Value"}
                            value={results.currentValue}
                            format={formatCurrency}
                            formatShort={formatCompact}
                            subValue={priceMode === 'api' && livePrice ? `@ ${formatCurrency(livePrice)}` : undefined}
                            subValueClassName="text-amber-600 dark:text-amber-400 font-medium"
                            celebrated
                            icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />}
                        />
                        <ResultCard
                            label={isFutureEndDate ? "Projected Gain" : "Profit / Loss"}
                            value={results.profit}
                            format={(n) => `${n >= 0 ? '+' : ''}${formatCurrency(n)}`}
                            formatShort={(n) => `${n >= 0 ? '+' : ''}${formatCompact(n)}`}
                            valueClassName={profitClass}
                            icon={isProfit
                                ? <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                : <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600 dark:text-rose-400 shrink-0" />}
                            subValue={isFutureEndDate ? "if price stays same" : `${results.roi.toFixed(1)}% ROI`}
                            subValueClassName={profitClass}
                        />
                    </div>

                    {/* Stats strip (historical figures — capped at today when the end date is in the future) */}
                    {pastResults.stats && pastResults.breakdown.length > 0 && (
                        <StatsStrip stats={pastResults.stats} />
                    )}

                    {/* Historical profitability of comparable windows */}
                    {purchaseCount > 0 && priceMode === 'api' && (
                        <ProfitableWindows frequency={frequency} startDate={startDate} endDate={endDate} />
                    )}

                    {/* Stats Banner */}
                    {purchaseCount > 0 && (
                        <div className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 py-1">
                            <p className="flex flex-wrap justify-center gap-x-1 gap-y-0.5">
                                <span>{purchaseCount} purchases{durationText ? ` over ${durationText}` : ''}</span>
                                {results.btcAccumulated > 0 && (
                                    <>
                                        <span className="hidden sm:inline mx-1">|</span>
                                        <span>
                                            <span className="font-medium text-amber-600 dark:text-amber-400">{results.btcAccumulated < 1 ? results.btcAccumulated.toFixed(4) : results.btcAccumulated.toFixed(2)}</span> of 21M BTC
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    )}

                    {/* Result Explainer */}
                    {purchaseCount > 0 && (
                        <p className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto">
                            {isFutureEndDate ? (
                                <>
                                    If you invest {currencyConfig.symbol}{amount.toLocaleString()} every {frequency === 'daily' ? 'day' : frequency === 'biweekly' ? 'two weeks' : frequency.replace('ly', '')} from{' '}
                                    {formatUtc(parseUtcDate(startDate), 'monthYear')} to {formatUtc(parseUtcDate(endDate), 'monthYear')}, you will spend{' '}
                                    {formatCurrency(results.totalInvested)} and accumulate{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{results.btcAccumulated < 1 ? results.btcAccumulated.toFixed(6) : results.btcAccumulated.toFixed(4)} BTC</span>{' '}
                                    (at current prices: {formatCurrency(results.currentValue)}).
                                </>
                            ) : (
                                <>
                                    If you had invested {currencyConfig.symbol}{amount.toLocaleString()} every {frequency === 'daily' ? 'day' : frequency === 'biweekly' ? 'two weeks' : frequency.replace('ly', '')} from{' '}
                                    {formatUtc(parseUtcDate(startDate), 'monthYear')} to {formatUtc(parseUtcDate(endDate), 'monthYear')}, you would have spent{' '}
                                    {formatCurrency(results.totalInvested)} and your Bitcoin would now be worth{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{formatCurrency(results.currentValue)}</span>{' '}
                                    &mdash; a <span className={clsx("font-medium", isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{results.roi.toFixed(1)}% return</span>.
                                </>
                            )}
                        </p>
                    )}

                    {/* Future Projection (when end date is in the future) */}
                    {livePrice && (
                        <FutureProjection
                            amount={amountUsd}
                            frequency={frequency}
                            startDate={startDate}
                            endDate={endDate}
                            feePercentage={deferredFee}
                            currentPrice={livePrice}
                            currentBtc={pastResults.btcAccumulated}
                            currentInvested={pastResults.totalInvested}
                        />
                    )}

                    {/* Inflation-Adjusted Returns */}
                    {inflationStats && (
                        <div className="bg-white dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 rounded-xl border border-slate-200 dark:border-slate-800 fade-in">
                            <div className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center mb-2">
                                Real (inflation-adjusted) value &mdash; full-period CPI
                            </div>
                            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center text-xs sm:text-sm">
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Real Value</div>
                                    <div className="font-semibold text-slate-800 dark:text-white truncate tabular-nums">
                                        <span className="sm:hidden">{formatCompact(inflationStats.adjustedValue)}</span>
                                        <span className="hidden sm:inline">{formatCurrency(inflationStats.adjustedValue)}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Real ROI</div>
                                    <div className={clsx("font-semibold tabular-nums", inflationStats.adjustedRoi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                        {inflationStats.adjustedRoi.toFixed(1)}%
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Inflation</div>
                                    <div className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                                        {inflationStats.cumulativeInflation.toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Lump Sum Comparison */}
                    {lumpSumResult && (
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800 fade-in">
                            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-800 dark:text-slate-100">DCA vs Lump Sum</h3>
                            <div className="grid grid-cols-2 gap-3 sm:gap-6">
                                <div className="p-3 sm:p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
                                    <div className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">DCA Strategy</div>
                                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
                                        <span className="sm:hidden">{formatCompact(results.currentValue)}</span>
                                        <span className="hidden sm:inline">{formatCurrency(results.currentValue)}</span>
                                    </div>
                                    <div className={clsx("text-xs sm:text-sm mt-1 truncate tabular-nums", results.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                        <span className="sm:hidden">{results.profit >= 0 ? '+' : '-'}{formatCompact(Math.abs(results.profit))} ({results.roi.toFixed(1)}%)</span>
                                        <span className="hidden sm:inline">{results.profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(results.profit))} ({results.roi.toFixed(1)}%)</span>
                                    </div>
                                </div>
                                <div className="p-3 sm:p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50">
                                    <div className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Lump Sum</div>
                                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
                                        <span className="sm:hidden">{formatCompact(lumpSumResult.currentValue)}</span>
                                        <span className="hidden sm:inline">{formatCurrency(lumpSumResult.currentValue)}</span>
                                    </div>
                                    <div className={clsx("text-xs sm:text-sm mt-1 truncate tabular-nums", lumpSumResult.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                        <span className="sm:hidden">{lumpSumResult.profit >= 0 ? '+' : '-'}{formatCompact(Math.abs(lumpSumResult.profit))} ({lumpSumResult.roi.toFixed(1)}%)</span>
                                        <span className="hidden sm:inline">{lumpSumResult.profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(lumpSumResult.profit))} ({lumpSumResult.roi.toFixed(1)}%)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Asset Comparison */}
                    {priceMode === 'api' && (
                        <AssetComparison btcResult={btcAssetResult} sp500Result={sp500Result} goldResult={goldResult} loading={comparisonLoading} />
                    )}

                    {/* Exchange Fee Comparison */}
                    <ExchangeFeeComparison totalInvested={results.totalInvested} purchaseCount={purchaseCount} />

                    {/* Savings Account Comparison */}
                    <SavingsComparison
                        totalInvested={results.totalInvested}
                        btcCurrentValue={results.currentValue}
                        btcRoi={results.roi}
                        amount={amountUsd}
                        frequency={frequency}
                        startDate={startDate}
                        endDate={endDate}
                    />

                    {/* Opportunity Cost Calculator */}
                    {priceMode === 'api' && priceData.length > 0 && livePrice && (
                        <OpportunityCostCalculator priceData={priceData} livePrice={livePrice} />
                    )}

                    {/* Chart */}
                    <DcaChart data={results.breakdown} unit={unit} />

                    {/* Ad Slot (after the chart — never between the form and its results) */}
                    <AdSlot className="min-h-[100px] flex justify-center" />

                    {/* Transaction Table */}
                    <TransactionTable breakdown={results.breakdown} unit={unit} />

                    {/* Plan-vs-plan comparison */}
                    {priceMode === 'api' && !dateError && (
                        <PlanComparison
                            basePlan={{
                                amountUsd,
                                frequency,
                                startDate,
                                endDate,
                                feePercentage: deferredFee,
                                provider,
                            }}
                        />
                    )}

                    {/* Price Prediction */}
                    <PricePredictionScenario btcAmount={results.btcAccumulated} totalInvested={results.totalInvested} />

                    {/* Stacking Goals */}
                    <StackingGoalTracker
                        btcAccumulated={results.btcAccumulated}
                        totalInvested={results.totalInvested}
                        purchaseCount={purchaseCount}
                        startDate={startDate}
                        endDate={endDate}
                        amount={amountUsd}
                        frequency={frequency}
                        unit={unit}
                    />

                    {/* Unit Bias Calculator */}
                    <UnitBiasCalculator btcAccumulated={results.btcAccumulated} />

                    {/* Share My Stack */}
                    <ShareMyStack
                        totalInvested={results.totalInvested}
                        currentValue={results.currentValue}
                        roi={results.roi}
                        btcAccumulated={results.btcAccumulated}
                        unit={unit}
                        startDate={startDate}
                        endDate={endDate}
                    />

                    {/* FIRE Calculator */}
                    <FireCalculator
                        btcAccumulated={results.btcAccumulated}
                        totalInvested={results.totalInvested}
                        livePrice={livePrice}
                        amount={amountUsd}
                        frequency={frequency}
                    />

                    {/* Cost Basis Tracker */}
                    <CostBasisTracker
                        priceData={priceData}
                        livePrice={livePrice}
                        priceMode={priceMode}
                    />
                </>
            )}

            {/* Mid-content Ad */}
            <AdSlot className="min-h-[100px] flex justify-center" />
        </div>
    );
};

interface AnimatedResultCardProps {
    label: string;
    /** Raw numeric value — animated with useCountUp, then formatted. */
    value: number;
    format: (n: number) => string;
    /** Compact formatter used below the sm breakpoint (replaces truncation). */
    formatShort?: (n: number) => string;
    subValue?: string;
    celebrated?: boolean;
    valueClassName?: string;
    icon?: React.ReactNode;
    subValueClassName?: string;
    action?: React.ReactNode;
}

const ResultCard = ({ label, value, format, formatShort, subValue, celebrated, valueClassName, icon, subValueClassName, action }: AnimatedResultCardProps) => {
    const animated = useCountUp(value);
    return (
        <Card celebrated={celebrated} className="p-3 sm:p-5">
            <div className="flex justify-between items-start gap-1 mb-1">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">{label}</div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
                <div className={clsx("text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 min-w-0", valueClassName)}>
                    {formatShort ? (
                        <>
                            <span className="sm:hidden">{formatShort(animated)}</span>
                            <span className="hidden sm:inline">{format(animated)}</span>
                        </>
                    ) : format(animated)}
                </div>
                {icon}
            </div>
            {subValue && <div className={clsx("text-[11px] sm:text-sm mt-0.5 sm:mt-1", subValueClassName || "text-slate-500 dark:text-slate-400")}>{subValue}</div>}
        </Card>
    );
};

const StatsStrip = memo(function StatsStrip({ stats }: { stats: DcaStats }) {
    const { formatCurrency } = useCurrency();
    const xirr = stats.xirrPercent;
    const labelClass = "text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5";
    const valueClass = "text-sm sm:text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100";
    return (
        <Card className="p-4 sm:p-5 fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                <div>
                    <div className={labelClass}>Annualized return (XIRR)</div>
                    <div className={clsx(
                        "text-sm sm:text-base font-semibold tabular-nums",
                        xirr === null
                            ? "text-slate-500 dark:text-slate-400"
                            : xirr >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    )}>
                        {xirr === null ? '—' : `${xirr >= 0 ? '+' : ''}${xirr.toFixed(1)}%`}
                    </div>
                </div>
                <div>
                    <div className={labelClass}>Max drawdown</div>
                    <div className={valueClass}>
                        {stats.maxDrawdownPercent > 0 ? `-${stats.maxDrawdownPercent.toFixed(1)}%` : '0%'}
                    </div>
                </div>
                <div>
                    <div className={labelClass}>Best buy</div>
                    <div className={valueClass}>{stats.bestBuy ? formatCurrency(stats.bestBuy.price) : '—'}</div>
                    {stats.bestBuy && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{formatUtc(stats.bestBuy.date, 'full')}</div>
                    )}
                </div>
                <div>
                    <div className={labelClass}>Fees paid</div>
                    <div className={valueClass}>{formatCurrency(stats.feesPaid, 2)}</div>
                </div>
            </div>
        </Card>
    );
});

const ProfitableWindows = memo(function ProfitableWindows({ frequency, startDate, endDate }: { frequency: Frequency; startDate: string; endDate: string }) {
    const [data, setData] = useState<{ profitablePercent: number; windowCount: number; durationDays: number } | null>(null);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            const startTs = parseUtcDate(startDate);
            const endTs = Math.min(parseUtcDate(endDate), Date.now());
            const durationDays = Math.round((endTs - startTs) / DAY_MS);
            if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs || durationDays < 90) {
                if (!cancelled) setData(null);
                return;
            }
            try {
                const result = await getProfitableWindows(frequency, durationDays);
                if (!cancelled) setData(result);
            } catch {
                if (!cancelled) setData(null);
            }
        }, 800);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [frequency, startDate, endDate]);

    if (!data) return null;
    const months = Math.round(data.durationDays / 30);
    return (
        <p className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 fade-in">
            Historically,{' '}
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {data.profitablePercent.toFixed(0)}%
            </span>{' '}
            of all {months}-month {frequency} DCA windows since 2010 ended in profit
            <span className="text-slate-400 dark:text-slate-500"> · {data.windowCount.toLocaleString('en-US')} windows, before fees</span>
        </p>
    );
});

const PricePredictionScenario = memo(function PricePredictionScenario({ btcAmount, totalInvested }: { btcAmount: number; totalInvested: number }) {
    const { currencyConfig, formatCurrency, formatCompact } = useCurrency();
    // Entered in the selected display currency; converted to USD before the math.
    const [targetPrice, setTargetPrice] = useState<number>(() => roundTo2Sig(100_000 * currencyConfig.rate));

    // Re-denominate the entered target when the display currency changes so the
    // same USD scenario is preserved (a JPY user shouldn't inherit a $-shaped number).
    const prevCurrencyRef = useRef({ code: currencyConfig.code, rate: currencyConfig.rate });
    useEffect(() => {
        const prev = prevCurrencyRef.current;
        if (prev.code !== currencyConfig.code && prev.rate > 0) {
            setTargetPrice(p => roundTo2Sig((p / prev.rate) * currencyConfig.rate));
        }
        prevCurrencyRef.current = { code: currencyConfig.code, rate: currencyConfig.rate };
    }, [currencyConfig.code, currencyConfig.rate]);

    const targetPriceUsd = currencyConfig.rate > 0 ? targetPrice / currencyConfig.rate : targetPrice;
    const projectedValue = btcAmount * targetPriceUsd;
    const projectedProfit = projectedValue - totalInvested;
    const multiplier = totalInvested > 0 ? projectedValue / totalInvested : 0;

    const quickTargets = useMemo(
        () => [100_000, 150_000, 250_000, 500_000, 1_000_000].map(usd => roundTo2Sig(usd * currencyConfig.rate)),
        [currencyConfig.rate]
    );

    const chipLabel = (v: number): string => {
        const sym = currencyConfig.symbol;
        if (v >= 1_000_000) {
            const m = v / 1_000_000;
            return `${sym}${Number.isInteger(m) ? m : m.toFixed(1)}M`;
        }
        if (v >= 1_000) {
            const k = v / 1_000;
            return `${sym}${Number.isInteger(k) ? k : k.toFixed(1)}k`;
        }
        return `${sym}${v.toLocaleString()}`;
    };

    return (
        <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-white p-4 sm:p-6 rounded-2xl shadow-sm dark:shadow-lg border border-slate-200 dark:border-slate-700">
            <h3 className="text-base sm:text-xl font-bold mb-3 sm:mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                Price Prediction
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 items-center">
                <div className="space-y-3">
                    <label htmlFor="prediction-target" className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">If Bitcoin Price Hits... ({currencyConfig.code})</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">{currencyConfig.symbol}</span>
                        <input
                            id="prediction-target"
                            type="number"
                            inputMode="decimal"
                            value={targetPrice}
                            onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value)))}
                            onFocus={(e) => e.target.select()}
                            className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-lg font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Quick target prices">
                        {quickTargets.map((price, i) => (
                            <button
                                key={`${price}-${i}`}
                                type="button"
                                onClick={() => setTargetPrice(price)}
                                aria-pressed={targetPrice === price}
                                className={clsx(
                                    "px-2.5 py-1.5 text-[11px] sm:text-xs font-medium rounded-full transition-colors",
                                    targetPrice === price
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                        : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700/80 dark:hover:bg-slate-600 dark:text-slate-300"
                                )}
                            >
                                {chipLabel(price)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700/50">
                    <div className="flex justify-between items-end border-b border-slate-200 dark:border-slate-700 pb-3">
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Portfolio Value</span>
                        <span className="text-xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 ml-2">
                            <span className="sm:hidden">{formatCompact(projectedValue)}</span>
                            <span className="hidden sm:inline">{formatCurrency(projectedValue)}</span>
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Profit</span>
                        <span className={clsx("text-sm sm:text-lg font-semibold ml-2 tabular-nums", projectedProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                            <span className="sm:hidden">{projectedProfit >= 0 ? '+' : ''}{formatCompact(projectedProfit)}</span>
                            <span className="hidden sm:inline">{projectedProfit >= 0 ? '+' : ''}{formatCurrency(projectedProfit)}</span>
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Multiplier</span>
                        <span className="text-xs sm:text-sm font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded tabular-nums">{multiplier.toFixed(1)}x</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

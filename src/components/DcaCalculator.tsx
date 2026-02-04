'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, subYears, subMonths, startOfToday, differenceInMonths } from 'date-fns';
import { Frequency, PriceMode, ResultCardProps, AssetDcaResult, CurrencyCode, CurrencyConfig } from '@/types';
import { calculateDca, calculateLumpSum, calculateAssetDca } from '@/utils/dca';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice, getAssetPriceHistory, getCpiData, getM2Data } from '@/app/actions';
import { generateCsvContent, downloadCsv } from '@/utils/csv';
import { encodeParams, decodeParams } from '@/utils/urlParams';
import dynamic from 'next/dynamic';
import { SkeletonCard, SkeletonChart } from './Skeleton';
import { AdSlot } from './AdSlot';

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
const FutureProjection = dynamic(() => import('./FutureProjection').then(m => m.FutureProjection));
import { TrendingUp, TrendingDown, DollarSign, Activity, Repeat, Download, Share2 } from 'lucide-react';
import clsx from 'clsx';

const CURRENCIES: CurrencyConfig[] = [
    { code: 'USD', symbol: '$', rate: 1, label: 'USD ($)' },
    { code: 'EUR', symbol: '€', rate: 0.92, label: 'EUR (€)' },
    { code: 'GBP', symbol: '£', rate: 0.79, label: 'GBP (£)' },
    { code: 'CAD', symbol: 'C$', rate: 1.36, label: 'CAD (C$)' },
    { code: 'AUD', symbol: 'A$', rate: 1.53, label: 'AUD (A$)' },
    { code: 'JPY', symbol: '¥', rate: 149.5, label: 'JPY (¥)' },
];

const formatCurrency = (usdValue: number, config: CurrencyConfig): string => {
    const converted = usdValue * config.rate;
    if (config.code === 'JPY') {
        return `${config.symbol}${Math.round(converted).toLocaleString()}`;
    }
    return `${config.symbol}${converted.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

type Preset = { label: string; amount: number; frequency: Frequency; yearsBack?: number; monthsBack?: number; startDate?: string };

const PRESET_GROUPS: { title: string; presets: Preset[] }[] = [
    {
        title: 'Quick scenarios',
        presets: [
            { label: '$50/week for 5 years', amount: 50, frequency: 'weekly', yearsBack: 5 },
            { label: '$100/week for 3 years', amount: 100, frequency: 'weekly', yearsBack: 3 },
            { label: '$200/month for 1 year', amount: 200, frequency: 'monthly', yearsBack: 1 },
            { label: '$25/week since 2013', amount: 25, frequency: 'weekly', startDate: '2013-01-01' },
        ],
    },
    {
        title: 'What if I bought the peak?',
        presets: [
            { label: '$50/week from 2013 peak', amount: 50, frequency: 'weekly', startDate: '2013-12-04' },
            { label: '$50/week from 2017 peak', amount: 50, frequency: 'weekly', startDate: '2017-12-17' },
            { label: '$50/week from 2021 peak', amount: 50, frequency: 'weekly', startDate: '2021-11-10' },
        ],
    },
];

export const DcaCalculator = () => {
    const [today, setToday] = useState(() => startOfToday());
    const oneYearAgo = subYears(today, 1);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = startOfToday();
            if (now.getTime() !== today.getTime()) {
                setToday(now);
            }
        }, 60_000);
        return () => clearInterval(interval);
    }, [today]);

    const [amount, setAmount] = useState<number>(100);
    const [frequency, setFrequency] = useState<Frequency>('weekly');
    const [startDate, setStartDate] = useState<string>(format(oneYearAgo, 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState<string>(format(today, 'yyyy-MM-dd'));
    const [feePercentage, setFeePercentage] = useState<number>(0.5);
    const [priceMode, setPriceMode] = useState<PriceMode>('api');
    const [manualPrice, setManualPrice] = useState<number>(50000);
    const [provider, setProvider] = useState<'kraken' | 'coinbase'>('kraken');
    const [unit, setUnit] = useState<'BTC' | 'SATS'>('BTC');
    const [priceData, setPriceData] = useState<[number, number][]>([]);
    const [livePrice, setLivePrice] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shareMessage, setShareMessage] = useState<string | null>(null);
    const [sp500Data, setSp500Data] = useState<[number, number][] | null>(null);
    const [goldData, setGoldData] = useState<[number, number][] | null>(null);
    const [comparisonLoading, setComparisonLoading] = useState(false);
    const [cpiData, setCpiData] = useState<[number, number][] | null>(null);
    const [currency, setCurrency] = useState<CurrencyCode>('USD');
    const [m2Data, setM2Data] = useState<[number, number][] | null>(null);

    const currencyConfig = useMemo(() => CURRENCIES.find(c => c.code === currency) || CURRENCIES[0], [currency]);

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

    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        const params = decodeParams(Object.fromEntries(sp.entries()));
        if (params) {
            if (params.amount !== undefined) setAmount(params.amount);
            if (params.frequency) setFrequency(params.frequency);
            if (params.startDate) setStartDate(params.startDate);
            if (params.endDate) setEndDate(params.endDate);
            if (params.feePercentage !== undefined) setFeePercentage(params.feePercentage);
            if (params.priceMode) setPriceMode(params.priceMode);
            if (params.provider) setProvider(params.provider);
            if (params.manualPrice !== undefined) setManualPrice(params.manualPrice);
        }
    }, []);

    const dateError = useMemo(() => {
        if (startDate && endDate && startDate > endDate) return 'Start date must be before end date';
        return null;
    }, [startDate, endDate]);

    useEffect(() => {
        if (priceMode !== 'api' || dateError) return;
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
                setPriceData(history);
                setLivePrice(current);
            } catch {
                setError(`Failed to fetch live prices from ${provider}. Switched to manual mode.`);
            } finally {
                setLoading(false);
            }
        };
        const timer = setTimeout(fetchPrices, 500);
        return () => clearTimeout(timer);
    }, [startDate, endDate, priceMode, provider, dateError]);

    useEffect(() => {
        if (priceMode !== 'api' || dateError) {
            setSp500Data(null);
            setGoldData(null);
            setCpiData(null);
            setM2Data(null);
            return;
        }
        const fetchComparison = async () => {
            setComparisonLoading(true);
            try {
                const startTs = new Date(startDate).getTime();
                const endTs = new Date(endDate).getTime() + 86400000;
                const [sp500, gold, cpi, m2] = await Promise.all([
                    getAssetPriceHistory('^GSPC', startTs, endTs),
                    getAssetPriceHistory('GC=F', startTs, endTs),
                    getCpiData(startTs, endTs),
                    getM2Data(startTs, endTs),
                ]);
                setSp500Data(sp500);
                setGoldData(gold);
                setCpiData(cpi);
                setM2Data(m2);
            } catch {
                setSp500Data(null);
                setGoldData(null);
                setCpiData(null);
                setM2Data(null);
            } finally {
                setComparisonLoading(false);
            }
        };
        const timer = setTimeout(fetchComparison, 600);
        return () => clearTimeout(timer);
    }, [startDate, endDate, priceMode, dateError]);

    const amountUsd = useMemo(() => amount / currencyConfig.rate, [amount, currencyConfig.rate]);

    const results = useMemo(() => {
        if (dateError) {
            return { totalInvested: 0, btcAccumulated: 0, averageCost: 0, currentValue: 0, profit: 0, roi: 0, breakdown: [] };
        }
        return calculateDca({ amount: amountUsd, frequency, startDate: new Date(startDate), endDate: new Date(endDate), feePercentage, priceMode, manualPrice }, priceData, priceMode === 'api' ? livePrice : undefined);
    }, [amountUsd, frequency, startDate, endDate, feePercentage, priceMode, manualPrice, priceData, livePrice, dateError]);

    const lumpSumResult = useMemo(() => {
        if (priceMode !== 'api' || !priceData.length || !livePrice || dateError) return null;
        return calculateLumpSum(results.totalInvested, new Date(startDate), priceData, livePrice);
    }, [priceMode, priceData, livePrice, results.totalInvested, startDate, dateError]);

    const sp500Result: AssetDcaResult | null = useMemo(() => {
        if (!sp500Data) return null;
        return calculateAssetDca(amountUsd, frequency, new Date(startDate), new Date(endDate), feePercentage, sp500Data, '^GSPC', 'S&P 500');
    }, [sp500Data, amountUsd, frequency, startDate, endDate, feePercentage]);

    const goldResult: AssetDcaResult | null = useMemo(() => {
        if (!goldData) return null;
        return calculateAssetDca(amountUsd, frequency, new Date(startDate), new Date(endDate), feePercentage, goldData, 'GC=F', 'Gold');
    }, [goldData, amountUsd, frequency, startDate, endDate, feePercentage]);

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
    const isFutureEndDate = new Date(endDate) > today;

    const handleExportCsv = useCallback(() => {
        if (results.breakdown.length === 0) return;
        const csv = generateCsvContent(results.breakdown);
        downloadCsv(csv, `bitcoin-dca-${startDate}-to-${endDate}.csv`);
    }, [results.breakdown, startDate, endDate]);

    const handleShare = useCallback(async () => {
        const paramStr = encodeParams({ amount, frequency, startDate, endDate, feePercentage, priceMode, provider, manualPrice });
        const url = `${window.location.origin}${window.location.pathname}?${paramStr}`;
        try {
            await navigator.clipboard.writeText(url);
            setShareMessage('Link copied to clipboard!');
            setTimeout(() => setShareMessage(null), 2000);
        } catch {
            setShareMessage('Failed to copy link');
            setTimeout(() => setShareMessage(null), 2000);
        }
    }, [amount, frequency, startDate, endDate, feePercentage, priceMode, provider, manualPrice]);

    const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.min(50, Math.max(0, Number(e.target.value)));
        setFeePercentage(val);
    };

    const profitPrefix = results.profit >= 0 ? '+' : '-';

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
                    {PRESET_GROUPS.map((group) => (
                        <div key={group.title}>
                            <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                {group.title}
                            </div>
                            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                {group.presets.map((preset) => (
                                    <button
                                        key={preset.label}
                                        onClick={() => applyPreset(preset)}
                                        className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200/60 dark:border-amber-800/40 transition-colors"
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
                        <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Amount ({currencyConfig.code})</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-sm">{currencyConfig.symbol}</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                                className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Frequency */}
                    <div className="space-y-1.5">
                        <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Frequency</label>
                        <select
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as Frequency)}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all"
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Bi-weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </div>

                    {/* Fee */}
                    <div className="space-y-1.5">
                        <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Fee (%)</label>
                        <input
                            type="number"
                            step="0.1"
                            min={0}
                            max={50}
                            value={feePercentage}
                            onChange={handleFeeChange}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all"
                        />
                    </div>

                    {/* Currency */}
                    <div className="space-y-1.5">
                        <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Currency</label>
                        <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all"
                        >
                            {CURRENCIES.map(c => (
                                <option key={c.code} value={c.code}>{c.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Start Date */}
                    <div className="space-y-1.5 min-w-0 overflow-hidden">
                        <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className={clsx(
                                "w-full max-w-full box-border px-2 sm:px-3 py-2 text-sm rounded-lg border bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all min-h-[38px]",
                                dateError ? "border-red-400 dark:border-red-600" : "border-slate-200 dark:border-slate-700"
                            )}
                        />
                    </div>

                    {/* End Date */}
                    <div className="space-y-1.5 min-w-0 overflow-hidden">
                        <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className={clsx(
                                "w-full max-w-full box-border px-2 sm:px-3 py-2 text-sm rounded-lg border bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all min-h-[38px]",
                                dateError ? "border-red-400 dark:border-red-600" : "border-slate-200 dark:border-slate-700"
                            )}
                        />
                        {dateError && <p className="text-xs text-red-500">{dateError}</p>}
                    </div>

                    {/* Price Mode + Provider */}
                    <div className="space-y-3 sm:col-span-2 lg:col-span-1">
                        <div className="space-y-1.5">
                            <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Price Mode</label>
                            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                                <button
                                    onClick={() => setPriceMode('api')}
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
                                    onClick={() => setPriceMode('manual')}
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
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Data Source</label>
                                <select
                                    value={provider}
                                    onChange={(e) => setProvider(e.target.value as 'kraken' | 'coinbase')}
                                    className="w-full text-xs sm:text-sm px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:border-amber-500 transition-all"
                                >
                                    <option value="kraken">Kraken</option>
                                    <option value="coinbase">Coinbase</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {priceMode === 'manual' && (
                        <div className="space-y-1.5 fade-in sm:col-span-2 lg:col-span-1">
                            <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Avg. BTC Price</label>
                            <input
                                type="number"
                                value={manualPrice}
                                onChange={(e) => setManualPrice(Math.max(0, Number(e.target.value)))}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all"
                            />
                        </div>
                    )}
                </div>

                {/* Footer bar */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm text-slate-500">Projected</span>
                        <span className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">{formatCurrency(results.totalInvested, currencyConfig)}</span>
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
                {shareMessage && <div className="mt-2 text-xs sm:text-sm text-green-600 dark:text-green-400 fade-in">{shareMessage}</div>}
                {error && <div className="mt-3 text-xs sm:text-sm text-red-500 fade-in">{error}</div>}
            </div>

            {/* Ad Slot */}
            <AdSlot className="min-h-[100px] flex justify-center" />

            {/* Loading / Results */}
            {loading ? (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                    <SkeletonChart />
                </>
            ) : (
                <>
                    {/* Result Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        <ResultCard
                            label={isFutureEndDate ? "Total to Invest" : "Total Invested"}
                            value={formatCurrency(results.totalInvested, currencyConfig)}
                        />
                        <ResultCard
                            label={unit === 'BTC' ? (isFutureEndDate ? "BTC to Accumulate" : "BTC Accumulated") : (isFutureEndDate ? "Sats to Accumulate" : "Sats Accumulated")}
                            value={unit === 'BTC'
                                ? `${results.btcAccumulated.toFixed(8)} ₿`
                                : `${Math.floor(results.btcAccumulated * 100_000_000).toLocaleString()} sats`
                            }
                            subValue={isFutureEndDate ? "at current prices" : `Avg: ${formatCurrency(results.averageCost, currencyConfig)}`}
                            action={
                                <button
                                    onClick={() => setUnit(prev => prev === 'BTC' ? 'SATS' : 'BTC')}
                                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                    title={`Switch to ${unit === 'BTC' ? 'Sats' : 'BTC'}`}
                                >
                                    <Repeat className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                </button>
                            }
                        />
                        <ResultCard
                            label={isFutureEndDate ? "Value at Current Price" : "Current Value"}
                            value={formatCurrency(results.currentValue, currencyConfig)}
                            subValue={priceMode === 'api' && livePrice ? `@ ${formatCurrency(livePrice, currencyConfig)}` : undefined}
                            subValueColor="text-amber-600 dark:text-amber-400 font-medium"
                            highlight={true}
                            icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />}
                        />
                        <ResultCard
                            label={isFutureEndDate ? "Projected Gain" : "Profit / Loss"}
                            value={`${profitPrefix}${formatCurrency(Math.abs(results.profit), currencyConfig)}`}
                            valueColor={isProfit ? 'text-green-500' : 'text-red-500'}
                            icon={isProfit ? <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0" /> : <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />}
                            subValue={isFutureEndDate ? "if price stays same" : `${results.roi.toFixed(1)}% ROI`}
                            subValueColor={isProfit ? 'text-green-600' : 'text-red-600'}
                        />
                    </div>

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
                            {new Date(endDate) > today ? (
                                <>
                                    If you invest {currencyConfig.symbol}{amount.toLocaleString()} every {frequency === 'daily' ? 'day' : frequency === 'biweekly' ? 'two weeks' : frequency.replace('ly', '')} from{' '}
                                    {format(new Date(startDate), 'MMM yyyy')} to {format(new Date(endDate), 'MMM yyyy')}, you will spend{' '}
                                    {formatCurrency(results.totalInvested, currencyConfig)} and accumulate{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{results.btcAccumulated < 1 ? results.btcAccumulated.toFixed(6) : results.btcAccumulated.toFixed(4)} BTC</span>{' '}
                                    (at current prices: {formatCurrency(results.currentValue, currencyConfig)}).
                                </>
                            ) : (
                                <>
                                    If you had invested {currencyConfig.symbol}{amount.toLocaleString()} every {frequency === 'daily' ? 'day' : frequency === 'biweekly' ? 'two weeks' : frequency.replace('ly', '')} from{' '}
                                    {format(new Date(startDate), 'MMM yyyy')} to {format(new Date(endDate), 'MMM yyyy')}, you would have spent{' '}
                                    {formatCurrency(results.totalInvested, currencyConfig)} and your Bitcoin would now be worth{' '}
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{formatCurrency(results.currentValue, currencyConfig)}</span>{' '}
                                    &mdash; a <span className={clsx("font-medium", isProfit ? "text-green-600 dark:text-green-400" : "text-red-500")}>{results.roi.toFixed(1)}% return</span>.
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
                            feePercentage={feePercentage}
                            currentPrice={livePrice}
                            currentBtc={results.btcAccumulated}
                            currentInvested={results.totalInvested}
                        />
                    )}

                    {/* Inflation-Adjusted Returns */}
                    {inflationStats && (
                        <div className="bg-white dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 rounded-xl border border-slate-200 dark:border-slate-800 fade-in">
                            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center text-xs sm:text-sm">
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Real Value</div>
                                    <div className="font-semibold text-slate-800 dark:text-white">
                                        {formatCurrency(inflationStats.adjustedValue, currencyConfig)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Real ROI</div>
                                    <div className={clsx("font-semibold", inflationStats.adjustedRoi >= 0 ? "text-green-600" : "text-red-600")}>
                                        {inflationStats.adjustedRoi.toFixed(1)}%
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Inflation</div>
                                    <div className="font-semibold text-red-500">
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
                                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(results.currentValue, currencyConfig)}</div>
                                    <div className={clsx("text-xs sm:text-sm mt-1", results.profit >= 0 ? "text-green-600" : "text-red-600")}>
                                        {results.profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(results.profit), currencyConfig)} ({results.roi.toFixed(1)}%)
                                    </div>
                                </div>
                                <div className="p-3 sm:p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50">
                                    <div className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Lump Sum</div>
                                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(lumpSumResult.currentValue, currencyConfig)}</div>
                                    <div className={clsx("text-xs sm:text-sm mt-1", lumpSumResult.profit >= 0 ? "text-green-600" : "text-red-600")}>
                                        {lumpSumResult.profit >= 0 ? '+' : '-'}{formatCurrency(Math.abs(lumpSumResult.profit), currencyConfig)} ({lumpSumResult.roi.toFixed(1)}%)
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
                    <DcaChart data={results.breakdown} unit={unit} m2Data={m2Data} />

                    {/* Transaction Table */}
                    <TransactionTable breakdown={results.breakdown} unit={unit} />

                    {/* Price Prediction */}
                    <PricePredictionScenario btcAmount={results.btcAccumulated} totalInvested={results.totalInvested} />

                    {/* Stacking Goals */}
                    <StackingGoalTracker
                        btcAccumulated={results.btcAccumulated}
                        totalInvested={results.totalInvested}
                        purchaseCount={purchaseCount}
                        startDate={startDate}
                        endDate={endDate}
                        amount={amount}
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
            <AdSlot unitId="2426252" className="min-h-[100px] flex justify-center" />
        </div>
    );
};

const ResultCard = ({ label, value, subValue, highlight, valueColor, icon, subValueColor, action }: ResultCardProps) => (
    <div className={clsx(
        "p-3 sm:p-5 rounded-xl border transition-all",
        highlight
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50"
            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
    )}>
        <div className="flex justify-between items-start mb-1">
            <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-tight">{label}</div>
            {action && <div>{action}</div>}
        </div>
        <div className="flex items-center gap-1.5">
            <div className={clsx("text-base sm:text-2xl font-bold text-slate-900 dark:text-slate-100 truncate", valueColor)}>{value}</div>
            {icon}
        </div>
        {subValue && <div className={clsx("text-[11px] sm:text-sm mt-0.5 sm:mt-1 truncate", subValueColor || "text-slate-500 dark:text-slate-400")}>{subValue}</div>}
    </div>
);

const PricePredictionScenario = ({ btcAmount, totalInvested }: { btcAmount: number, totalInvested: number }) => {
    const [targetPrice, setTargetPrice] = useState<number>(100000);

    const projectedValue = btcAmount * targetPrice;
    const projectedProfit = projectedValue - totalInvested;
    const multiplier = totalInvested > 0 ? projectedValue / totalInvested : 0;

    return (
        <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-white p-4 sm:p-6 rounded-2xl shadow-sm dark:shadow-lg border border-slate-200 dark:border-slate-700">
            <h3 className="text-base sm:text-xl font-bold mb-3 sm:mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400 shrink-0" />
                Price Prediction
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 items-center">
                <div className="space-y-3">
                    <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">If Bitcoin Price Hits...</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">$</span>
                        <input
                            type="number"
                            value={targetPrice}
                            onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value)))}
                            className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-lg font-bold focus:ring-2 focus:ring-green-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                        {[100000, 150000, 250000, 500000, 1000000].map(price => (
                            <button
                                key={price}
                                onClick={() => setTargetPrice(price)}
                                className="px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700/80 dark:hover:bg-slate-600 dark:text-slate-300 transition-colors"
                            >
                                ${price >= 1000000 ? `${price / 1000000}M` : `${price / 1000}k`}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-700/50">
                    <div className="flex justify-between items-end border-b border-slate-200 dark:border-slate-700 pb-3">
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Portfolio Value</span>
                        <span className="text-xl sm:text-3xl font-bold text-green-600 dark:text-green-400">${projectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Profit</span>
                        <span className={clsx("text-sm sm:text-lg font-semibold", projectedProfit >= 0 ? "text-green-600 dark:text-green-300" : "text-red-500 dark:text-red-400")}>
                            {projectedProfit >= 0 ? '+' : ''}${projectedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Multiplier</span>
                        <span className="text-xs sm:text-sm font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded">{multiplier.toFixed(1)}x</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

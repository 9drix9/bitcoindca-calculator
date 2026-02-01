'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, subYears, subMonths, startOfToday, differenceInMonths } from 'date-fns';
import { Frequency, PriceMode, ResultCardProps, AssetDcaResult } from '@/types';
import { calculateDca, calculateLumpSum, calculateAssetDca } from '@/utils/dca';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice, getAssetPriceHistory, getCpiData } from '@/app/actions';
import { generateCsvContent, downloadCsv } from '@/utils/csv';
import { encodeParams, decodeParams } from '@/utils/urlParams';
import { DcaChart } from './DcaChart';
import { TransactionTable } from './TransactionTable';
import { AssetComparison } from './AssetComparison';
import { ExchangeFeeComparison } from './ExchangeFeeComparison';
import { StackingGoalTracker } from './StackingGoalTracker';
import { ShareMyStack } from './ShareMyStack';
import { SkeletonCard, SkeletonChart } from './Skeleton';
import { AdSlot } from './AdSlot';
import { TrendingUp, TrendingDown, DollarSign, Activity, Repeat, Download, Share2 } from 'lucide-react';
import clsx from 'clsx';

const BTC_MAX_SUPPLY = 21_000_000;

const PRESETS: { label: string; amount: number; frequency: Frequency; yearsBack?: number; monthsBack?: number; startDate?: string }[] = [
    { label: '5Y $50/week', amount: 50, frequency: 'weekly', yearsBack: 5 },
    { label: '3Y $100/week', amount: 100, frequency: 'weekly', yearsBack: 3 },
    { label: '1Y $200/month', amount: 200, frequency: 'monthly', yearsBack: 1 },
    { label: 'Since 2013 $25/week', amount: 25, frequency: 'weekly', startDate: '2013-01-01' },
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

    const applyPreset = useCallback((preset: typeof PRESETS[number]) => {
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
            } catch (err) {
                console.error(err);
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
            return;
        }
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
                setSp500Data(sp500);
                setGoldData(gold);
                setCpiData(cpi);
            } catch {
                setSp500Data(null);
                setGoldData(null);
                setCpiData(null);
            } finally {
                setComparisonLoading(false);
            }
        };
        const timer = setTimeout(fetchComparison, 600);
        return () => clearTimeout(timer);
    }, [startDate, endDate, priceMode, dateError]);

    const results = useMemo(() => {
        if (dateError) {
            return { totalInvested: 0, btcAccumulated: 0, averageCost: 0, currentValue: 0, profit: 0, roi: 0, breakdown: [] };
        }
        return calculateDca({ amount, frequency, startDate: new Date(startDate), endDate: new Date(endDate), feePercentage, priceMode, manualPrice }, priceData, priceMode === 'api' ? livePrice : undefined);
    }, [amount, frequency, startDate, endDate, feePercentage, priceMode, manualPrice, priceData, livePrice, dateError]);

    const lumpSumResult = useMemo(() => {
        if (priceMode !== 'api' || !priceData.length || !livePrice || dateError) return null;
        return calculateLumpSum(results.totalInvested, new Date(startDate), priceData, livePrice);
    }, [priceMode, priceData, livePrice, results.totalInvested, startDate, dateError]);

    const sp500Result: AssetDcaResult | null = useMemo(() => {
        if (!sp500Data) return null;
        return calculateAssetDca(amount, frequency, new Date(startDate), new Date(endDate), feePercentage, sp500Data, '^GSPC', 'S&P 500');
    }, [sp500Data, amount, frequency, startDate, endDate, feePercentage]);

    const goldResult: AssetDcaResult | null = useMemo(() => {
        if (!goldData) return null;
        return calculateAssetDca(amount, frequency, new Date(startDate), new Date(endDate), feePercentage, goldData, 'GC=F', 'Gold');
    }, [goldData, amount, frequency, startDate, endDate, feePercentage]);

    const btcAssetResult: AssetDcaResult = useMemo(() => ({
        asset: 'BTC', label: 'Bitcoin', totalInvested: results.totalInvested, currentValue: results.currentValue,
        profit: results.profit, roi: results.roi,
        breakdown: results.breakdown.map(b => ({ date: b.date, portfolioValue: b.portfolioValue })),
    }), [results]);

    const ownershipPercent = useMemo(() => {
        if (results.btcAccumulated <= 0) return null;
        return (results.btcAccumulated / BTC_MAX_SUPPLY) * 100;
    }, [results.btcAccumulated]);

    const oneInEvery = useMemo(() => {
        if (!ownershipPercent || ownershipPercent <= 0) return null;
        return Math.round(BTC_MAX_SUPPLY / results.btcAccumulated);
    }, [ownershipPercent, results.btcAccumulated]);

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
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-5 sm:mb-6">
                    {PRESETS.map((preset) => (
                        <button
                            key={preset.label}
                            onClick={() => applyPreset(preset)}
                            className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200/60 dark:border-amber-800/40 transition-colors"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 overflow-hidden">
                    {/* Amount */}
                    <div className="space-y-1.5">
                        <label className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">Amount (USD)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
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
                        <span className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">${results.totalInvested.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleShare}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            title="Share calculator settings"
                            aria-label="Share calculator settings"
                        >
                            <Share2 className="w-4 h-4" />
                        </button>
                        {results.breakdown.length > 0 && (
                            <button
                                onClick={handleExportCsv}
                                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
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
            <AdSlot slotId="replace-with-slot-1" className="min-h-[100px] flex justify-center" />

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
                        <ResultCard label="Total Invested" value={`$${results.totalInvested.toLocaleString()}`} />
                        <ResultCard
                            label={unit === 'BTC' ? "BTC Accumulated" : "Sats Accumulated"}
                            value={unit === 'BTC'
                                ? `${results.btcAccumulated.toFixed(8)} ₿`
                                : `${Math.floor(results.btcAccumulated * 100_000_000).toLocaleString()} sats`
                            }
                            subValue={`Avg: $${results.averageCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                            action={
                                <button
                                    onClick={() => setUnit(prev => prev === 'BTC' ? 'SATS' : 'BTC')}
                                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                    title={`Switch to ${unit === 'BTC' ? 'Sats' : 'BTC'}`}
                                >
                                    <Repeat className="w-3.5 h-3.5 text-slate-400" />
                                </button>
                            }
                        />
                        <ResultCard
                            label="Current Value"
                            value={`$${results.currentValue.toLocaleString()}`}
                            subValue={priceMode === 'api' && livePrice ? `@ $${livePrice.toLocaleString()}` : undefined}
                            subValueColor="text-amber-600 dark:text-amber-400 font-medium"
                            highlight={true}
                            icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />}
                        />
                        <ResultCard
                            label="Profit / Loss"
                            value={`${profitPrefix}$${Math.abs(results.profit).toLocaleString()}`}
                            valueColor={isProfit ? 'text-green-500' : 'text-red-500'}
                            icon={isProfit ? <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0" /> : <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />}
                            subValue={`${results.roi.toFixed(1)}% ROI`}
                            subValueColor={isProfit ? 'text-green-600' : 'text-red-600'}
                        />
                    </div>

                    {/* Stats Banner */}
                    {purchaseCount > 0 && (
                        <div className="text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 py-1">
                            <p className="flex flex-wrap justify-center gap-x-1 gap-y-0.5">
                                <span>{purchaseCount} purchases{durationText ? ` over ${durationText}` : ''}</span>
                                {ownershipPercent !== null && oneInEvery !== null && (
                                    <>
                                        <span className="hidden sm:inline mx-1">|</span>
                                        <span>
                                            <span className="font-medium text-amber-600 dark:text-amber-400">{ownershipPercent < 0.000001 ? ownershipPercent.toExponential(2) : ownershipPercent.toFixed(6)}%</span> of all BTC
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    )}

                    {/* Inflation-Adjusted Returns */}
                    {inflationStats && (
                        <div className="bg-white dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 rounded-xl border border-slate-200 dark:border-slate-800 fade-in">
                            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center text-xs sm:text-sm">
                                <div>
                                    <div className="text-slate-500 dark:text-slate-400 mb-0.5">Real Value</div>
                                    <div className="font-semibold text-slate-800 dark:text-white">
                                        ${inflationStats.adjustedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">${results.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                    <div className={clsx("text-xs sm:text-sm mt-1", results.profit >= 0 ? "text-green-600" : "text-red-600")}>
                                        {results.profit >= 0 ? '+' : '-'}${Math.abs(results.profit).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({results.roi.toFixed(1)}%)
                                    </div>
                                </div>
                                <div className="p-3 sm:p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50">
                                    <div className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Lump Sum</div>
                                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">${lumpSumResult.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                    <div className={clsx("text-xs sm:text-sm mt-1", lumpSumResult.profit >= 0 ? "text-green-600" : "text-red-600")}>
                                        {lumpSumResult.profit >= 0 ? '+' : '-'}${Math.abs(lumpSumResult.profit).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({lumpSumResult.roi.toFixed(1)}%)
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Asset Comparison */}
                    {priceMode === 'api' && (sp500Data !== null || goldData !== null || comparisonLoading) && (
                        <AssetComparison btcResult={btcAssetResult} sp500Result={sp500Result} goldResult={goldResult} loading={comparisonLoading} />
                    )}

                    {/* Exchange Fee Comparison */}
                    <ExchangeFeeComparison totalInvested={results.totalInvested} purchaseCount={purchaseCount} />

                    {/* Chart */}
                    <DcaChart data={results.breakdown} unit={unit} />

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
                </>
            )}
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
        {subValue && <div className={clsx("text-[11px] sm:text-sm mt-0.5 sm:mt-1 truncate", subValueColor || "text-slate-400")}>{subValue}</div>}
    </div>
);

const PricePredictionScenario = ({ btcAmount, totalInvested }: { btcAmount: number, totalInvested: number }) => {
    const [targetPrice, setTargetPrice] = useState<number>(100000);

    const projectedValue = btcAmount * targetPrice;
    const projectedProfit = projectedValue - totalInvested;
    const multiplier = totalInvested > 0 ? projectedValue / totalInvested : 0;

    return (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 sm:p-6 rounded-2xl shadow-lg border border-slate-700">
            <h3 className="text-base sm:text-xl font-bold mb-3 sm:mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 shrink-0" />
                Price Prediction
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 items-center">
                <div className="space-y-3">
                    <label className="text-xs sm:text-sm font-medium text-slate-300">If Bitcoin Price Hits...</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                        <input
                            type="number"
                            value={targetPrice}
                            onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value)))}
                            className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-slate-600 bg-slate-900/50 text-lg font-bold focus:ring-2 focus:ring-green-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                        {[100000, 150000, 250000, 500000, 1000000].map(price => (
                            <button
                                key={price}
                                onClick={() => setTargetPrice(price)}
                                className="px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-full bg-slate-700/80 hover:bg-slate-600 text-slate-300 transition-colors"
                            >
                                ${price >= 1000000 ? `${price / 1000000}M` : `${price / 1000}k`}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3 bg-slate-800/50 p-4 sm:p-5 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between items-end border-b border-slate-700 pb-3">
                        <span className="text-xs sm:text-sm text-slate-400">Portfolio Value</span>
                        <span className="text-xl sm:text-3xl font-bold text-green-400">${projectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-slate-400">Profit</span>
                        <span className={clsx("text-sm sm:text-lg font-semibold", projectedProfit >= 0 ? "text-green-300" : "text-red-400")}>
                            {projectedProfit >= 0 ? '+' : ''}${projectedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs sm:text-sm text-slate-400">Multiplier</span>
                        <span className="text-xs sm:text-sm font-medium bg-green-900/30 text-green-400 px-2 py-0.5 rounded">{multiplier.toFixed(1)}x</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

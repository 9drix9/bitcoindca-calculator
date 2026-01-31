'use client';

import { useState, useEffect, useMemo } from 'react';
import { addYears, format, subYears, startOfToday } from 'date-fns';
import { DcaParams, Frequency, PriceMode } from '@/types';
import { calculateDca } from '@/utils/dca';
import { getBitcoinPriceHistory, getCurrentBitcoinPrice } from '@/app/actions';
import { DcaChart } from './DcaChart';
import { AdSlot } from './AdSlot';
import { Loader2, TrendingUp, TrendingDown, DollarSign, Activity, Repeat } from 'lucide-react';
import clsx from 'clsx';

export const DcaCalculator = () => {
    const today = startOfToday();
    const oneYearAgo = subYears(today, 1);

    const [amount, setAmount] = useState<number>(100);
    const [frequency, setFrequency] = useState<Frequency>('weekly');
    const [startDate, setStartDate] = useState<string>(format(oneYearAgo, 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState<string>(format(today, 'yyyy-MM-dd'));
    const [feePercentage, setFeePercentage] = useState<number>(0.5);
    const [priceMode, setPriceMode] = useState<PriceMode>('api');
    const [manualPrice, setManualPrice] = useState<number>(50000);
    const [provider, setProvider] = useState<'kraken' | 'coinbase'>('kraken');

    // New state for Unit Toggle
    const [unit, setUnit] = useState<'BTC' | 'SATS'>('BTC');

    const [priceData, setPriceData] = useState<[number, number][]>([]);
    const [livePrice, setLivePrice] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch prices when mode is API and dates change (debounced implicitly by effect deps)
    useEffect(() => {
        if (priceMode !== 'api') return;

        const fetchPrices = async () => {
            setLoading(true);
            setError(null);
            try {
                const startTs = new Date(startDate).getTime();
                const endTs = new Date(endDate).getTime();

                // Fetch parallel
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

    }, [startDate, endDate, priceMode, provider]);

    const results = useMemo(() => {
        return calculateDca({
            amount,
            frequency,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            feePercentage,
            priceMode,
            manualPrice // Pass raw manual price, don't override here
        }, priceData, priceMode === 'api' ? livePrice : undefined);
    }, [amount, frequency, startDate, endDate, feePercentage, priceMode, manualPrice, priceData, livePrice]);

    const isProfit = results.profit >= 0;

    return (
        <div className="space-y-8">
            {/* Input Section */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                <h2 className="text-xl font-bold mb-6 text-slate-800 dark:text-white flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-500" />
                    Investment Parameters
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Amount */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Amount (USD)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                                className="w-full pl-8 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Frequency */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Frequency</label>
                        <select
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as Frequency)}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Bi-weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </div>

                    {/* Fee */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Fee (%)</label>
                        <input
                            type="number"
                            step="0.1"
                            value={feePercentage}
                            onChange={(e) => setFeePercentage(Math.max(0, Number(e.target.value)))}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                        />
                    </div>

                    {/* Dates */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 outline-none transition-all min-h-[42px] appearance-none"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 outline-none transition-all min-h-[42px] appearance-none"
                        />
                    </div>

                    {/* Price Mode & Provider */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Price Mode</label>
                            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                                <button
                                    onClick={() => setPriceMode('api')}
                                    className={clsx(
                                        "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                                        priceMode === 'api'
                                            ? "bg-white dark:bg-slate-700 shadow text-amber-600 dark:text-amber-400"
                                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    )}
                                >
                                    Live API
                                </button>
                                <button
                                    onClick={() => setPriceMode('manual')}
                                    className={clsx(
                                        "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                                        priceMode === 'manual'
                                            ? "bg-white dark:bg-slate-700 shadow text-amber-600 dark:text-amber-400"
                                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    )}
                                >
                                    Manual
                                </button>
                            </div>
                        </div>

                        {/* Data Provider (Only visible in API mode) */}
                        {priceMode === 'api' && (
                            <div className="fade-in">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Data Source</label>
                                <select
                                    value={provider}
                                    onChange={(e) => setProvider(e.target.value as 'kraken' | 'coinbase')}
                                    className="w-full text-sm px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:border-amber-500"
                                >
                                    <option value="kraken">Kraken</option>
                                    <option value="coinbase">Coinbase</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Manual Price Input */}
                    {priceMode === 'manual' && (
                        <div className="space-y-2 md:col-span-1 fade-in">
                            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Avg. BTC Price</label>
                            <input
                                type="number"
                                value={manualPrice}
                                onChange={(e) => setManualPrice(Math.max(0, Number(e.target.value)))}
                                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                            />
                        </div>
                    )}

                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-500">Projected Investment</span>
                    <span className="text-lg font-bold text-slate-800 dark:text-white">${results.totalInvested.toLocaleString()}</span>
                </div>

                {loading && <div className="mt-4 flex items-center gap-2 text-sm text-amber-600 animate-pulse"><Loader2 className="w-4 h-4 animate-spin" /> Fetching historical prices...</div>}
                {error && <div className="mt-4 text-sm text-red-500">{error}</div>}
            </div>

            {/* Ad Slot 1 */}
            <AdSlot slotId="replace-with-slot-1" className="min-h-[100px] flex justify-center" />

            {/* Results Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <ResultCard label="Total Invested" value={`$${results.totalInvested.toLocaleString()}`} />
                <ResultCard
                    label={unit === 'BTC' ? "BTC Accumulated" : "Sats Accumulated"}
                    value={unit === 'BTC'
                        ? `${results.btcAccumulated.toFixed(8)} ₿`
                        : `${Math.floor(results.btcAccumulated * 100_000_000).toLocaleString()} Sats`
                    }
                    subValue={`Avg Cost: $${results.averageCost.toLocaleString()}`}
                    action={
                        <button
                            onClick={() => setUnit(prev => prev === 'BTC' ? 'SATS' : 'BTC')}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                            title={`Switch to ${unit === 'BTC' ? 'Sats' : 'BTC'}`}
                        >
                            <Repeat className="w-4 h-4 text-slate-400" />
                        </button>
                    }
                />
                <ResultCard
                    label="Current Value"
                    value={`$${results.currentValue.toLocaleString()}`}
                    subValue={priceMode === 'api' && livePrice ? `BTC @ $${livePrice.toLocaleString()}` : undefined}
                    subValueColor="text-amber-600 dark:text-amber-400 font-medium"
                    highlight={true}
                    icon={<Activity className="w-5 h-5 text-amber-500" />}
                />
                <ResultCard
                    label="Total Profit / Loss"
                    value={`$${Math.abs(results.profit).toLocaleString()}`}
                    valueColor={isProfit ? 'text-green-500' : 'text-red-500'}
                    icon={isProfit ? <TrendingUp className="w-5 h-5 text-green-500" /> : <TrendingDown className="w-5 h-5 text-red-500" />}
                    subValue={`${results.roi.toFixed(2)}% ROI`}
                    subValueColor={isProfit ? 'text-green-600' : 'text-red-600'}
                />
            </div>

            {/* Chart */}
            <DcaChart data={results.breakdown} />

            {/* Price Prediction Scenario */}
            <PricePredictionScenario btcAmount={results.btcAccumulated} totalInvested={results.totalInvested} />

        </div>
    );
};

const ResultCard = ({ label, value, subValue, highlight, valueColor, icon, subValueColor, action }: any) => (
    <div className={clsx(
        "p-6 rounded-xl border transition-all relative group",
        highlight
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50"
            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
    )}>
        <div className="flex justify-between items-start mb-1">
            <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
            {action && <div className="opacity-100 transition-opacity">{action}</div>}
        </div>
        <div className="flex items-center gap-2">
            <div className={clsx("text-2xl font-bold text-slate-900 dark:text-slate-100", valueColor)}>{value}</div>
            {icon}
        </div>
        {subValue && <div className={clsx("text-sm mt-1", subValueColor || "text-slate-400")}>{subValue}</div>}
    </div>
);

const PricePredictionScenario = ({ btcAmount, totalInvested }: { btcAmount: number, totalInvested: number }) => {
    const [targetPrice, setTargetPrice] = useState<number>(100000);

    const projectedValue = btcAmount * targetPrice;
    const projectedProfit = projectedValue - totalInvested;
    const multiplier = totalInvested > 0 ? projectedValue / totalInvested : 0;

    return (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-lg border border-slate-700">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                Price Prediction Scenario
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                    <label className="text-sm font-medium text-slate-300">If Bitcoin Price Hits...</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">$</span>
                        <input
                            type="number"
                            value={targetPrice}
                            onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value)))}
                            className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-600 bg-slate-900/50 text-xl font-bold focus:ring-2 focus:ring-green-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {[100000, 150000, 250000, 500000, 1000000].map(price => (
                            <button
                                key={price}
                                onClick={() => setTargetPrice(price)}
                                className="px-3 py-1 text-xs font-medium rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                            >
                                ${price / 1000}k
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-4 bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between items-end border-b border-slate-700 pb-4">
                        <span className="text-slate-400">Your Portfolio Value</span>
                        <span className="text-3xl font-bold text-green-400">${projectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                        <span className="text-slate-400">Total Profit</span>
                        <span className={clsx(
                            "text-lg font-semibold",
                            projectedProfit >= 0 ? "text-green-300" : "text-red-400"
                        )}>
                            {projectedProfit >= 0 ? '+' : ''}${projectedProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400">Multiplier</span>
                        <span className="text-sm font-medium bg-green-900/30 text-green-400 px-2 py-1 rounded">{multiplier.toFixed(1)}x</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

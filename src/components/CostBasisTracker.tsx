'use client';

import { useState, useMemo, useCallback } from 'react';
import { CostBasisPosition, Frequency, PriceMode } from '@/types';
import { calculateDca } from '@/utils/dca';
import { useCurrency } from '@/context/CurrencyContext';
import clsx from 'clsx';

interface CostBasisTrackerProps {
    priceData: [number, number][];
    livePrice: number | null;
    priceMode: PriceMode;
}

const STORAGE_KEY = 'btc-dca-cost-basis-positions';

const generateId = () => Math.random().toString(36).substring(2, 9);

const isValidPosition = (p: unknown): p is CostBasisPosition => {
    if (!p || typeof p !== 'object') return false;
    const pos = p as Record<string, unknown>;
    return typeof pos.id === 'string' &&
           typeof pos.label === 'string' &&
           typeof pos.startDate === 'string' &&
           typeof pos.endDate === 'string' &&
           typeof pos.amount === 'number' &&
           typeof pos.frequency === 'string' &&
           typeof pos.feePercentage === 'number';
};

const loadPositions = (): CostBasisPosition[] => {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                return parsed.filter(isValidPosition);
            }
        }
    } catch { /* ignore */ }
    return [];
};

const savePositions = (positions: CostBasisPosition[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch { /* ignore */ }
};

export const CostBasisTracker = ({ priceData, livePrice, priceMode }: CostBasisTrackerProps) => {
    const { formatCurrency } = useCurrency();
    const [positions, setPositions] = useState<CostBasisPosition[]>(() => loadPositions());
    const [showForm, setShowForm] = useState(false);

    // Form state
    const [label, setLabel] = useState('');
    const [formStartDate, setFormStartDate] = useState('');
    const [formEndDate, setFormEndDate] = useState('');
    const [formAmount, setFormAmount] = useState<number>(50);
    const [formFrequency, setFormFrequency] = useState<Frequency>('weekly');
    const [formFee, setFormFee] = useState<number>(0.5);

    const addPosition = useCallback(() => {
        if (!label.trim() || !formStartDate || !formEndDate) return;
        const newPosition: CostBasisPosition = {
            id: generateId(),
            label: label.trim(),
            startDate: formStartDate,
            endDate: formEndDate,
            amount: formAmount,
            frequency: formFrequency,
            feePercentage: formFee,
        };
        const updated = [...positions, newPosition];
        setPositions(updated);
        savePositions(updated);
        setShowForm(false);
        setLabel('');
        setFormStartDate('');
        setFormEndDate('');
        setFormAmount(50);
        setFormFrequency('weekly');
        setFormFee(0.5);
    }, [label, formStartDate, formEndDate, formAmount, formFrequency, formFee, positions]);

    const removePosition = useCallback((id: string) => {
        const updated = positions.filter(p => p.id !== id);
        setPositions(updated);
        savePositions(updated);
    }, [positions]);

    const positionResults = useMemo(() => {
        return positions.map(pos => {
            const result = calculateDca(
                {
                    amount: pos.amount,
                    frequency: pos.frequency,
                    startDate: new Date(pos.startDate),
                    endDate: new Date(pos.endDate),
                    feePercentage: pos.feePercentage,
                    priceMode: priceMode === 'api' ? 'api' : 'manual',
                    manualPrice: 50000,
                },
                priceData,
                livePrice
            );
            return { position: pos, result };
        });
    }, [positions, priceData, livePrice, priceMode]);

    const totals = useMemo(() => {
        let totalInvested = 0;
        let totalBtc = 0;
        let totalValue = 0;
        for (const { result } of positionResults) {
            totalInvested += result.totalInvested;
            totalBtc += result.btcAccumulated;
            totalValue += result.currentValue;
        }
        const profit = totalValue - totalInvested;
        const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
        const avgCost = totalBtc > 0 ? totalInvested / totalBtc : 0;
        return { totalInvested, totalBtc, totalValue, profit, roi, avgCost };
    }, [positionResults]);

    if (priceMode !== 'api' || !priceData.length) return null;

    return (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100">Cost Basis Tracker</h3>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200/60 dark:border-amber-800/40 transition-colors"
                >
                    {showForm ? 'Cancel' : '+ Add Position'}
                </button>
            </div>

            {/* Add Position Form */}
            {showForm && (
                <div className="mb-4 p-3 sm:p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3 fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-slate-400">Label</label>
                            <input
                                type="text"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="e.g., Weekly DCA 2023"
                                className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-amber-500"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-slate-400">Amount (USD)</label>
                            <input
                                type="number"
                                value={formAmount}
                                onChange={(e) => setFormAmount(Math.max(0, Number(e.target.value)))}
                                onFocus={(e) => e.target.select()}
                                className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-amber-500"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-slate-400">Start Date</label>
                            <input
                                type="date"
                                value={formStartDate}
                                onChange={(e) => setFormStartDate(e.target.value)}
                                className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-amber-500"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-slate-400">End Date</label>
                            <input
                                type="date"
                                value={formEndDate}
                                onChange={(e) => setFormEndDate(e.target.value)}
                                className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-amber-500"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-slate-400">Frequency</label>
                            <select
                                value={formFrequency}
                                onChange={(e) => setFormFrequency(e.target.value as Frequency)}
                                className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-amber-500"
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Bi-weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500 dark:text-slate-400">Fee (%)</label>
                            <input
                                type="number"
                                step="0.1"
                                min={0}
                                max={50}
                                value={formFee}
                                onChange={(e) => setFormFee(Math.min(50, Math.max(0, Number(e.target.value))))}
                                onFocus={(e) => e.target.select()}
                                className="w-full px-2.5 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>
                    <button
                        onClick={addPosition}
                        disabled={!label.trim() || !formStartDate || !formEndDate}
                        className="w-full py-2 text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Add Position
                    </button>
                </div>
            )}

            {/* Positions List */}
            {positionResults.length > 0 ? (
                <div className="space-y-2">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                    <th className="pb-2 pr-2 font-medium">Position</th>
                                    <th className="pb-2 pr-2 font-medium text-right">Invested</th>
                                    <th className="pb-2 pr-2 font-medium text-right">BTC</th>
                                    <th className="pb-2 pr-2 font-medium text-right">Value</th>
                                    <th className="pb-2 pr-2 font-medium text-right">ROI</th>
                                    <th className="pb-2 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {positionResults.map(({ position, result }) => (
                                    <tr key={position.id} className="border-b border-slate-100 dark:border-slate-800">
                                        <td className="py-2 pr-2">
                                            <div className="font-medium text-slate-800 dark:text-white">{position.label}</div>
                                            <div className="text-[10px] text-slate-500 dark:text-slate-400">{position.startDate} to {position.endDate}</div>
                                        </td>
                                        <td className="py-2 pr-2 text-right font-mono text-slate-700 dark:text-slate-300">{formatCurrency(result.totalInvested)}</td>
                                        <td className="py-2 pr-2 text-right font-mono text-slate-700 dark:text-slate-300">{result.btcAccumulated.toFixed(6)}</td>
                                        <td className="py-2 pr-2 text-right font-mono text-slate-700 dark:text-slate-300">{formatCurrency(result.currentValue)}</td>
                                        <td className={clsx("py-2 pr-2 text-right font-mono font-medium", result.roi >= 0 ? "text-green-600" : "text-red-600")}>
                                            {result.roi >= 0 ? '+' : ''}{result.roi.toFixed(1)}%
                                        </td>
                                        <td className="py-2 text-right">
                                            <button
                                                onClick={() => removePosition(position.id)}
                                                className="text-slate-500 dark:text-slate-400 hover:text-red-500 transition-colors p-1"
                                                title="Remove position"
                                            >
                                                &times;
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {positionResults.length > 1 && (
                                <tfoot>
                                    <tr className="font-semibold border-t-2 border-slate-300 dark:border-slate-600">
                                        <td className="pt-2 pr-2 text-slate-800 dark:text-white">Combined</td>
                                        <td className="pt-2 pr-2 text-right font-mono text-slate-800 dark:text-white">{formatCurrency(totals.totalInvested)}</td>
                                        <td className="pt-2 pr-2 text-right font-mono text-slate-800 dark:text-white">{totals.totalBtc.toFixed(6)}</td>
                                        <td className="pt-2 pr-2 text-right font-mono text-slate-800 dark:text-white">{formatCurrency(totals.totalValue)}</td>
                                        <td className={clsx("pt-2 pr-2 text-right font-mono", totals.roi >= 0 ? "text-green-600" : "text-red-600")}>
                                            {totals.roi >= 0 ? '+' : ''}{totals.roi.toFixed(1)}%
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    {positionResults.length > 0 && (
                        <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 pt-1">
                            Avg. Cost Basis: {formatCurrency(totals.avgCost)} per BTC
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                    No positions yet. Add your first DCA position to track your cost basis.
                </p>
            )}
        </div>
    );
};

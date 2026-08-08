'use client';

import { useState, useMemo, useCallback, useEffect, useId } from 'react';
import { CostBasisPosition, Frequency, PriceMode } from '@/types';
import { calculateDca } from '@/utils/dca';
import { parseUtcDate, DAY_MS } from '@/utils/dates';
import { getBitcoinPriceHistory } from '@/app/actions';
import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader } from '@/components/ui/Card';
import clsx from 'clsx';


interface CostBasisTrackerProps {
    /** Fallback series (the calculator's window) used until this component's own
     *  position-spanning history arrives. */
    priceData: [number, number][];
    livePrice: number | null;
    priceMode: PriceMode;
    provider: 'kraken' | 'coinbase';
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

export const CostBasisTracker = ({ priceData, livePrice, priceMode, provider }: CostBasisTrackerProps) => {
    const { formatCurrency, currencyConfig } = useCurrency();
    // Stored position amounts are always USD; the form input is in the selected
    // display currency and converted once on save.
    const [positions, setPositions] = useState<CostBasisPosition[]>(() => loadPositions());
    const [showForm, setShowForm] = useState(false);
    const formId = useId();

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
            // Convert the display-currency input to USD once; the DCA engine is USD-only.
            amount: formAmount / currencyConfig.rate,
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
    }, [label, formStartDate, formEndDate, formAmount, formFrequency, formFee, positions, currencyConfig.rate]);

    const removePosition = useCallback((id: string) => {
        const updated = positions.filter(p => p.id !== id);
        setPositions(updated);
        savePositions(updated);
    }, [positions]);

    /**
     * Saved positions have arbitrary dates, but the series handed down from the
     * calculator only covers the calculator's own window. A position starting
     * before that window had no price to look up, so it silently reported zero
     * invested. Fetch a series that actually spans every saved position instead;
     * the action is cached server-side, so this is close to free.
     */
    const [ownPriceData, setOwnPriceData] = useState<[number, number][] | null>(null);

    const positionSpan = useMemo(() => {
        if (positions.length === 0) return null;
        let min = Infinity;
        let max = -Infinity;
        for (const p of positions) {
            const s = parseUtcDate(p.startDate);
            const e = parseUtcDate(p.endDate);
            if (Number.isFinite(s)) min = Math.min(min, s);
            if (Number.isFinite(e)) max = Math.max(max, e);
        }
        return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
    }, [positions]);

    useEffect(() => {
        if (priceMode !== 'api' || !positionSpan) return;
        let cancelled = false;
        getBitcoinPriceHistory(positionSpan.min, positionSpan.max + DAY_MS, provider)
            .then(data => { if (!cancelled) setOwnPriceData(data); })
            // Fall back to the calculator's window rather than showing nothing.
            .catch(() => { if (!cancelled) setOwnPriceData(null); });
        return () => { cancelled = true; };
    }, [positionSpan, provider, priceMode]);

    const effectivePriceData = ownPriceData ?? priceData;

    const positionResults = useMemo(() => {
        return positions.map(pos => {
            const result = calculateDca(
                {
                    amount: pos.amount, // stored in USD
                    frequency: pos.frequency,
                    startDate: new Date(parseUtcDate(pos.startDate)),
                    endDate: new Date(parseUtcDate(pos.endDate)),
                    feePercentage: pos.feePercentage,
                    priceMode: priceMode === 'api' ? 'api' : 'manual',
                    manualPrice: 50000,
                },
                effectivePriceData,
                livePrice
            );
            return { position: pos, result };
        });
    }, [positions, effectivePriceData, livePrice, priceMode]);

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
        <Card className="p-4 sm:p-6">
            <CardHeader
                title="Cost Basis Tracker"
                className="mb-3 sm:mb-4"
                action={
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="inline-flex items-center justify-center px-3 py-1.5 min-h-9 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200/60 dark:border-amber-800/40 transition-colors"
                    >
                        {showForm ? 'Cancel' : '+ Add Position'}
                    </button>
                }
            />

            {/* Add Position Form */}
            {showForm && (
                <div className="mb-4 p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label htmlFor={`${formId}-label`} className="text-xs text-slate-500 dark:text-slate-400">Label</label>
                            <input
                                id={`${formId}-label`}
                                type="text"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="e.g., Weekly DCA 2023"
                                className="w-full px-2.5 py-1.5 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-shadow"
                            />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor={`${formId}-amount`} className="text-xs text-slate-500 dark:text-slate-400">Amount ({currencyConfig.code})</label>
                            <input
                                id={`${formId}-amount`}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                value={formAmount}
                                onChange={(e) => setFormAmount(Math.max(0, Number(e.target.value)))}
                                onFocus={(e) => e.target.select()}
                                className="w-full px-2.5 py-1.5 text-base sm:text-sm tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-shadow"
                            />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <label htmlFor={`${formId}-start`} className="text-xs text-slate-500 dark:text-slate-400">Start Date</label>
                            <input
                                id={`${formId}-start`}
                                type="date"
                                value={formStartDate}
                                onChange={(e) => setFormStartDate(e.target.value)}
                                className="w-full min-w-0 appearance-none px-2.5 py-1.5 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-shadow"
                            />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <label htmlFor={`${formId}-end`} className="text-xs text-slate-500 dark:text-slate-400">End Date</label>
                            <input
                                id={`${formId}-end`}
                                type="date"
                                value={formEndDate}
                                onChange={(e) => setFormEndDate(e.target.value)}
                                className="w-full min-w-0 appearance-none px-2.5 py-1.5 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-shadow"
                            />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor={`${formId}-frequency`} className="text-xs text-slate-500 dark:text-slate-400">Frequency</label>
                            <select
                                id={`${formId}-frequency`}
                                value={formFrequency}
                                onChange={(e) => setFormFrequency(e.target.value as Frequency)}
                                className="w-full px-2.5 py-1.5 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-shadow"
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="biweekly">Bi-weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label htmlFor={`${formId}-fee`} className="text-xs text-slate-500 dark:text-slate-400">Fee (%)</label>
                            <input
                                id={`${formId}-fee`}
                                type="number"
                                inputMode="decimal"
                                step="0.1"
                                min={0}
                                max={50}
                                value={formFee}
                                onChange={(e) => setFormFee(Math.min(50, Math.max(0, Number(e.target.value))))}
                                onFocus={(e) => e.target.select()}
                                className="w-full px-2.5 py-1.5 text-base sm:text-sm tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-shadow"
                            />
                        </div>
                    </div>
                    <button
                        onClick={addPosition}
                        disabled={!label.trim() || !formStartDate || !formEndDate}
                        className="flex h-11 w-full items-center justify-center py-2 text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Add Position
                    </button>
                </div>
            )}

            {/* Positions List */}
            {positionResults.length > 0 ? (
                <div className="space-y-2">
                    {/* min-w keeps the six columns legible instead of collapsing to
                        min-content at ~358px; this div is the only sideways scroller. */}
                    <div className="overflow-x-auto overscroll-x-contain">
                        <table className="w-full min-w-[520px] text-xs sm:text-sm">
                            <thead>
                                <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                    <th scope="col" className="pb-2 pr-2 font-medium">Position</th>
                                    <th scope="col" className="pb-2 pr-2 font-medium text-right whitespace-nowrap">Invested</th>
                                    <th scope="col" className="pb-2 pr-2 font-medium text-right whitespace-nowrap">BTC</th>
                                    <th scope="col" className="pb-2 pr-2 font-medium text-right whitespace-nowrap">Value</th>
                                    <th scope="col" className="pb-2 pr-2 font-medium text-right whitespace-nowrap">ROI</th>
                                    <th scope="col" className="pb-2 font-medium"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {positionResults.map(({ position, result }) => (
                                    <tr key={position.id} className="border-b border-slate-100 dark:border-slate-800">
                                        <td className="py-2 pr-2">
                                            <div className="font-medium text-slate-800 dark:text-white">{position.label}</div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{position.startDate} to {position.endDate}</div>
                                        </td>
                                        <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">{formatCurrency(result.totalInvested)}</td>
                                        <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">{result.btcAccumulated.toFixed(6)}</td>
                                        <td className="py-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">{formatCurrency(result.currentValue)}</td>
                                        <td className={clsx("py-2 pr-2 text-right tabular-nums whitespace-nowrap font-medium", result.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                            {result.roi >= 0 ? '+' : ''}{result.roi.toFixed(1)}%
                                        </td>
                                        <td className="py-2 text-right">
                                            <button
                                                onClick={() => removePosition(position.id)}
                                                className="inline-flex items-center justify-center w-9 h-9 text-base leading-none rounded-md text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                title="Remove position"
                                                aria-label={`Remove position ${position.label}`}
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
                                        <td className="pt-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-800 dark:text-white">{formatCurrency(totals.totalInvested)}</td>
                                        <td className="pt-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-800 dark:text-white">{totals.totalBtc.toFixed(6)}</td>
                                        <td className="pt-2 pr-2 text-right tabular-nums whitespace-nowrap text-slate-800 dark:text-white">{formatCurrency(totals.totalValue)}</td>
                                        <td className={clsx("pt-2 pr-2 text-right tabular-nums whitespace-nowrap", totals.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                            {totals.roi >= 0 ? '+' : ''}{totals.roi.toFixed(1)}%
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 pt-1">
                        Average cost basis: <span className="tabular-nums">{formatCurrency(totals.avgCost)}</span> per BTC
                        <span className="mx-1.5" aria-hidden="true">&middot;</span>
                        Saved in USD, shown in your selected currency.
                    </div>
                </div>
            ) : (
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                    Nothing tracked yet. Add a position to see what you paid per BTC.
                </p>
            )}
        </Card>
    );
};

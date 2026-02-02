'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getCurrentBitcoinPrice } from '@/app/actions';

const SATS_PER_BTC = 100_000_000;

export const SatConverterWidget = () => {
    const [price, setPrice] = useState<number | null>(null);
    const [inputValue, setInputValue] = useState<string>('10000');
    const [inputMode, setInputMode] = useState<'sats' | 'usd'>('sats');

    useEffect(() => {
        let mounted = true;
        const refresh = async () => {
            try {
                const fresh = await getCurrentBitcoinPrice();
                if (mounted) setPrice(fresh);
            } catch { /* keep last known */ }
        };
        refresh();
        const interval = setInterval(refresh, 60_000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    const { satsDisplay, usdDisplay } = useMemo(() => {
        if (price === null) return { satsDisplay: '', usdDisplay: '' };
        const satPrice = price / SATS_PER_BTC;
        const num = parseFloat(inputValue);

        if (isNaN(num)) return { satsDisplay: inputMode === 'sats' ? inputValue : '', usdDisplay: inputMode === 'usd' ? inputValue : '' };

        if (inputMode === 'sats') {
            return {
                satsDisplay: inputValue,
                usdDisplay: (num * satPrice).toFixed(2),
            };
        } else {
            return {
                satsDisplay: Math.round(num / satPrice).toString(),
                usdDisplay: inputValue,
            };
        }
    }, [price, inputValue, inputMode]);

    const handleSatsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInputMode('sats');
        setInputValue(e.target.value);
    }, []);

    const handleUsdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInputMode('usd');
        setInputValue(e.target.value);
    }, []);

    if (price === null) return null;

    const satUsdPrice = price / SATS_PER_BTC;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <h4 className="font-semibold text-slate-800 dark:text-white mb-3 text-xs sm:text-sm flex items-center gap-1.5">
                <span className="text-amber-500">&#8383;</span>
                Sat / USD Converter
            </h4>

            <div className="space-y-2.5">
                <div>
                    <label className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-1 block">Sats</label>
                    <input
                        type="number"
                        value={satsDisplay}
                        onChange={handleSatsChange}
                        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all font-mono"
                        placeholder="10000"
                    />
                </div>

                <div className="flex justify-center">
                    <span className="text-slate-500 dark:text-slate-400 text-xs" aria-hidden="true">&#8596;</span>
                </div>

                <div>
                    <label className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-1 block">USD</label>
                    <input
                        type="number"
                        value={usdDisplay}
                        onChange={handleUsdChange}
                        step="0.01"
                        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all font-mono"
                        placeholder="0.00"
                    />
                </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-center">
                <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                    1 sat = ${satUsdPrice.toFixed(8)}
                </span>
            </div>
        </div>
    );
};

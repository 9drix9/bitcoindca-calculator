'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getCurrentBitcoinPrice } from '@/app/actions';
import { useCurrency } from '@/context/CurrencyContext';

const SATS_PER_BTC = 100_000_000;

export const SatConverterWidget = () => {
    const { currencyConfig } = useCurrency();
    const [price, setPrice] = useState<number | null>(null);
    const [inputValue, setInputValue] = useState<string>('10000');
    const [inputMode, setInputMode] = useState<'sats' | 'fiat'>('sats');

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

    const { satsDisplay, fiatDisplay } = useMemo(() => {
        if (price === null) return { satsDisplay: '', fiatDisplay: '' };
        const satPriceUsd = price / SATS_PER_BTC;
        const satPriceFiat = satPriceUsd * currencyConfig.rate;
        const num = parseFloat(inputValue);

        if (isNaN(num)) return { satsDisplay: inputMode === 'sats' ? inputValue : '', fiatDisplay: inputMode === 'fiat' ? inputValue : '' };

        if (inputMode === 'sats') {
            return {
                satsDisplay: inputValue,
                fiatDisplay: (num * satPriceFiat).toFixed(2),
            };
        } else {
            return {
                satsDisplay: Math.round(num / satPriceFiat).toString(),
                fiatDisplay: inputValue,
            };
        }
    }, [price, inputValue, inputMode, currencyConfig.rate]);

    const handleSatsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInputMode('sats');
        setInputValue(e.target.value);
    }, []);

    const handleFiatChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInputMode('fiat');
        setInputValue(e.target.value);
    }, []);

    if (price === null) return null;

    const satPriceFiat = (price / SATS_PER_BTC) * currencyConfig.rate;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <h4 className="font-semibold text-slate-800 dark:text-white mb-3 text-xs sm:text-sm flex items-center gap-1.5">
                <span className="text-amber-500">&#8383;</span>
                Sat / {currencyConfig.code} Converter
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
                    <label className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-1 block">{currencyConfig.code}</label>
                    <input
                        type="number"
                        value={fiatDisplay}
                        onChange={handleFiatChange}
                        step="0.01"
                        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-all font-mono"
                        placeholder="0.00"
                    />
                </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-center">
                <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                    1 sat = {currencyConfig.symbol}{satPriceFiat.toFixed(8)}
                </span>
            </div>
        </div>
    );
};

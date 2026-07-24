'use client';

import { useState, useEffect, useMemo, useCallback, useId } from 'react';
import { Bitcoin } from 'lucide-react';
import { getCurrentBitcoinPrice } from '@/app/actions';
import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader } from '@/components/ui/Card';

const SATS_PER_BTC = 100_000_000;
const POLL_MS = 60_000;

export const SatConverterWidget = () => {
    const { currencyConfig, convertFromUsd } = useCurrency();
    const [price, setPrice] = useState<number | null>(null);
    const [failed, setFailed] = useState(false);
    const [inputValue, setInputValue] = useState<string>('10000');
    const [inputMode, setInputMode] = useState<'sats' | 'fiat'>('sats');
    const satsId = useId();
    const fiatId = useId();

    useEffect(() => {
        let mounted = true;
        let lastFetched = 0;

        const refresh = async () => {
            lastFetched = Date.now();
            try {
                const fresh = await getCurrentBitcoinPrice();
                if (mounted && Number.isFinite(fresh) && fresh > 0) {
                    setPrice(fresh);
                    setFailed(false);
                }
            } catch {
                if (mounted) setFailed(true); // keep last known price if we have one
            }
        };

        // No SSR initial data for this widget, so fetch once on mount.
        refresh();

        const interval = setInterval(() => {
            if (!document.hidden) refresh();
        }, POLL_MS);
        const onVisibilityChange = () => {
            if (!document.hidden && Date.now() - lastFetched >= POLL_MS) refresh();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            mounted = false;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, []);

    const { satsDisplay, fiatDisplay } = useMemo(() => {
        if (price === null) {
            return {
                satsDisplay: inputMode === 'sats' ? inputValue : '',
                fiatDisplay: inputMode === 'fiat' ? inputValue : '',
            };
        }
        const satPriceFiat = convertFromUsd(price / SATS_PER_BTC);
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
    }, [price, inputValue, inputMode, convertFromUsd]);

    const handleSatsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInputMode('sats');
        setInputValue(e.target.value);
    }, []);

    const handleFiatChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInputMode('fiat');
        setInputValue(e.target.value);
    }, []);

    // text-base on mobile keeps iOS from zooming into the inputs
    const inputClasses =
        'w-full px-2.5 py-1.5 text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-shadow tabular-nums';

    return (
        <Card className="p-4">
            <CardHeader
                icon={<Bitcoin className="w-4 h-4" />}
                title={`Sat / ${currencyConfig.code} Converter`}
                className="mb-3"
            />

            <div className="space-y-2.5">
                <div>
                    <label htmlFor={satsId} className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mb-1 block">Sats</label>
                    <input
                        id={satsId}
                        type="number"
                        inputMode="decimal"
                        value={satsDisplay}
                        onChange={handleSatsChange}
                        className={inputClasses}
                        placeholder="10000"
                    />
                </div>

                <div className="flex justify-center">
                    <span className="text-slate-500 dark:text-slate-400 text-xs" aria-hidden="true">&#8596;</span>
                </div>

                <div>
                    <label htmlFor={fiatId} className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mb-1 block">{currencyConfig.code}</label>
                    <input
                        id={fiatId}
                        type="number"
                        inputMode="decimal"
                        value={fiatDisplay}
                        onChange={handleFiatChange}
                        step="0.01"
                        className={inputClasses}
                        placeholder="0.00"
                    />
                </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-center">
                <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {price !== null
                        ? `1 sat = ${currencyConfig.symbol}${convertFromUsd(price / SATS_PER_BTC).toFixed(8)}`
                        : failed
                            ? 'Data unavailable'
                            : 'Loading live price…'}
                </span>
            </div>
        </Card>
    );
};

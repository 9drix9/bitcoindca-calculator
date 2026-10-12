'use client';

import { useState, useMemo, useCallback, useId } from 'react';
import { Bitcoin } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { PRICE_PROVIDER_LABELS } from '@/data/priceSources';
import { SATS_PER_BTC } from '@/utils/units';
import { Card, CardHeader } from '@/components/ui/Card';
import { useLiveFigure } from '@/components/live/liveSidebar';

// Two decimals is the smallest unit of most currencies, but a few sats are
// worth less than that, and rounded to cents they read "0.00". Below one unit,
// keep two significant digits instead.
const formatFiat = (value: number): string => {
    const abs = Math.abs(value);
    if (abs === 0 || abs >= 1) return value.toFixed(2);
    return value.toFixed(Math.min(8, 1 - Math.floor(Math.log10(abs))));
};

export const SatConverterWidget = () => {
    const { currencyConfig, convertFromUsd, rateNote } = useCurrency();
    // Either exchange will do for a conversion; the footer names the one used.
    // Nothing comes with the page: a price out of cached HTML could not be
    // called live, so the card waits for the first one this page view fetches.
    const { data: quote, old, failed } = useLiveFigure('spot', null);
    const [inputValue, setInputValue] = useState<string>('10000');
    const [inputMode, setInputMode] = useState<'sats' | 'fiat'>('sats');
    const satsId = useId();
    const fiatId = useId();

    const price = quote?.price ?? null;

    const { satsDisplay, fiatDisplay } = useMemo(() => {
        // The field being typed in always shows exactly what was typed, so it
        // can be emptied or left half-finished ("0.") without snapping back.
        const typedOnly = {
            satsDisplay: inputMode === 'sats' ? inputValue : '',
            fiatDisplay: inputMode === 'fiat' ? inputValue : '',
        };
        if (price === null) return typedOnly;

        const satPriceFiat = convertFromUsd(price / SATS_PER_BTC);
        const num = parseFloat(inputValue);
        if (!Number.isFinite(num) || num < 0 || !(satPriceFiat > 0)) return typedOnly;

        if (inputMode === 'sats') {
            return {
                satsDisplay: inputValue,
                fiatDisplay: formatFiat(num * satPriceFiat),
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

    // On a phone or any touch screen: text-base keeps iOS from zooming into
    // the inputs and py-2.5 makes them 44px tall, the touch-target floor.
    // py-1.5 keeps the sidebar's density where there is a mouse.
    const inputClasses =
        'w-full px-2.5 py-1.5 max-sm:py-2.5 pointer-coarse:py-2.5 text-sm max-sm:text-base pointer-coarse:text-base rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none transition-shadow tabular-nums';

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
                        min="0"
                        step="1"
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
                        min="0"
                        step="any"
                        value={fiatDisplay}
                        onChange={handleFiatChange}
                        className={inputClasses}
                        placeholder="0.00"
                    />
                </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-center text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                <span className="tabular-nums">
                    {quote !== null
                        ? `1 sat = ${currencyConfig.symbol}${convertFromUsd(quote.price / SATS_PER_BTC).toFixed(8)}`
                        : failed
                            ? 'Data unavailable'
                            : 'Loading live price…'}
                </span>
                {quote !== null && (
                    <p className="mt-0.5">
                        {/* A failed refresh keeps the last price; say that it is no longer live. */}
                        {failed || old ? 'Last known price' : 'Live price'} from {PRICE_PROVIDER_LABELS[quote.provider].name}
                    </p>
                )}
                {quote !== null && rateNote && <p className="mt-1 leading-relaxed">{rateNote}</p>}
            </div>
        </Card>
    );
};

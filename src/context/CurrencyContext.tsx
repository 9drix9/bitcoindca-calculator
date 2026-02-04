'use client';

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY';

export interface CurrencyConfig {
    code: CurrencyCode;
    symbol: string;
    rate: number;
    label: string;
}

const CURRENCIES: CurrencyConfig[] = [
    { code: 'USD', symbol: '$', rate: 1, label: 'USD ($)' },
    { code: 'EUR', symbol: '€', rate: 0.92, label: 'EUR (€)' },
    { code: 'GBP', symbol: '£', rate: 0.79, label: 'GBP (£)' },
    { code: 'CAD', symbol: 'C$', rate: 1.36, label: 'CAD (C$)' },
    { code: 'AUD', symbol: 'A$', rate: 1.53, label: 'AUD (A$)' },
    { code: 'JPY', symbol: '¥', rate: 149.5, label: 'JPY (¥)' },
];

interface CurrencyContextType {
    currency: CurrencyCode;
    currencyConfig: CurrencyConfig;
    currencies: CurrencyConfig[];
    setCurrency: (code: CurrencyCode) => void;
    formatCurrency: (usdValue: number, maximumFractionDigits?: number) => string;
    formatCompact: (usdValue: number) => string;
    convertFromUsd: (usdValue: number) => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
    const [currency, setCurrency] = useState<CurrencyCode>('USD');

    const currencyConfig = useMemo(
        () => CURRENCIES.find(c => c.code === currency) || CURRENCIES[0],
        [currency]
    );

    const convertFromUsd = useCallback(
        (usdValue: number) => usdValue * currencyConfig.rate,
        [currencyConfig.rate]
    );

    const formatCurrency = useCallback(
        (usdValue: number, maximumFractionDigits: number = 0) => {
            const converted = usdValue * currencyConfig.rate;
            if (currencyConfig.code === 'JPY') {
                return `${currencyConfig.symbol}${Math.round(converted).toLocaleString()}`;
            }
            return `${currencyConfig.symbol}${converted.toLocaleString(undefined, { maximumFractionDigits })}`;
        },
        [currencyConfig]
    );

    const formatCompact = useCallback(
        (usdValue: number) => {
            const converted = usdValue * currencyConfig.rate;
            const abs = Math.abs(converted);
            const sign = converted < 0 ? '-' : '';
            if (abs >= 1_000_000_000) {
                return `${sign}${currencyConfig.symbol}${(abs / 1_000_000_000).toFixed(1)}B`;
            }
            if (abs >= 1_000_000) {
                return `${sign}${currencyConfig.symbol}${(abs / 1_000_000).toFixed(1)}M`;
            }
            if (abs >= 10_000) {
                return `${sign}${currencyConfig.symbol}${(abs / 1_000).toFixed(1)}K`;
            }
            return `${sign}${currencyConfig.symbol}${Math.round(abs).toLocaleString()}`;
        },
        [currencyConfig]
    );

    const value = useMemo(
        () => ({
            currency,
            currencyConfig,
            currencies: CURRENCIES,
            setCurrency,
            formatCurrency,
            formatCompact,
            convertFromUsd,
        }),
        [currency, currencyConfig, formatCurrency, formatCompact, convertFromUsd]
    );

    return (
        <CurrencyContext.Provider value={value}>
            {children}
        </CurrencyContext.Provider>
    );
};

export const useCurrency = () => {
    const context = useContext(CurrencyContext);
    if (!context) {
        throw new Error('useCurrency must be used within a CurrencyProvider');
    }
    return context;
};

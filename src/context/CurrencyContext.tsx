'use client';

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useSyncExternalStore, ReactNode } from 'react';
import { getFxRates } from '@/app/actions';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY';

/** Display denomination for every bitcoin amount on the site. Display only — all math stays in BTC. */
export type Denomination = 'BTC' | 'SATS';

const CURRENCY_STORAGE_KEY = 'currency-preference';
const DENOMINATION_STORAGE_KEY = 'denomination-preference';

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
    /** Applies for this visit only — never writes the stored preference. For
     *  shared links, where the sharer's currency must not overwrite the visitor's. */
    setSessionCurrency: (code: CurrencyCode) => void;
    formatCurrency: (usdValue: number, maximumFractionDigits?: number) => string;
    formatCompact: (usdValue: number) => string;
    convertFromUsd: (usdValue: number) => number;
    /** Consistent BTC display: 4 decimals ≥1 BTC, 8 below, trailing zeros trimmed */
    formatBtc: (btc: number) => string;
    formatSats: (btc: number) => string;
    /** Persisted site-wide display denomination (BTC vs sats). */
    denomination: Denomination;
    setDenomination: (denomination: Denomination) => void;
    /** Renders a BTC amount in the active denomination (formatBtc or formatSats). */
    formatBtcAmount: (btc: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const subscribeStorage = (callback: () => void) => {
    window.addEventListener('storage', callback);
    return () => window.removeEventListener('storage', callback);
};

const readStoredCurrency = (): CurrencyCode | null => {
    try {
        const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
        return stored && CURRENCIES.some(c => c.code === stored) ? (stored as CurrencyCode) : null;
    } catch {
        return null; // private mode
    }
};

const readStoredDenomination = (): Denomination | null => {
    try {
        const stored = window.localStorage.getItem(DENOMINATION_STORAGE_KEY);
        return stored === 'BTC' || stored === 'SATS' ? stored : null;
    } catch {
        return null; // private mode
    }
};

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
    // Persisted preference read via the external-store pattern (hydration-safe:
    // the server snapshot is null → USD, the client re-renders with the stored value).
    const storedCurrency = useSyncExternalStore(subscribeStorage, readStoredCurrency, () => null);
    const [override, setOverride] = useState<CurrencyCode | null>(null);
    const currency: CurrencyCode = override ?? storedCurrency ?? 'USD';

    // Same hydration-safe pattern for the BTC/sats display denomination.
    const storedDenomination = useSyncExternalStore(subscribeStorage, readStoredDenomination, () => null);
    const [denominationOverride, setDenominationOverride] = useState<Denomination | null>(null);
    const denomination: Denomination = denominationOverride ?? storedDenomination ?? 'BTC';

    // Hardcoded rates are the fallback; live ECB rates replace them after mount.
    const [liveRates, setLiveRates] = useState<Partial<Record<CurrencyCode, number>>>({});

    useEffect(() => {
        let mounted = true;
        getFxRates()
            .then(rates => { if (mounted && rates) setLiveRates(rates); })
            .catch(() => { /* fall back to hardcoded rates */ });
        return () => { mounted = false; };
    }, []);

    const setCurrency = useCallback((code: CurrencyCode) => {
        setOverride(code);
        try { window.localStorage.setItem(CURRENCY_STORAGE_KEY, code); } catch { /* private mode */ }
    }, []);

    // The session override already wins (`override ?? storedCurrency`), so this
    // shapes the whole visit without touching storage.
    const setSessionCurrency = useCallback((code: CurrencyCode) => {
        setOverride(code);
    }, []);

    const setDenomination = useCallback((next: Denomination) => {
        setDenominationOverride(next);
        try { window.localStorage.setItem(DENOMINATION_STORAGE_KEY, next); } catch { /* private mode */ }
    }, []);

    const currencies = useMemo(
        () => CURRENCIES.map(c => {
            const live = liveRates[c.code];
            return live ? { ...c, rate: live } : c;
        }),
        [liveRates]
    );

    const currencyConfig = useMemo(
        () => currencies.find(c => c.code === currency) || currencies[0],
        [currencies, currency]
    );

    const convertFromUsd = useCallback(
        (usdValue: number) => usdValue * currencyConfig.rate,
        [currencyConfig.rate]
    );

    const formatCurrency = useCallback(
        (usdValue: number, maximumFractionDigits: number = 0) => {
            const converted = usdValue * currencyConfig.rate;
            const sign = converted < 0 ? '-' : '';
            const abs = Math.abs(converted);
            if (currencyConfig.code === 'JPY') {
                return `${sign}${currencyConfig.symbol}${Math.round(abs).toLocaleString('en-US')}`;
            }
            // Sub-unit prices (early BTC history) would otherwise render as "$0"
            const digits = abs > 0 && abs < 1 ? 4 : maximumFractionDigits;
            return `${sign}${currencyConfig.symbol}${abs.toLocaleString('en-US', { maximumFractionDigits: digits })}`;
        },
        [currencyConfig]
    );

    const formatBtc = useCallback((btc: number) => {
        if (!Number.isFinite(btc)) return '0 BTC';
        const abs = Math.abs(btc);
        const digits = abs >= 1 ? 4 : 8;
        return `${btc.toFixed(digits).replace(/\.?0+$/, '')} BTC`;
    }, []);

    const formatSats = useCallback((btc: number) => {
        if (!Number.isFinite(btc)) return '0 sats';
        return `${Math.floor(btc * 100_000_000).toLocaleString('en-US')} sats`;
    }, []);

    // Display-only: never route a sats figure through formatCurrency.
    const formatBtcAmount = useCallback(
        (btc: number) => (denomination === 'SATS' ? formatSats(btc) : formatBtc(btc)),
        [denomination, formatBtc, formatSats]
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
            currencies,
            setCurrency,
            setSessionCurrency,
            formatCurrency,
            formatCompact,
            convertFromUsd,
            formatBtc,
            formatSats,
            denomination,
            setDenomination,
            formatBtcAmount,
        }),
        [currency, currencyConfig, currencies, setCurrency, setSessionCurrency, formatCurrency, formatCompact, convertFromUsd, formatBtc, formatSats, denomination, setDenomination, formatBtcAmount]
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

'use client';

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, useSyncExternalStore, useDeferredValue, ReactNode } from 'react';
import { getFxSnapshot } from '@/app/actions';
import { isEmbedPath } from '@/components/nav/navPathname';
import {
    CURRENCY_CODES,
    CURRENCY_SYMBOLS,
    FX_FALLBACK_SNAPSHOT,
    currencyLabel,
    type CurrencyCode,
    type FxSnapshot,
} from '@/data/currencies';
import { parseUtcDate } from '@/utils/dates';
import { btcToSats } from '@/utils/units';
import { compactMoney, fxRequestWaitMs, rateNoteFor, shownCurrencyFor } from './currencyRules';

export type { CurrencyCode };
// Defined in utils/units, where server pages can reach it too. Still exported
// from here because the client components that format sats already import it
// alongside useCurrency.
export { btcToSats };

/** Display denomination for every bitcoin amount on the site. Display only — all math stays in BTC. */
export type Denomination = 'BTC' | 'SATS';

const CURRENCY_STORAGE_KEY = 'currency-preference';
const DENOMINATION_STORAGE_KEY = 'denomination-preference';

/**
 * Longest a currency picked in the picker waits for today's rates before the
 * dated ones in data/currencies are used instead (and labelled). The request
 * normally answers in a few hundred milliseconds; this only bounds a slow one.
 */
const FX_WAIT_MS = 2_500;
/** How often rates that are not live are asked for again while a tab stays open. */
const FX_RETRY_MS = 5 * 60_000;
/** Never ask more often than this, whatever triggers it. */
const FX_MIN_GAP_MS = 60_000;

export interface CurrencyConfig {
    code: CurrencyCode;
    symbol: string;
    rate: number;
    label: string;
}

interface CurrencyContextType {
    /**
     * The currency the visitor asked for: what the picker shows. Figures are
     * formatted in `currencyConfig`, which follows it once rates are in hand.
     */
    currency: CurrencyCode;
    /** The currency every figure is shown in right now, with its rate. */
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
    /**
     * True once ECB rates no more than a week old have loaded. False means the
     * rates in `currencies` are the dated ones from data/currencies (or older
     * ECB rates) and anything converted with them is approximate.
     */
    ratesLive: boolean;
    /** 'yyyy-MM-dd' the rates in `currencies` are dated. */
    ratesAsOf: string;
    /**
     * One plain sentence to show beside converted figures when the display
     * currency's rate is approximate; null for USD and for live rates.
     */
    rateNote: string | null;
    /**
     * Ask for today's rates if they are not loaded yet. Selecting a non-USD
     * currency does this by itself; call it when rates are needed for another
     * reason (amounts saved in a currency other than the one on display, or to
     * warm them as the picker is opened). Safe to call repeatedly.
     *
     * Returns 0 when a request was started or none is needed. Otherwise one
     * could not start yet (another is in flight, or the last was under a
     * minute ago) and this is the milliseconds until a call can start one.
     */
    ensureFxRates: () => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const subscribeStorage = (callback: () => void) => {
    window.addEventListener('storage', callback);
    return () => window.removeEventListener('storage', callback);
};

const readStoredCurrency = (): CurrencyCode | null => {
    try {
        const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
        return CURRENCY_CODES.find(code => code === stored) ?? null;
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

// The rates divide a visitor's contribution before any bitcoin math, so a
// malformed answer must never replace a usable table.
const isUsableSnapshot = (value: unknown): value is FxSnapshot => {
    if (!value || typeof value !== 'object') return false;
    const { rates, live, asOf } = value as Partial<FxSnapshot>;
    if (typeof live !== 'boolean' || typeof asOf !== 'string' || !Number.isFinite(parseUtcDate(asOf))) return false;
    if (!rates || typeof rates !== 'object') return false;
    return CURRENCY_CODES.every(code => Number.isFinite(rates[code]) && rates[code] > 0);
};

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
    // Persisted preference read via the external-store pattern (hydration-safe:
    // the server snapshot is null → USD, the client re-renders with the stored value).
    // The stored value is passed on as a deferred (transition) update. Applied
    // synchronously, the context change reaches the calculator's Suspense
    // boundary before it has hydrated, and React throws the server HTML away
    // and rebuilds it, ad iframes included, without logging anything.
    const storedCurrency = useDeferredValue(useSyncExternalStore(subscribeStorage, readStoredCurrency, () => null));
    const [override, setOverride] = useState<CurrencyCode | null>(null);
    const currency: CurrencyCode = override ?? storedCurrency ?? 'USD';

    // Same hydration-safe pattern for the BTC/sats display denomination.
    const storedDenomination = useDeferredValue(useSyncExternalStore(subscribeStorage, readStoredDenomination, () => null));
    const [denominationOverride, setDenominationOverride] = useState<Denomination | null>(null);
    const denomination: Denomination = denominationOverride ?? storedDenomination ?? 'BTC';

    // The dated rates in data/currencies until today's ECB rates are asked for
    // and arrive. A USD visitor never asks: USD needs no rate, and the request
    // used to cost every page view on every route a Server Action POST.
    const [fx, setFx] = useState<FxSnapshot>(FX_FALLBACK_SNAPSHOT);
    // True once that request has answered, failed, or been waited on for FX_WAIT_MS.
    const [ratesSettled, setRatesSettled] = useState(false);
    // True once a request has answered or failed. Waiting one out does not
    // set it: rates that are only late are not yet known to be unavailable.
    const [fxAnswered, setFxAnswered] = useState(false);
    // The currency a shared link arrived in, if one did.
    const [arrivedCurrency, setArrivedCurrency] = useState<CurrencyCode | null>(null);
    const fxRequest = useRef({ inFlight: false, lastTry: 0, live: false });

    const ensureFxRates = useCallback((): number => {
        if (typeof window === 'undefined') return 0;
        const request = fxRequest.current;
        if (request.live) return 0;
        // Nothing on /embed reads this context (the card is rendered on the
        // server with its own rates), and that route runs inside other
        // people's pages: their traffic should not cost a request per view.
        if (isEmbedPath(window.location.pathname)) return 0;
        const wait = fxRequestWaitMs(request, Date.now(), FX_MIN_GAP_MS);
        if (wait > 0) return wait;

        request.inFlight = true;
        request.lastTry = Date.now();
        getFxSnapshot()
            .then(snapshot => {
                if (!isUsableSnapshot(snapshot)) return;
                request.live = snapshot.live;
                setFx(snapshot);
            })
            .catch(() => { /* keep the dated rates; rateNote says so */ })
            .finally(() => {
                request.inFlight = false;
                setRatesSettled(true);
                setFxAnswered(true);
            });
        return 0;
    }, []);

    const shownCurrency = shownCurrencyFor(currency, ratesSettled, arrivedCurrency);

    useEffect(() => {
        if (currency === 'USD') return;
        ensureFxRates();
        if (ratesSettled) return;
        const timer = setTimeout(() => setRatesSettled(true), FX_WAIT_MS);
        return () => clearTimeout(timer);
    }, [currency, ratesSettled, ensureFxRates]);

    // Rates that are not live get asked for again, so "approximate" does not
    // outlast the outage in a tab that stays open. A retry that comes too soon
    // after the last request (the connection returning seconds after it
    // failed) is put off until one may start, not dropped: the next would
    // otherwise be the five-minute tick.
    useEffect(() => {
        if (currency === 'USD' || fx.live) return;
        let deferred: ReturnType<typeof setTimeout> | undefined;
        const retry = () => {
            if (document.hidden) return;
            const wait = ensureFxRates();
            if (wait > 0 && deferred === undefined) {
                deferred = setTimeout(() => {
                    deferred = undefined;
                    retry();
                }, wait);
            }
        };
        const interval = setInterval(retry, FX_RETRY_MS);
        document.addEventListener('visibilitychange', retry);
        window.addEventListener('online', retry);
        return () => {
            clearInterval(interval);
            clearTimeout(deferred);
            document.removeEventListener('visibilitychange', retry);
            window.removeEventListener('online', retry);
        };
    }, [currency, fx.live, ensureFxRates]);

    const setCurrency = useCallback((code: CurrencyCode) => {
        setOverride(code);
        try { window.localStorage.setItem(CURRENCY_STORAGE_KEY, code); } catch { /* private mode */ }
    }, []);

    // The session override already wins (`override ?? storedCurrency`), so this
    // shapes the whole visit without touching storage. Recorded as the arrival
    // currency too, which is shown at once (see shownCurrencyFor).
    const setSessionCurrency = useCallback((code: CurrencyCode) => {
        setArrivedCurrency(code);
        setOverride(code);
    }, []);

    const setDenomination = useCallback((next: Denomination) => {
        setDenominationOverride(next);
        try { window.localStorage.setItem(DENOMINATION_STORAGE_KEY, next); } catch { /* private mode */ }
    }, []);

    const currencies = useMemo<CurrencyConfig[]>(
        () => CURRENCY_CODES.map(code => ({
            code,
            symbol: CURRENCY_SYMBOLS[code],
            rate: code === 'USD' ? 1 : fx.rates[code],
            label: currencyLabel(code),
        })),
        [fx]
    );

    const currencyConfig = useMemo(
        () => currencies.find(c => c.code === shownCurrency) || currencies[0],
        [currencies, shownCurrency]
    );

    const rateNote = rateNoteFor({
        shown: shownCurrency,
        live: fx.live,
        settled: ratesSettled,
        answered: fxAnswered,
        asOf: fx.asOf,
    });

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
        return `${btcToSats(btc).toLocaleString('en-US')} sats`;
    }, []);

    // Display-only: never route a sats figure through formatCurrency.
    const formatBtcAmount = useCallback(
        (btc: number) => (denomination === 'SATS' ? formatSats(btc) : formatBtc(btc)),
        [denomination, formatBtc, formatSats]
    );

    const formatCompact = useCallback(
        (usdValue: number) => compactMoney(usdValue * currencyConfig.rate, currencyConfig),
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
            ratesLive: fx.live,
            ratesAsOf: fx.asOf,
            rateNote,
            ensureFxRates,
        }),
        [currency, currencyConfig, currencies, setCurrency, setSessionCurrency, formatCurrency, formatCompact, convertFromUsd, formatBtc, formatSats, denomination, setDenomination, formatBtcAmount, fx.live, fx.asOf, rateNote, ensureFxRates]
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

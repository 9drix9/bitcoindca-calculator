'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Copy, Check, Zap } from 'lucide-react';

const BTC_ADDRESS = 'bc1qg9vdwfcn2c4wv6dtfvhjd4j3fmq2kzhrt6cq6k';

// Lightning address, verified against its LNURL-pay endpoint
// (https://strike.me/.well-known/lnurlp/9drix9). Override per-deployment with
// NEXT_PUBLIC_LIGHTNING_ADDRESS; set it to an empty string to hide the row.
const LIGHTNING_ADDRESS = (process.env.NEXT_PUBLIC_LIGHTNING_ADDRESS ?? '9drix9@strike.me').trim();

const truncate = (value: string, lead = 6, tail = 6) =>
    value.length <= lead + tail + 1 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;

type Target = 'onchain' | 'lightning';

export const BtcDonationButton = () => {
    const [copied, setCopied] = useState<Target | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const handleCopy = useCallback(async (target: Target, value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(target);
        } catch {
            return; // insecure context or denied — leave the visible address selectable
        }
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(null), 1500);
    }, []);

    const rowClass = 'flex items-center gap-1';
    const buttonClass =
        'inline-flex items-center justify-center w-11 h-11 -my-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300';
    const codeClass = 'text-xs text-slate-500 dark:text-slate-400 font-mono';

    return (
        <div className="space-y-1">
            {LIGHTNING_ADDRESS && (
                <div className={rowClass}>
                    <Zap className="w-3 h-3 text-amber-500 shrink-0" aria-hidden="true" />
                    <code className={codeClass}>{truncate(LIGHTNING_ADDRESS, 8, 8)}</code>
                    <button
                        onClick={() => handleCopy('lightning', LIGHTNING_ADDRESS)}
                        className={buttonClass}
                        title={copied === 'lightning' ? 'Lightning address copied' : 'Copy Lightning address'}
                        aria-label={copied === 'lightning' ? 'Lightning address copied' : 'Copy Lightning donation address'}
                    >
                        {copied === 'lightning'
                            ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            : <Copy className="w-3.5 h-3.5" />}
                    </button>
                </div>
            )}

            <div className={rowClass}>
                <code className={codeClass}>{truncate(BTC_ADDRESS)}</code>
                <button
                    onClick={() => handleCopy('onchain', BTC_ADDRESS)}
                    className={buttonClass}
                    title={copied === 'onchain' ? 'Address copied' : 'Copy BTC address'}
                    aria-label={copied === 'onchain' ? 'Bitcoin address copied' : 'Copy on-chain BTC donation address'}
                >
                    {copied === 'onchain'
                        ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        : <Copy className="w-3.5 h-3.5" />}
                </button>
            </div>

            <span role="status" aria-live="polite" className="sr-only">
                {copied === 'lightning'
                    ? 'Lightning address copied to clipboard'
                    : copied === 'onchain'
                        ? 'Bitcoin address copied to clipboard'
                        : ''}
            </span>
        </div>
    );
};

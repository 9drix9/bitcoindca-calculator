'use client';

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

const BTC_ADDRESS = 'bc1qg9vdwfcn2c4wv6dtfvhjd4j3fmq2kzhrt6cq6k';

export const BtcDonationButton = () => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(BTC_ADDRESS);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Fallback: do nothing
        }
    }, []);

    return (
        <div className="flex items-center gap-1">
            <code className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                bc1qg9...t6cq6k
            </code>
            <button
                onClick={handleCopy}
                className="inline-flex items-center justify-center w-11 h-11 -my-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                title={copied ? 'Address copied' : 'Copy BTC address'}
                aria-label={copied ? 'Bitcoin address copied' : 'Copy BTC donation address'}
            >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <span role="status" className="sr-only">
                {copied ? 'Bitcoin address copied to clipboard' : ''}
            </span>
        </div>
    );
};

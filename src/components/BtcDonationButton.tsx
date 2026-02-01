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
        <div className="flex items-center gap-2">
            <code className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                bc1qg9...t6cq6k
            </code>
            <button
                onClick={handleCopy}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                title="Copy BTC address"
                aria-label="Copy BTC donation address"
            >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
        </div>
    );
};

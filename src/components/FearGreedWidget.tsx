'use client';

import { useState, useEffect } from 'react';
import { getFearGreedIndex } from '@/app/actions';

interface FearGreedData {
    value: number;
    classification: string;
}

interface FearGreedWidgetProps {
    initialData: FearGreedData | null;
}

const getValueColor = (value: number) => {
    if (value <= 25) return 'text-red-500';
    if (value <= 45) return 'text-orange-500';
    if (value <= 55) return 'text-yellow-500';
    if (value <= 75) return 'text-lime-500';
    return 'text-green-500';
};

export const FearGreedWidget = ({ initialData }: FearGreedWidgetProps) => {
    const [data, setData] = useState<FearGreedData | null>(initialData);

    useEffect(() => {
        let mounted = true;

        const refresh = async () => {
            try {
                const fresh = await getFearGreedIndex();
                if (mounted && fresh) setData(fresh);
            } catch {
                // keep showing last known data
            }
        };

        // Fetch fresh on mount
        refresh();

        // Poll every 5 minutes (this data changes slowly)
        const interval = setInterval(refresh, 5 * 60_000);
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    if (!data) return null;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <h4 className="font-semibold text-slate-800 dark:text-white mb-3 text-xs sm:text-sm">Fear &amp; Greed Index</h4>

            <div className="text-center mb-3">
                <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${getValueColor(data.value)}`}>
                    {data.value}
                </span>
                <span className="text-xs sm:text-sm text-slate-400 ml-0.5">/100</span>
                <p className={`text-xs sm:text-sm font-medium mt-0.5 ${getValueColor(data.value)}`}>
                    {data.classification}
                </p>
            </div>

            <div className="relative h-2.5 rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-yellow-500 to-green-500">
                <div
                    className="absolute top-0 w-1 h-full bg-white dark:bg-slate-950 border border-slate-400 rounded-full"
                    style={{ left: `${data.value}%`, transform: 'translateX(-50%)' }}
                />
            </div>
            <div className="flex justify-between mt-1">
                <span className="text-[9px] sm:text-[10px] text-slate-400">Extreme Fear</span>
                <span className="text-[9px] sm:text-[10px] text-slate-400">Extreme Greed</span>
            </div>

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <a
                    href="https://alternative.me/crypto/fear-and-greed-index/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] sm:text-xs text-slate-400 hover:text-amber-500 transition-colors"
                >
                    Data from alternative.me
                </a>
            </div>
        </div>
    );
};

'use client';

import { useState, useEffect, useRef } from 'react';
import { Flame } from 'lucide-react';
import { getMempoolFees } from '@/app/actions';
import { Card, CardHeader, StatRow, EmptyState } from '@/components/ui/Card';

interface MempoolFees {
    highFee: number;
    mediumFee: number;
    lowFee: number;
}

interface MempoolFeeWidgetProps {
    initialData: MempoolFees | null;
}

const POLL_MS = 30_000;

const getFeeColor = (fee: number) => {
    if (fee >= 100) return 'text-rose-700 dark:text-rose-400';
    if (fee >= 50) return 'text-orange-700 dark:text-orange-400';
    if (fee >= 20) return 'text-amber-700 dark:text-amber-400';
    if (fee >= 5) return 'text-yellow-700 dark:text-yellow-400';
    return 'text-emerald-700 dark:text-emerald-400';
};

const formatFee = (fee: number) => {
    if (fee >= 10) return fee.toFixed(0);
    if (fee >= 1) return fee.toFixed(1);
    return fee.toFixed(2);
};

export const MempoolFeeWidget = ({ initialData }: MempoolFeeWidgetProps) => {
    const [data, setData] = useState<MempoolFees | null>(initialData);
    const hadInitialData = useRef(initialData !== null);

    useEffect(() => {
        let mounted = true;
        // SSR data is seconds old at hydration; only fetch immediately when it is missing.
        let lastFetched = hadInitialData.current ? Date.now() : 0;

        const refresh = async () => {
            lastFetched = Date.now();
            try {
                const fresh = await getMempoolFees();
                if (mounted && fresh) setData(fresh);
            } catch {
                // keep showing last known data
            }
        };

        if (!hadInitialData.current) refresh();

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

    const fees = data
        ? [
              { label: 'High', value: data.highFee, desc: '~10 min' },
              { label: 'Medium', value: data.mediumFee, desc: '~30 min' },
              { label: 'Low', value: data.lowFee, desc: '~60 min' },
          ]
        : null;

    return (
        <Card className="p-4">
            <CardHeader icon={<Flame className="w-4 h-4" />} title="Mempool Fees" className="mb-3" />

            {fees ? (
                <div className="space-y-2">
                    {fees.map((fee) => (
                        <StatRow
                            key={fee.label}
                            label={
                                <>
                                    {fee.label}{' '}
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400">({fee.desc})</span>
                                </>
                            }
                            value={
                                <>
                                    <span className={getFeeColor(fee.value)}>{formatFee(fee.value)}</span>{' '}
                                    <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">sat/vB</span>
                                </>
                            }
                        />
                    ))}
                </div>
            ) : (
                <EmptyState />
            )}

            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <a
                    href="https://mempool.space"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                >
                    Data from mempool.space
                </a>
            </div>
        </Card>
    );
};

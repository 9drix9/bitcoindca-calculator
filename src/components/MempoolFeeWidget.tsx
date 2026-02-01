'use client';

interface MempoolFees {
    fastestFee: number;
    halfHourFee: number;
    hourFee: number;
    economyFee: number;
    minimumFee: number;
}

interface MempoolFeeWidgetProps {
    initialData: MempoolFees | null;
}

const getFeeColor = (fee: number) => {
    if (fee >= 100) return 'text-red-500';
    if (fee >= 50) return 'text-orange-500';
    if (fee >= 20) return 'text-amber-500';
    return 'text-green-500';
};

export const MempoolFeeWidget = ({ initialData }: MempoolFeeWidgetProps) => {
    if (!initialData) return null;

    const fees = [
        { label: 'High', value: initialData.fastestFee, desc: '~10 min' },
        { label: 'Medium', value: initialData.halfHourFee, desc: '~30 min' },
        { label: 'Low', value: initialData.hourFee, desc: '~60 min' },
    ];

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
            <h4 className="font-semibold text-slate-800 dark:text-white mb-3 text-xs sm:text-sm">Mempool Fees</h4>
            <div className="space-y-2">
                {fees.map((fee) => (
                    <div key={fee.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-600 dark:text-slate-400">{fee.label}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">({fee.desc})</span>
                        </div>
                        <span className={`text-xs sm:text-sm font-mono font-semibold tabular-nums ${getFeeColor(fee.value)}`}>
                            {fee.value} <span className="text-[10px] font-normal text-slate-400">sat/vB</span>
                        </span>
                    </div>
                ))}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <a
                    href="https://mempool.space"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] sm:text-xs text-slate-400 hover:text-amber-500 transition-colors"
                >
                    Data from mempool.space
                </a>
            </div>
        </div>
    );
};

'use client';

import clsx from 'clsx';

interface ExchangeFeeComparisonProps {
    totalInvested: number;
    purchaseCount: number;
}

const EXCHANGES = [
    { name: 'Strike', feeRate: 0 },
    { name: 'River', feeRate: 0 },
    { name: 'Binance', feeRate: 0.1 },
    { name: 'Kraken', feeRate: 0.26 },
    { name: 'Swan', feeRate: 0.99 },
    { name: 'Coinbase', feeRate: 1.49 },
];

export const ExchangeFeeComparison = ({ totalInvested, purchaseCount }: ExchangeFeeComparisonProps) => {
    if (totalInvested <= 0 || purchaseCount <= 0) return null;

    const maxFeeRate = Math.max(...EXCHANGES.map(e => e.feeRate));

    return (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 mb-0.5">Exchange Fee Comparison</h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-3 sm:mb-4">
                Fees on ${totalInvested.toLocaleString()} across {purchaseCount} purchases
            </p>

            <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-xs sm:text-sm min-w-[480px]">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                            <th className="text-left px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Exchange</th>
                            <th className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Rate</th>
                            <th className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Total Fees</th>
                            <th className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Net Invested</th>
                            <th className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Per Purchase</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {EXCHANGES.map((exchange) => {
                            const totalFees = totalInvested * (exchange.feeRate / 100);
                            const netInvested = totalInvested - totalFees;
                            const feePerPurchase = purchaseCount > 0 ? totalFees / purchaseCount : 0;
                            const isZeroFee = exchange.feeRate === 0;
                            const isHighest = exchange.feeRate === maxFeeRate;

                            return (
                                <tr key={exchange.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                                        <span className="flex items-center gap-1.5">
                                            <span className="font-medium text-slate-700 dark:text-slate-300">{exchange.name}</span>
                                            {isZeroFee && (
                                                <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 leading-none">
                                                    0%
                                                </span>
                                            )}
                                        </span>
                                    </td>
                                    <td className={clsx(
                                        "px-3 sm:px-4 py-2 text-right whitespace-nowrap",
                                        isZeroFee ? "text-green-600 dark:text-green-400 font-medium" : isHighest ? "text-red-500 font-medium" : "text-slate-600 dark:text-slate-400"
                                    )}>
                                        {exchange.feeRate}%
                                    </td>
                                    <td className={clsx(
                                        "px-3 sm:px-4 py-2 text-right whitespace-nowrap",
                                        isZeroFee ? "text-green-600 dark:text-green-400" : isHighest ? "text-red-500" : "text-slate-600 dark:text-slate-400"
                                    )}>
                                        ${totalFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap text-slate-600 dark:text-slate-400">
                                        ${netInvested.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </td>
                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap text-slate-600 dark:text-slate-400">
                                        ${feePerPurchase.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

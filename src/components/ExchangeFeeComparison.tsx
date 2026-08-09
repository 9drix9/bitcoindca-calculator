'use client';

import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader } from '@/components/ui/Card';
import clsx from 'clsx';

interface ExchangeFeeComparisonProps {
    totalInvested: number;
    purchaseCount: number;
}

const EXCHANGES: { name: string; feeRate: number; note?: string }[] = [
    { name: 'Strike', feeRate: 0, note: 'excludes spread' },
    { name: 'River', feeRate: 0, note: 'recurring buys; excludes spread' },
    { name: 'Binance', feeRate: 0.1 },
    { name: 'Kraken', feeRate: 0.26 },
    { name: 'Swan', feeRate: 0.99 },
    { name: 'Coinbase', feeRate: 1.49 },
    { name: 'Cash App', feeRate: 2.2, note: 'approx.; varies by amount' },
];

export const ExchangeFeeComparison = ({ totalInvested, purchaseCount }: ExchangeFeeComparisonProps) => {
    const { formatCurrency } = useCurrency();

    if (totalInvested <= 0 || purchaseCount <= 0) return null;

    const maxFeeRate = Math.max(...EXCHANGES.map(e => e.feeRate));

    return (
        <Card className="p-4 sm:p-6">
            <CardHeader
                title="Exchange Fee Comparison"
                subtitle={<>What {formatCurrency(totalInvested)} over {purchaseCount} purchase{purchaseCount === 1 ? '' : 's'} costs you in fees</>}
                className="mb-3 sm:mb-4"
            />

            <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-xs sm:text-sm min-w-[480px]">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                            <th scope="col" className="text-left px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Exchange</th>
                            <th scope="col" className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Rate</th>
                            <th scope="col" className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Total Fees</th>
                            <th scope="col" className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Net Invested</th>
                            <th scope="col" className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Per Purchase</th>
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
                                                <span className="text-[11px] font-medium px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 leading-none">
                                                    0%
                                                </span>
                                            )}
                                            {exchange.note && (
                                                <span className="text-[11px] text-slate-500 dark:text-slate-400">{exchange.note}</span>
                                            )}
                                        </span>
                                    </td>
                                    <td className={clsx(
                                        "px-3 sm:px-4 py-2 text-right whitespace-nowrap tabular-nums",
                                        isZeroFee ? "text-gain font-medium" : isHighest ? "text-loss font-medium" : "text-slate-600 dark:text-slate-400"
                                    )}>
                                        {exchange.feeRate}%
                                    </td>
                                    <td className={clsx(
                                        "px-3 sm:px-4 py-2 text-right whitespace-nowrap tabular-nums",
                                        isZeroFee ? "text-gain" : isHighest ? "text-loss" : "text-slate-600 dark:text-slate-400"
                                    )}>
                                        {formatCurrency(totalFees)}
                                    </td>
                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                                        {formatCurrency(netInvested)}
                                    </td>
                                    <td className="px-3 sm:px-4 py-2 text-right whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                                        {formatCurrency(feePerPurchase)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <p className="mt-3 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Rates last verified July 2026. These percentages cover the trading fee on each purchase and nothing
                else. Your own rate can move with your order size and how much you trade. Exchanges also earn a
                spread, the gap between the price they buy at and the price they sell at. Strike and River&apos;s 0%
                leaves their spread out, and Cash App&apos;s ~2.2% is an approximation that varies by purchase amount.
            </p>
        </Card>
    );
};

'use client';

import { useCurrency } from '@/context/CurrencyContext';
import { Card, CardHeader } from '@/components/ui/Card';
import clsx from 'clsx';

interface ExchangeFeeComparisonProps {
    totalInvested: number;
    purchaseCount: number;
}

/**
 * Effective cost of a RECURRING buy on each platform, verified August 2026.
 * The platforms price differently — some charge an explicit fee, some only a
 * spread, Coinbase a flat dollar amount per order — so each row carries its
 * own basis. `flatPerBuyUsd` models the flat component; a percentage alone
 * would be wrong for it at most order sizes. Sources:
 * Cash App cash.app/bitcoin/fees; Strike strike.me/faq; River river.com/zero-fee;
 * Swan help.swanbitcoin.com (360045394134); Kraken support article 360030303832.
 */
const VERIFIED_LABEL = 'August 2026';
const EXCHANGES: { name: string; rate: number; flatPerBuyUsd?: number; rateLabel: string; note?: string }[] = [
    { name: 'Cash App', rate: 0, rateLabel: '0%', note: 'recurring buys: no fee, no spread' },
    { name: 'Strike', rate: 0.22, rateLabel: '~0.22%', note: 'spread only; recurring buys fee-free after week one' },
    { name: 'River', rate: 0.25, rateLabel: '~0.25%', note: 'spread only; recurring buys fee-free after week one' },
    { name: 'Swan', rate: 0.5, rateLabel: '0.5%', note: 'promo until Sep 8, 2026, then 1%' },
    { name: 'Kraken', rate: 1, rateLabel: '1% + spread', note: 'Instant Buy fee; spread not included' },
    { name: 'Coinbase', rate: 0.5, flatPerBuyUsd: 2.99, rateLabel: '$2.99 + ~0.5%', note: 'flat fee per buy plus spread' },
];

export const ExchangeFeeComparison = ({ totalInvested, purchaseCount }: ExchangeFeeComparisonProps) => {
    const { formatCurrency } = useCurrency();

    if (totalInvested <= 0 || purchaseCount <= 0) return null;

    const rows = EXCHANGES.map((exchange) => {
        const totalFees = totalInvested * (exchange.rate / 100) + (exchange.flatPerBuyUsd ?? 0) * purchaseCount;
        return { ...exchange, totalFees };
    });
    const maxTotalFees = Math.max(...rows.map((r) => r.totalFees));

    return (
        <Card className="p-4 sm:p-6">
            <CardHeader
                title="Exchange Fee Comparison"
                subtitle={<>What {formatCurrency(totalInvested)} over {purchaseCount} recurring purchase{purchaseCount === 1 ? '' : 's'} costs you, at rates as of {VERIFIED_LABEL}</>}
                className="mb-3 sm:mb-4"
            />

            <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-xs sm:text-sm min-w-[480px]">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                            <th scope="col" className="text-left px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Exchange</th>
                            <th scope="col" className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Pricing</th>
                            <th scope="col" className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Total Fees</th>
                            <th scope="col" className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Net Invested</th>
                            <th scope="col" className="text-right px-3 sm:px-4 py-2.5 font-medium whitespace-nowrap">Per Purchase</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {rows.map((exchange) => {
                            const netInvested = totalInvested - exchange.totalFees;
                            const feePerPurchase = purchaseCount > 0 ? exchange.totalFees / purchaseCount : 0;
                            const isZeroFee = exchange.totalFees === 0;
                            const isHighest = exchange.totalFees === maxTotalFees;

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
                                        {exchange.rateLabel}
                                    </td>
                                    <td className={clsx(
                                        "px-3 sm:px-4 py-2 text-right whitespace-nowrap tabular-nums",
                                        isZeroFee ? "text-gain" : isHighest ? "text-loss" : "text-slate-600 dark:text-slate-400"
                                    )}>
                                        {formatCurrency(exchange.totalFees)}
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
                Rates last verified {VERIFIED_LABEL}, and each platform charges differently, so these are effective
                costs of a recurring buy, not one comparable fee. Cash App charges no fee and no spread on
                recurring buys. Strike and River charge no fee on recurring buys after the first week, so their
                cost is the spread (Strike&apos;s first buy runs ~1.11% all-in). Swan&apos;s 0.5% is a promotional
                rate through September 8, 2026, after which its standard 1% returns. Kraken&apos;s 1% Instant Buy
                fee excludes its spread (0.5&ndash;2%) and any card or payment cost. Coinbase charges a flat fee
                per order ($2.99 on a $50&ndash;200 buy; other sizes differ) plus roughly 0.5% spread, which hits
                small orders hardest. Your own rate moves with order size and payment method.
            </p>
        </Card>
    );
};

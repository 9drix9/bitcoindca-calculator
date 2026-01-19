import { DcaParams, DcaResult, DcaBreakdownItem } from '@/types';
import { differenceInDays, addDays, addWeeks, addMonths, isAfter, isSameDay, startOfDay } from 'date-fns';

export function calculateDca(params: DcaParams, priceData?: [number, number][], currentPrice?: number | null): DcaResult {
    const { amount, frequency, startDate, endDate, feePercentage, priceMode, manualPrice } = params;

    let currentDate = startOfDay(startDate);
    const end = startOfDay(endDate);

    let totalInvested = 0;
    let totalBtc = 0;

    const breakdown: DcaBreakdownItem[] = [];

    const priceMap = new Map<string, number>();
    if (priceData) {
        priceData.forEach(([ts, price]) => {
            const dateKey = startOfDay(new Date(ts)).toISOString();
            if (!priceMap.has(dateKey)) {
                priceMap.set(dateKey, price);
            }
        });
    }

    let lastKnownPrice = manualPrice > 0 ? manualPrice : 0;
    if (priceData && priceData.length > 0) {
        lastKnownPrice = priceData[0][1];
    }

    while (!isAfter(currentDate, end)) {
        let purchasePrice = manualPrice;

        if (priceMode === 'api' && priceData) {
            const dateKey = currentDate.toISOString();
            if (priceMap.has(dateKey)) {
                purchasePrice = priceMap.get(dateKey)!;
                lastKnownPrice = purchasePrice;
            } else {
                purchasePrice = lastKnownPrice;
            }
        }

        if (purchasePrice > 0) {
            const netInvestment = amount * (1 - feePercentage / 100);
            const btcBought = netInvestment / purchasePrice;

            totalInvested += amount;
            totalBtc += btcBought;

            breakdown.push({
                date: currentDate.toISOString(),
                price: purchasePrice,
                invested: amount,
                totalInvested: totalInvested,
                accumulated: btcBought,
                totalAccumulated: totalBtc,
                portfolioValue: totalBtc * purchasePrice
            });
        }

        switch (frequency) {
            case 'daily':
                currentDate = addDays(currentDate, 1);
                break;
            case 'weekly':
                currentDate = addWeeks(currentDate, 1);
                break;
            case 'biweekly':
                currentDate = addWeeks(currentDate, 2);
                break;
            case 'monthly':
                currentDate = addMonths(currentDate, 1);
                break;
        }
    }

    let finalPrice = currentPrice || manualPrice;
    // If no explicit currentPrice given, and we are in API mode, use the last historical price
    if (!currentPrice && priceMode === 'api' && priceData && priceData.length > 0) {
        finalPrice = priceData[priceData.length - 1][1];
    }
    // If manual mode, manualPrice is used (already set as default for finalPrice)

    const currentValue = totalBtc * finalPrice;
    const averageCost = totalBtc > 0 ? totalInvested / totalBtc : 0;
    const profit = currentValue - totalInvested;
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    return {
        totalInvested,
        btcAccumulated: totalBtc,
        averageCost,
        currentValue,
        profit,
        roi,
        breakdown
    };
}

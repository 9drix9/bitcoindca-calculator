import { DcaParams, DcaResult, DcaBreakdownItem, LumpSumResult, AssetDcaResult, Frequency } from '@/types';
import { addDays, addWeeks, addMonths, isAfter, startOfDay } from 'date-fns';

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
            const clampedFee = Math.min(100, Math.max(0, feePercentage));
            const netInvestment = amount * (1 - clampedFee / 100);
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

export function calculateAssetDca(
    amount: number,
    frequency: Frequency,
    startDate: Date,
    endDate: Date,
    feePercentage: number,
    priceData: [number, number][],
    asset: string,
    label: string
): AssetDcaResult {
    const priceMap = new Map<string, number>();
    priceData.forEach(([ts, price]) => {
        const dateKey = startOfDay(new Date(ts)).toISOString();
        if (!priceMap.has(dateKey)) {
            priceMap.set(dateKey, price);
        }
    });

    let currentDate = startOfDay(startDate);
    const end = startOfDay(endDate);

    let totalInvested = 0;
    let totalUnits = 0;
    let lastKnownPrice = priceData.length > 0 ? priceData[0][1] : 0;

    const breakdown: { date: string; portfolioValue: number }[] = [];

    while (!isAfter(currentDate, end)) {
        const dateKey = currentDate.toISOString();
        let purchasePrice = lastKnownPrice;

        if (priceMap.has(dateKey)) {
            purchasePrice = priceMap.get(dateKey)!;
            lastKnownPrice = purchasePrice;
        }

        if (purchasePrice > 0) {
            const clampedFee = Math.min(100, Math.max(0, feePercentage));
            const netInvestment = amount * (1 - clampedFee / 100);
            const unitsBought = netInvestment / purchasePrice;

            totalInvested += amount;
            totalUnits += unitsBought;

            breakdown.push({
                date: currentDate.toISOString(),
                portfolioValue: totalUnits * purchasePrice
            });
        }

        switch (frequency) {
            case 'daily': currentDate = addDays(currentDate, 1); break;
            case 'weekly': currentDate = addWeeks(currentDate, 1); break;
            case 'biweekly': currentDate = addWeeks(currentDate, 2); break;
            case 'monthly': currentDate = addMonths(currentDate, 1); break;
        }
    }

    const finalPrice = priceData.length > 0 ? priceData[priceData.length - 1][1] : 0;
    const currentValue = totalUnits * finalPrice;
    const profit = currentValue - totalInvested;
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    return { asset, label, totalInvested, currentValue, profit, roi, breakdown };
}

export function calculateLumpSum(
    totalAmount: number,
    startDate: Date,
    priceData: [number, number][],
    currentPrice: number
): LumpSumResult {
    if (!priceData || priceData.length === 0 || currentPrice <= 0) {
        return { totalInvested: totalAmount, btcAccumulated: 0, currentValue: 0, profit: -totalAmount, roi: -100 };
    }

    // Find the price entry closest to (at or after) the user's start date
    const startTs = startOfDay(startDate).getTime();
    let entryPrice = 0;
    for (const [ts, price] of priceData) {
        if (ts >= startTs) {
            entryPrice = price;
            break;
        }
    }
    // If no entry at/after start date, use the last available price
    if (entryPrice <= 0) {
        entryPrice = priceData[priceData.length - 1][1];
    }
    if (entryPrice <= 0) {
        return { totalInvested: totalAmount, btcAccumulated: 0, currentValue: 0, profit: -totalAmount, roi: -100 };
    }

    const btcAccumulated = totalAmount / entryPrice;
    const currentValue = btcAccumulated * currentPrice;
    const profit = currentValue - totalAmount;
    const roi = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;

    return { totalInvested: totalAmount, btcAccumulated, currentValue, profit, roi };
}

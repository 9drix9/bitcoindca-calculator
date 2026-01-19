export type Frequency = 'daily' | 'weekly' | 'monthly' | 'biweekly';

export type PriceMode = 'api' | 'manual';

export interface DcaParams {
    amount: number;
    frequency: Frequency;
    startDate: Date;
    endDate: Date;
    feePercentage: number;
    priceMode: PriceMode;
    manualPrice: number; // Used if mode is manual or API fails
}

export interface DcaResult {
    totalInvested: number;
    btcAccumulated: number;
    averageCost: number;
    currentValue: number;
    profit: number;
    roi: number;
    breakdown: DcaBreakdownItem[];
    error?: string;
}

export interface DcaBreakdownItem {
    date: string;
    price: number;
    invested: number;
    totalInvested: number;
    accumulated: number;
    totalAccumulated: number;
    portfolioValue: number;
}

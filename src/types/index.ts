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

export interface ResultCardProps {
    label: string;
    value: string;
    subValue?: string;
    highlight?: boolean;
    valueColor?: string;
    icon?: React.ReactNode;
    subValueColor?: string;
    action?: React.ReactNode;
}

export interface LumpSumResult {
    totalInvested: number;
    btcAccumulated: number;
    currentValue: number;
    profit: number;
    roi: number;
}

export interface AssetDcaResult {
    asset: string;
    label: string;
    totalInvested: number;
    currentValue: number;
    profit: number;
    roi: number;
    breakdown: { date: string; portfolioValue: number }[];
}

export interface CalculatorSearchParams {
    amount?: string;
    frequency?: string;
    startDate?: string;
    endDate?: string;
    fee?: string;
    mode?: string;
    provider?: string;
    manualPrice?: string;
}

export interface CostBasisPosition {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    amount: number;
    frequency: Frequency;
    feePercentage: number;
}

export interface AppreciationScenario {
    label: string;
    rate: number; // annual appreciation rate as decimal (e.g. 0.10 for 10%)
}

export interface HistoricalEvent {
    date: string;
    label: string;
    color: string;
}

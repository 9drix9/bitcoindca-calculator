'use client';

import { HalvingCountdownWidget } from './HalvingCountdownWidget';
import { LiveBlocksWidget } from './LiveBlocksWidget';
import { FearGreedWidget } from './FearGreedWidget';
import { MempoolFeeWidget } from './MempoolFeeWidget';
import { HashRateWidget } from './HashRateWidget';
import { SupplyScarcityWidget } from './SupplyScarcityWidget';
import { PurchasingPowerWidget } from './PurchasingPowerWidget';
import { LightningWidget } from './LightningWidget';
import { DominanceWidget } from './DominanceWidget';
import { SatConverterWidget } from './SatConverterWidget';
import { AdSlot } from './AdSlot';

interface SidebarWidgetsProps {
    blockHeight: number | null;
    recentBlocks: { height: number; timestamp: number; txCount: number; size: number }[] | null;
    fearGreed: { value: number; classification: string } | null;
    mempoolFees: { highFee: number; mediumFee: number; lowFee: number } | null;
    hashRateData: { hashrate: number; difficulty: number; adjustmentPercent: number; blocksUntilAdjustment: number; estimatedRetargetDate: string } | null;
    circulatingSupply: number | null;
    purchasingPowerData: { cpiStart: number; cpiNow: number; btcPriceStart: number; btcPriceNow: number } | null;
    lightningData: { nodeCount: number; channelCount: number; totalCapacityBtc: number } | null;
    dominanceData: { dominancePercent: number; btcMarketCap: number; totalMarketCap: number } | null;
}

export const SidebarWidgets = ({
    blockHeight,
    recentBlocks,
    fearGreed,
    mempoolFees,
    hashRateData,
    circulatingSupply,
    purchasingPowerData,
    lightningData,
    dominanceData,
}: SidebarWidgetsProps) => (
    <>
        <HalvingCountdownWidget initialHeight={blockHeight} />
        <LiveBlocksWidget initialData={recentBlocks} />
        <FearGreedWidget initialData={fearGreed} />
        <MempoolFeeWidget initialData={mempoolFees} />
        <HashRateWidget initialData={hashRateData} />
        <SupplyScarcityWidget initialSupply={circulatingSupply} blockHeight={blockHeight} />
        <PurchasingPowerWidget initialData={purchasingPowerData} />
        <LightningWidget initialData={lightningData} />
        <DominanceWidget initialData={dominanceData} />
        <SatConverterWidget />
        <AdSlot unitId="2426251" />
    </>
);

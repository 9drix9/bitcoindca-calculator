'use client';

import { useMemo } from 'react';
import { CostBasisTracker } from '@/components/CostBasisTracker';
import type { PriceProvider } from '@/data/priceSources';
import { unpackDailyPrices, type PackedDailyPrices } from '@/app/calculators/bitcoin-cost-basis/priceSeed';

/**
 * The tracker, fed the whole price history that this page loads with.
 *
 * The history crosses from the server to the browser packed (see priceSeed)
 * and is unpacked here, on the browser's side of that line. With the whole
 * history already in hand the tracker has nothing to ask the server for, which
 * is what lets the page say that nothing a visitor enters leaves the browser.
 */
export function SeededCostBasisTracker({
    seed,
    livePrice,
    priceAsOf,
    priceAsOfIsDay,
    provider,
}: {
    seed: PackedDailyPrices;
    livePrice: number;
    priceAsOf: number;
    /** True when `livePrice` is the newest daily price and `priceAsOf` its UTC day, not the instant of a quote. */
    priceAsOfIsDay: boolean;
    provider: PriceProvider;
}) {
    const priceData = useMemo(() => unpackDailyPrices(seed), [seed]);
    return (
        <CostBasisTracker
            priceData={priceData}
            livePrice={livePrice}
            priceAsOf={priceAsOf}
            priceAsOfIsDay={priceAsOfIsDay}
            priceMode="api"
            provider={provider}
        />
    );
}

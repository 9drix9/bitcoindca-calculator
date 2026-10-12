/**
 * The lot arithmetic behind the cost-basis page's "same sale, three rules"
 * table. Kept out of the page so the three figures can be tested.
 */

/** One purchase: the price paid per bitcoin and the bitcoin it bought. */
export interface Lot {
    price: number;
    btc: number;
}

/** Cost of disposing `qty` BTC by consuming lots in the given order. */
export function disposalCost(lots: readonly Lot[], qty: number): number {
    let remaining = qty;
    let cost = 0;
    for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.btc, remaining);
        cost += take * lot.price;
        remaining -= take;
    }
    return cost;
}

/**
 * What the same disposal costs under each rule for choosing lots. `lots` are
 * in purchase order, oldest first.
 */
export function disposalCostByRule(lots: readonly Lot[], qty: number): { fifo: number; lifo: number; hifo: number } {
    return {
        fifo: disposalCost(lots, qty),
        lifo: disposalCost([...lots].reverse(), qty),
        hifo: disposalCost([...lots].sort((a, b) => b.price - a.price), qty),
    };
}

import { DcaBreakdownItem } from '@/types';
import { formatUtc } from '@/utils/dates';

export function escapeCsvField(value: string): string {
    // Prevent CSV injection: prefix formula-triggering characters with a single quote
    if (/^[=+\-@\t\r]/.test(value)) {
        value = `'${value}`;
    }
    // Quote fields that contain commas, quotes, or newlines
    if (/[",\n\r]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * The purchase table as CSV, with the money columns in `currency`.
 *
 * Every money figure is the US-dollar figure times `currency.rate`: one
 * exchange rate for the whole file, not the rate on each row's own day. A file
 * is read away from the page that says so, so a file in any currency but USD
 * carries the rate in a column of its own, dated when `asOf` ('yyyy-MM-dd') is
 * given. A USD file has no such column.
 */
export function generateCsvContent(
    breakdown: DcaBreakdownItem[],
    currency: { code: string; rate: number; asOf?: string } = { code: 'USD', rate: 1 },
): string {
    const c = currency.code;
    // 'Price Kind' is appended only when the price series said which prices were
    // observed and which were estimated: a column of blanks would read like
    // "nothing here was estimated".
    const hasPriceKinds = breakdown.some(item => item.priceKind !== undefined);
    const converted = c !== 'USD';
    const headers = ['Date', `BTC Price (${c})`, `Amount Invested (${c})`, 'BTC Bought', `Cumulative Invested (${c})`, 'Cumulative BTC', `Portfolio Value (${c})`, 'Type'];
    if (hasPriceKinds) headers.push('Price Kind');
    if (converted) {
        const dated = currency.asOf ? `; dated ${currency.asOf}` : '';
        headers.push(escapeCsvField(`Exchange Rate For Every Row (${c} per USD${dated})`));
    }
    const rows = breakdown.map(item => {
        const fields = [
            escapeCsvField(formatUtc(item.date, 'isoDay')),
            escapeCsvField((item.price * currency.rate).toFixed(2)),
            escapeCsvField((item.invested * currency.rate).toFixed(2)),
            escapeCsvField(item.accumulated.toFixed(8)),
            escapeCsvField((item.totalInvested * currency.rate).toFixed(2)),
            escapeCsvField(item.totalAccumulated.toFixed(8)),
            escapeCsvField((item.portfolioValue * currency.rate).toFixed(2)),
            // A starting stack is a position carried in, not a market buy.
            escapeCsvField(item.isStartingStack ? 'starting stack' : 'buy'),
        ];
        // 'observed' or 'estimated'; blank where the price is not a market price
        // (a starting stack costed at the average the user entered).
        if (hasPriceKinds) fields.push(escapeCsvField(item.priceKind ?? ''));
        if (converted) fields.push(escapeCsvField(String(currency.rate)));
        return fields.join(',');
    });

    return [headers.join(','), ...rows].join('\n');
}

export function downloadCsv(content: string, filename: string): void {
    // Prepend UTF-8 BOM so Excel reads encoding correctly
    const bom = '﻿';
    const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

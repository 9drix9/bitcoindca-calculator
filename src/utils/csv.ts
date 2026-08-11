import { DcaBreakdownItem } from '@/types';
import { formatUtc } from '@/utils/dates';

function escapeCsvField(value: string): string {
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

export function generateCsvContent(
    breakdown: DcaBreakdownItem[],
    currency: { code: string; rate: number } = { code: 'USD', rate: 1 },
): string {
    const c = currency.code;
    const headers = ['Date', `BTC Price (${c})`, `Amount Invested (${c})`, 'BTC Bought', `Cumulative Invested (${c})`, 'Cumulative BTC', `Portfolio Value (${c})`, 'Type'];
    const rows = breakdown.map(item => [
        escapeCsvField(formatUtc(item.date, 'isoDay')),
        escapeCsvField((item.price * currency.rate).toFixed(2)),
        escapeCsvField((item.invested * currency.rate).toFixed(2)),
        escapeCsvField(item.accumulated.toFixed(8)),
        escapeCsvField((item.totalInvested * currency.rate).toFixed(2)),
        escapeCsvField(item.totalAccumulated.toFixed(8)),
        escapeCsvField((item.portfolioValue * currency.rate).toFixed(2)),
        // A starting stack is a position carried in, not a market buy — leaving
        // it unlabeled made it indistinguishable from a purchase in exports.
        escapeCsvField(item.isStartingStack ? 'starting stack' : 'buy'),
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
}

export function downloadCsv(content: string, filename: string): void {
    // Prepend UTF-8 BOM so Excel reads encoding correctly
    const bom = '\uFEFF';
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

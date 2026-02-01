import { DcaBreakdownItem } from '@/types';
import { format } from 'date-fns';

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

export function generateCsvContent(breakdown: DcaBreakdownItem[]): string {
    const headers = ['Date', 'BTC Price', 'Amount Invested', 'BTC Bought', 'Cumulative Invested', 'Cumulative BTC', 'Portfolio Value'];
    const rows = breakdown.map(item => [
        escapeCsvField(format(new Date(item.date), 'yyyy-MM-dd')),
        escapeCsvField(item.price.toFixed(2)),
        escapeCsvField(item.invested.toFixed(2)),
        escapeCsvField(item.accumulated.toFixed(8)),
        escapeCsvField(item.totalInvested.toFixed(2)),
        escapeCsvField(item.totalAccumulated.toFixed(8)),
        escapeCsvField(item.portfolioValue.toFixed(2)),
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

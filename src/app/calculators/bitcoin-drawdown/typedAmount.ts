/**
 * A number typed into a text field, read the way the person typing it meant.
 *
 * A phone set to most European regions puts a comma on the decimal keypad and
 * no dot, so "0,5" has to be half a bitcoin, not 5.
 *
 * The text settles every case but one: a single comma followed by exactly
 * three digits ("1,250"). `loneComma` says how to read that one.
 *
 *  - 'decimal': the comma is the decimal mark. For a bitcoin amount, where
 *    1.25 BTC is a stack and 1,250 BTC is not.
 *  - 'auto': a thousands separator when the text is in strict 1,234 form, the
 *    decimal mark otherwise. For money and sats, where "4,000" is four thousand.
 *
 * Text with no comma goes to Number() unchanged, so "4.000" is still 4: a lone
 * dot cannot be told from a decimal point without knowing the locale.
 *
 * Null for empty, half-typed ("-", ".") or unreadable text, never 0.
 */
export type LoneComma = 'decimal' | 'auto';

const GROUPED_BY_COMMA = /^-?[1-9]\d{0,2}(,\d{3})+(\.\d*)?$/; // 1,234   12,345,678.9
const GROUPED_BY_DOT = /^-?[1-9]\d{0,2}(\.\d{3})+,\d*$/; // 1.234,5

export function readTypedAmount(raw: string, loneComma: LoneComma = 'auto'): number | null {
    let text = raw.replace(/\s/g, '');
    const commas = text.split(',').length - 1;
    if (commas === 1 && !text.includes('.')) {
        text = loneComma === 'auto' && GROUPED_BY_COMMA.test(text) ? text.replace(',', '') : text.replace(',', '.');
    } else if (commas > 0) {
        // Both marks, or several commas: only a properly grouped number is
        // readable. A guess at "1,2,3" could be wrong by orders of magnitude.
        if (GROUPED_BY_COMMA.test(text)) text = text.replace(/,/g, '');
        else if (GROUPED_BY_DOT.test(text)) text = text.replace(/\./g, '').replace(',', '.');
        else return null;
    }
    if (text === '' || text === '-' || text === '.' || text === '-.') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
}

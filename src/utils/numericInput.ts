/** The range a number field accepts. A typed value outside it is replaced by the nearer end. */
export interface NumericLimits {
    min: number;
    max: number;
}

/** A typed value ran past one end of the range; `used` is the value taken in its place. */
export interface LimitHit {
    bound: 'min' | 'max';
    used: number;
}

export interface NumericReading {
    /** The number to use, or null while the text is empty or not yet a number ("-", "1e"). */
    value: number | null;
    /** Set when `value` is a limit standing in for what was typed. */
    hit: LimitHit | null;
}

/**
 * What the text in a number field means.
 *
 * Empty and half-typed text reads as "nothing yet", never as 0: writing 0 back
 * to a field the visitor has just cleared turns a retyped "-30" into "030", a
 * rise where a fall is meant.
 */
export function readNumericText(text: string, limits: NumericLimits): NumericReading {
    const trimmed = text.trim();
    if (trimmed === '') return { value: null, hit: null };
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { value: null, hit: null };
    if (n > limits.max) return { value: limits.max, hit: { bound: 'max', used: limits.max } };
    if (n < limits.min) return { value: limits.min, hit: { bound: 'min', used: limits.min } };
    return { value: n, hit: null };
}

/** What to do with text found in a number field that the page's code did not put there. */
export type TypedBeforeLoad =
    /** Take it over as if it had just been typed. `value` is null while it is not yet a number. */
    | { kind: 'adopt'; text: string; value: number | null; hit: LimitHit | null }
    /** Put the field's own number back, as leaving the field would have. */
    | { kind: 'restore' }
    | null;

/**
 * Reads a number field as the visitor left it before the page's code loaded.
 *
 * The server's HTML is a working form seconds before its code arrives on a slow
 * connection. What is typed into it then stays in the field but is reported to
 * nobody. Unread, the result under the form is for the number the page started
 * with, and the next update writes that number back over the typed one.
 *
 * `fieldText` is what the field holds, `renderedText` what the page put there,
 * and `focused` whether the cursor is still in it. Nothing was typed when the
 * two match. Text that is not a number yet is kept while the visitor is still
 * in the field and dropped once they have left it, which is what a blur does.
 */
export function readTypedBeforeLoad(
    fieldText: string,
    renderedText: string,
    focused: boolean,
    limits: NumericLimits,
): TypedBeforeLoad {
    if (fieldText === renderedText) return null;
    const reading = readNumericText(fieldText, limits);
    if (reading.value === null && !focused) return { kind: 'restore' };
    return { kind: 'adopt', text: fieldText, value: reading.value, hit: reading.hit };
}

/**
 * One sentence saying which limit a field ran into, for the hint under the
 * field and for the screen-reader status. `label` names the field, because the
 * status is read out with no field next to it.
 */
export const limitMessage = (
    label: string,
    hit: LimitHit,
    format: (n: number) => string = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 8 }),
): string =>
    hit.bound === 'max'
        ? `${label} is capped at ${format(hit.used)}.`
        : `${label} cannot go below ${format(hit.used)}.`;

/**
 * A return as every result on the home page prints it: "+93.6%", "-63.5%",
 * "+15,061%". One decimal below 100 and none from there up, where it stops
 * mattering; thousands grouped. The sign follows the printed figure, so a
 * return that rounds to zero has none: "-0.0%" is not a loss.
 */
export const signedPercent = (value: number): string => {
    const abs = Math.abs(value);
    const digits = abs >= 100 ? 0 : 1;
    const text = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    if (Number(text.replace(/,/g, '')) === 0) return `${text}%`;
    return `${value < 0 ? '-' : '+'}${text}%`;
};

/** Round to 2 significant figures, so a converted price reads as a round number (89,238 becomes 89,000). */
export const roundTo2Sig = (n: number): number => {
    if (!Number.isFinite(n) || n <= 0) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / mag) * mag;
};

/** A display currency as a price field sees it: its code, and how many of its units one US dollar is. */
export interface DisplayRate {
    code: string;
    rate: number;
}

/**
 * What a price held in the display currency becomes when that currency, or
 * only its rate, changes.
 *
 * `presetsUsd` are the dollar prices the field puts there by itself (its
 * default and its quick-pick buttons), each shown as roundTo2Sig(usd * rate).
 *
 *  - A value that is one of those presets stays that preset: it is worked out
 *    again from the dollar figure at the new rate. Converting the rounded
 *    number instead can land one step away from where the button now is, and
 *    the button that was pressed stops being pressed.
 *  - Any other value is the visitor's own number. A change of currency
 *    converts it, so the scenario stays the same price. A change of rate under
 *    the same currency leaves it exactly as typed: the rate is corrected when
 *    live rates arrive after dated ones, and rewriting a typed field then
 *    would change the scenario behind the visitor's back.
 */
export function carryPriceAcrossRate(
    value: number,
    prev: DisplayRate,
    next: DisplayRate,
    presetsUsd: readonly number[] = [],
): number {
    if (!(prev.rate > 0) || !(next.rate > 0)) return value;
    if (prev.code === next.code && prev.rate === next.rate) return value;
    const presetUsd = presetsUsd.find((usd) => roundTo2Sig(usd * prev.rate) === value);
    if (presetUsd !== undefined) return roundTo2Sig(presetUsd * next.rate);
    if (prev.code === next.code) return value;
    return roundTo2Sig((value / prev.rate) * next.rate);
}

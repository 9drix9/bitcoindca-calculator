/**
 * A result as the text of a post: the whole note, for Nostr and the clipboard,
 * and the same note cut to what X will take.
 *
 * Imports nothing, so the client component that builds the posts
 * (components/ShareMyStack) can use it without pulling in the server's share
 * pipeline.
 */

export interface PostParts {
    /** The figures: "Bitcoin DCA from Jan 2021 to Oct 2026: $13,050 invested, now worth $25,083 (+92.2%). 0.303 BTC stacked." */
    summary: string;
    /** What shaped them besides amount, schedule and dates, the most consequential first. */
    assumptions: readonly string[];
    /** A closing sentence the post can do without, or null. */
    extra: string | null;
}

/**
 * Room for the text of a post on X that carries a link: 280, less 23 for the
 * link (X counts every URL as 23, whatever its length) and 1 for the space it
 * puts before it.
 */
export const X_POST_TEXT_MAX = 280 - 23 - 1;

/**
 * Code points X counts as one character. Everything else counts as two, the
 * euro sign included. From config/v3.json in github.com/twitter/twitter-text
 * (the counter X publishes), read on 2026-10-12.
 */
const X_SINGLE_WEIGHT_RANGES: readonly (readonly [start: number, end: number])[] = [
    [0, 4351],
    [8192, 8205],
    [8208, 8223],
    [8242, 8247],
];

/** The length of `text` as X counts it against the 280. */
export function xWeightedLength(text: string): number {
    let length = 0;
    for (const char of text.normalize('NFC')) {
        const code = char.codePointAt(0) ?? 0;
        length += X_SINGLE_WEIGHT_RANGES.some(([start, end]) => code >= start && code <= end) ? 1 : 2;
    }
    return length;
}

/** The summary with the first `kept` of its assumptions, saying so when some are left out. */
function withAssumptions(summary: string, assumptions: readonly string[], kept: number): string {
    if (assumptions.length === 0) return summary;
    if (kept === 0) return `${summary} Assumptions are in the link.`;
    const list = assumptions.slice(0, kept).join('; ');
    return kept < assumptions.length ? `${summary} Assumes: ${list}; more in the link.` : `${summary} Assumes: ${list}.`;
}

/** The whole note, nothing left out. */
export function fullPostText({ summary, assumptions, extra }: PostParts): string {
    const note = withAssumptions(summary, assumptions, assumptions.length);
    return extra ? `${note} ${extra}` : note;
}

/**
 * The note cut to fit one post on X together with its link. A standard account
 * cannot send a post that is over the limit, so a text that is too long leaves
 * the sharer to trim it by hand, and what they cut is anyone's guess.
 *
 * The closing sentence goes first, then assumptions from the end of the list.
 * A post that drops any says there are more: the figures mean something else
 * without them, and the link opens the plan with every setting in it.
 */
export function xPostText({ summary, assumptions, extra }: PostParts): string {
    const fits = (text: string): boolean => xWeightedLength(text) <= X_POST_TEXT_MAX;
    const whole = fullPostText({ summary, assumptions, extra });
    if (fits(whole)) return whole;
    for (let kept = assumptions.length; kept >= 0; kept--) {
        const note = withAssumptions(summary, assumptions, kept);
        if (fits(note)) return note;
    }
    return summary;
}

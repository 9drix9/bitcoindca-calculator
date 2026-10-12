import { describe, expect, it } from 'vitest';
import { X_POST_TEXT_MAX, fullPostText, xPostText, xWeightedLength, type PostParts } from './postText';

/**
 * The prefilled post. X will not send one that is over its limit, so the text
 * handed to it has to fit beside the link whatever the plan carries; the note
 * for Nostr and the clipboard has no limit and leaves nothing out.
 */

const RANKING = 'Average cost beats 61% of all possible start dates for this schedule.';

/** A euro plan with every option on: the post that used to open over the limit. */
const HEAVY: PostParts = {
    summary: 'Bitcoin DCA from Jan 2021 to Oct 2026: €52,355 invested, now worth €105,922 (+102.3%). 1.4229 BTC stacked.',
    assumptions: [
        'includes 0.5 BTC held at the start',
        'every buy at the EUR rate of 2026-10-09',
        'amount rises 10%/yr',
        '0.5% + €2.99 fee per buy',
        'plan runs to Dec 2030',
        '302 of 302 buy prices are estimates',
    ],
    extra: null,
};

const PLAIN: PostParts = {
    summary: 'Bitcoin DCA from Oct 2021 to Oct 2026: $13,050 invested, now worth $25,083 (+92.2%). 0.30303866 BTC stacked.',
    assumptions: ['0.5% fee'],
    extra: RANKING,
};

describe('xWeightedLength', () => {
    it('counts the way X does: two for a euro sign, one for the other currency symbols', () => {
        expect(xWeightedLength('$13,050 invested')).toBe(16);
        expect(xWeightedLength('€')).toBe(2);
        expect(xWeightedLength('£¥$')).toBe(3);
        expect(xWeightedLength('€52,355 → €105,922')).toBe(18 + 3);
        // A composed and a decomposed "é" are one character either way.
        expect(xWeightedLength('é')).toBe(xWeightedLength('é'));
    });

    it('leaves room for the link and the space before it', () => {
        expect(X_POST_TEXT_MAX + 1 + 23).toBe(280);
    });
});

describe('fullPostText', () => {
    it('leaves nothing out, however long', () => {
        const note = fullPostText({ ...HEAVY, extra: RANKING });
        expect(note.startsWith(HEAVY.summary)).toBe(true);
        for (const clause of HEAVY.assumptions) expect(note).toContain(clause);
        expect(note.endsWith(`302 of 302 buy prices are estimates. ${RANKING}`)).toBe(true);
    });

    it('is the summary alone when nothing else shaped the number', () => {
        expect(fullPostText({ summary: 'Bitcoin DCA.', assumptions: [], extra: null })).toBe('Bitcoin DCA.');
    });
});

describe('xPostText', () => {
    it('is the whole note when it fits', () => {
        expect(xPostText(PLAIN)).toBe(fullPostText(PLAIN));
        expect(xPostText(PLAIN)).toBe(`${PLAIN.summary} Assumes: 0.5% fee. ${RANKING}`);
    });

    it('fits a plan with every option on, and says that assumptions were left out', () => {
        // The whole note is over the limit, as X counts it.
        expect(xWeightedLength(fullPostText(HEAVY))).toBeGreaterThan(X_POST_TEXT_MAX);

        const post = xPostText(HEAVY);
        expect(xWeightedLength(post)).toBeLessThanOrEqual(X_POST_TEXT_MAX);
        expect(post.startsWith(`${HEAVY.summary} Assumes: includes 0.5 BTC held at the start; every buy at the EUR rate of 2026-10-09`)).toBe(true);
        expect(post.endsWith('; more in the link.')).toBe(true);
        // Dropped from the end of the list, never from the middle.
        const kept = HEAVY.assumptions.filter((clause) => post.includes(clause));
        expect(kept).toEqual(HEAVY.assumptions.slice(0, kept.length));
        expect(kept.length).toBeLessThan(HEAVY.assumptions.length);
    });

    it('drops the ranking before any assumption', () => {
        const parts: PostParts = { ...HEAVY, assumptions: HEAVY.assumptions.slice(0, 3), extra: RANKING };
        expect(xWeightedLength(fullPostText(parts))).toBeGreaterThan(X_POST_TEXT_MAX);
        expect(xPostText(parts)).toBe(fullPostText({ ...parts, extra: null }));
    });

    it('points at the link when not even one assumption fits', () => {
        const summary = `${'Bitcoin DCA from Aug 2010 to Oct 2026: '}${'9'.repeat(170)} invested.`;
        const post = xPostText({ summary, assumptions: ['every buy priced at an assumed $1/BTC (hypothetical)'], extra: null });
        expect(post).toBe(`${summary} Assumptions are in the link.`);
        expect(xWeightedLength(post)).toBeLessThanOrEqual(X_POST_TEXT_MAX);
    });

    it('never grows past the limit for any number of assumptions', () => {
        for (let n = 0; n <= HEAVY.assumptions.length; n++) {
            for (const extra of [null, RANKING]) {
                const post = xPostText({ ...HEAVY, assumptions: HEAVY.assumptions.slice(0, n), extra });
                expect(xWeightedLength(post)).toBeLessThanOrEqual(X_POST_TEXT_MAX);
            }
        }
    });
});

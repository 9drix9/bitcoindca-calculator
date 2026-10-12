import { describe, expect, it } from 'vitest';
import { stripQueryAndHash } from '@/components/LazyAnalytics';

// /privacy tells visitors that "everything after a ? or a # is removed" from
// the page address before Vercel Web Analytics or Speed Insights sends a
// report. These cases are that sentence. If one has to change (to keep a
// campaign tag, say), the paragraph on /privacy has to change with it.
const PAGE = 'https://btcdollarcostaverage.com';
const sent = (address: string): string | undefined => stripQueryAndHash({ type: 'pageview' as const, url: address })?.url;

describe('stripQueryAndHash', () => {
    it('removes calculator settings from a page view', () => {
        const event = {
            type: 'pageview' as const,
            url: `${PAGE}/?amount=777&frequency=weekly&startDate=2021-01-04&startingBtc=1.5&startingCost=30000`,
        };
        expect(stripQueryAndHash(event)).toEqual({ type: 'pageview', url: `${PAGE}/` });
    });

    it('keeps the path and removes the hash', () => {
        expect(sent(`${PAGE}/dca/50-per-week-since-2020?x=1#year-by-year`)).toBe(`${PAGE}/dca/50-per-week-since-2020`);
    });

    it('keeps no parameter at all, campaign tags included', () => {
        expect(sent(`${PAGE}/mining?utm_source=newsletter&ref=hn&utm_campaign=oct`)).toBe(`${PAGE}/mining`);
        expect(sent(`${PAGE}/?gclid=abc123&amount=777`)).toBe(`${PAGE}/`);
    });

    it('passes a Speed Insights report through with only its address changed', () => {
        const event = { type: 'vital' as const, url: `${PAGE}/share?amount=50&frequency=weekly#card`, route: '/share' };
        expect(stripQueryAndHash(event)).toEqual({ type: 'vital', url: `${PAGE}/share`, route: '/share' });
    });

    it('leaves a clean address as it was and does not modify the event it was given', () => {
        const event = { type: 'pageview' as const, url: `${PAGE}/about?a=1` };
        expect(sent(`${PAGE}/about`)).toBe(`${PAGE}/about`);
        stripQueryAndHash(event);
        expect(event.url).toBe(`${PAGE}/about?a=1`);
    });

    it('sends nothing when the address cannot be parsed', () => {
        expect(stripQueryAndHash({ type: 'pageview' as const, url: '/?amount=777' })).toBeNull();
        expect(stripQueryAndHash({ type: 'pageview' as const, url: '' })).toBeNull();
    });
});

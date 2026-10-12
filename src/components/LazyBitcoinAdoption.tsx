'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';

// Close to the card's real height (about 840px on a phone, 750px from sm up),
// so the page below it stays put when the card replaces this.
const PLACEHOLDER_CLASS = 'h-[840px] sm:h-[750px] bg-slate-100 dark:bg-slate-800/50 rounded-xl animate-pulse';

/**
 * Client-side boundary for the Recharts-backed adoption chart.
 *
 * `ssr: false` is rejected by next/dynamic inside a Server Component, and
 * src/app/page.tsx is one — so the opt-out has to happen behind a 'use client'
 * module. Without it, importing this chart from the homepage drags Recharts
 * (~370 KB) into the server render and the initial script set.
 */
const BitcoinAdoption = dynamic(
    () => import('@/components/BitcoinAdoption').then((m) => m.BitcoinAdoption),
    {
        ssr: false,
        loading: () => <div className={PLACEHOLDER_CLASS} />,
    },
);

// The card sits several screens down the home page. With `ssr: false` its
// chunk is only requested once the component renders, so holding the render
// until the card is this close keeps the download and the chart's first paint
// off the page load of everyone who never scrolls that far.
const NEAR_VIEWPORT = '800px 0px';

const subscribeNever = () => () => {};
const observerMissing = () => typeof IntersectionObserver === 'undefined';
const observerAssumed = () => false;

export function LazyBitcoinAdoption() {
    const holder = useRef<HTMLDivElement>(null);
    const [near, setNear] = useState(false);
    // No IntersectionObserver means no way to tell: load straight away.
    const cannotObserve = useSyncExternalStore(subscribeNever, observerMissing, observerAssumed);

    useEffect(() => {
        const element = holder.current;
        if (!element || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                observer.disconnect();
                setNear(true);
            },
            { rootMargin: NEAR_VIEWPORT },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return (
        <section className="space-y-6">
            {/* Outside the deferred part, so the heading is in the page (and in a
                screen reader's list of headings) before the card has loaded. */}
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Bitcoin Adoption
            </h2>
            {near || cannotObserve ? <BitcoinAdoption /> : <div ref={holder} className={PLACEHOLDER_CLASS} />}
        </section>
    );
}

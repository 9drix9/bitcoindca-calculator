'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { Frequency } from '@/types';
import { PLAN_LINK_ATTR } from '@/hooks/planLinkBootstrap';
import { signedPercent } from '@/utils/numericInput';

/**
 * The home page's headline sentence: what the default plan is worth today.
 *
 * It states the plan the calculator below it opens on, so the two must show
 * the same figures. On the server they do: both are computed from one price
 * series, one spot quote and the defaults in data/planDefaults. In the browser
 * the calculator can then move on without the sentence: the page is a cached
 * prerender, so the calculator re-quotes the price when the copy it was handed
 * is old, and rolls its window forward when the copy is from an earlier UTC
 * day. A sentence frozen in the HTML would go on quoting the old figure one
 * screen above the new one.
 *
 * So the calculator publishes its result here whenever it is showing exactly
 * the default plan, and the sentence follows it. With nothing published the
 * server's figures stand.
 *
 * The calculator also says when its form holds some other plan: a shared link,
 * another currency, anything the visitor changed. The sentence would then be
 * the only result on the first screen, in bold, for a plan that is not the one
 * below it, so it gives way to a line that states no figures.
 */
export interface DefaultPlanFigures {
    invested: number;
    value: number;
    roi: number;
}

interface HeroState {
    figures: DefaultPlanFigures | null;
    /** What the calculator's form holds; null until it has read the address, and when there is no calculator. */
    plan: 'default' | 'other' | null;
}

const NOTHING_PUBLISHED: HeroState = { figures: null, plan: null };
let latest = NOTHING_PUBLISHED;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
const getSnapshot = () => latest;
// Nothing published on the server and while hydrating, so the markup matches the HTML.
const getServerSnapshot = () => NOTHING_PUBLISHED;

const publish = (next: HeroState) => {
    latest = next;
    listeners.forEach((listener) => listener());
};

/** Called by the calculator with its own result for the default plan. */
export function publishDefaultPlanFigures(next: DefaultPlanFigures): void {
    if (![next.invested, next.value, next.roi].every(Number.isFinite)) return;
    const held = latest.figures;
    if (held && held.invested === next.invested && held.value === next.value && held.roi === next.roi) return;
    publish({ ...latest, figures: next });
}

/**
 * Called by the calculator once its form holds the plan the visit asked for,
 * and on every change after that: whether that plan is the default one. Null
 * when the calculator leaves the page.
 */
export function publishShownPlan(plan: HeroState['plan']): void {
    if (latest.plan === plan) return;
    publish({ ...latest, plan });
}

/** True while the document carries the mark of a visit that opened on a link (hooks/planLinkBootstrap). */
export const planLinkMarked = (): boolean => document.documentElement.hasAttribute(PLAN_LINK_ATTR);

/**
 * Takes the link mark off the document (hooks/planLinkBootstrap) once nothing
 * on the page still states the default plan's figures as if they answered the
 * link. Each part that does carries `data-plan-figure` until it has caught up
 * and calls this after dropping it, so the mark outlasts the slowest of them:
 * the calculator can hydrate before this sentence does.
 *
 * Server markup that React has not put on the page yet does not count. It
 * waits in a `hidden` block at the end of the document, and when React has
 * rendered that part itself in the meantime the block is thrown away unseen.
 */
export function releasePlanLinkMark(): void {
    if (!planLinkMarked()) return;
    for (const marked of document.querySelectorAll('[data-plan-figure]')) {
        if (marked.closest('[hidden]') === null) return;
    }
    document.documentElement.removeAttribute(PLAN_LINK_ATTR);
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/** A frequency as the words after "every". Shared with the calculator, so both name a schedule alike. */
export const EVERY: Record<Frequency, string> = {
    daily: 'day',
    weekly: 'week',
    biweekly: 'two weeks',
    monthly: 'month',
};

const TEXT_CLASS = 'text-base sm:text-lg text-slate-600 dark:text-slate-300 text-balance';
const WIDTH_CLASS = 'max-w-2xl mx-auto';

export interface HeroProofLineProps {
    /** The default plan as the server computed it (getHeroStat in app/actions). */
    stat: DefaultPlanFigures & {
        amount: number;
        frequency: Frequency;
        yearsBack: number;
        feePercentage: number;
    };
    /** The line shown in the sentence's place while the calculator holds any other plan. It states no figures. */
    otherPlanLine: string;
}

export function HeroProofLine({ stat, otherPlanLine }: HeroProofLineProps) {
    const { figures, plan } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const { invested, value, roi } = figures ?? stat;

    useLayoutEffect(() => {
        if (plan !== null) releasePlanLinkMark();
    }, [plan]);

    const sentence = (
        <>
            {usd(stat.amount)} of Bitcoin every {EVERY[stat.frequency]} for the last {stat.yearsBack}{' '}
            {stat.yearsBack === 1 ? 'year' : 'years'} comes to {usd(invested)} invested, worth{' '}
            <strong className="font-bold text-slate-900 dark:text-white">{usd(value)}</strong> today
            {Number.isFinite(roi) && (
                // Printed by the same rule as the result card below: "+95%"
                // beside "+94.9%" reads as two different answers.
                <span className={roi >= 0 ? 'text-gain' : 'text-loss'}>
                    {' '}({signedPercent(roi)})
                </span>
            )}
            {/* The fee is part of the plan, so it is part of the sentence. */}
            {stat.feePercentage > 0
                ? <>, after a {stat.feePercentage}% fee on each buy.</>
                : <>, before fees.</>}
        </>
    );

    if (plan === 'other') {
        return (
            // The sentence stays in the same cell, unseen, to hold its height:
            // it is a line longer than its stand-in on a narrow phone, and the
            // form under it would jump as the visitor typed their first digit.
            <div className={`grid ${WIDTH_CLASS}`}>
                <p className={`${TEXT_CLASS} col-start-1 row-start-1`}>{otherPlanLine}</p>
                <p className={`${TEXT_CLASS} col-start-1 row-start-1 invisible`} aria-hidden="true">{sentence}</p>
            </div>
        );
    }

    return (
        // Marked until the calculator has said which plan it holds: on a visit
        // that opened on a link, globals.css hides it for that long.
        <p className={`${TEXT_CLASS} ${WIDTH_CLASS}`} data-plan-figure={plan === null ? '' : undefined}>
            {sentence}
        </p>
    );
}

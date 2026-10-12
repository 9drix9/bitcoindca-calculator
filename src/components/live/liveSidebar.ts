'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
    LIVE_LIFETIME_SECONDS,
    LIVE_SIDEBAR_URL,
    liveFigureMaxAgeMs,
    type LiveFigure,
    type LiveSidebar,
} from '@/app/api/live/contract';
import type { SpotQuote } from '@/utils/priceSeries';
import { createPoller, type Accepted, type PollState } from './livePoller';

// The sidebar cards' figures. Every card on the page reads them from the one
// request /api/live/sidebar answers, so ten cards cost one request a tick and
// a card the phone layout brings back shows what the others kept current.

export type FigureName = keyof LiveSidebar;

/** What each card is handed. The spot quote is dated by its own `asOf`. */
export type FigureData = {
    [K in FigureName]: K extends 'spot' ? SpotQuote : NonNullable<LiveSidebar[K]> extends LiveFigure<infer T> ? T : never;
};

type Figures = { [K in FigureName]?: LiveFigure<FigureData[K]> };

export interface SidebarFigures {
    /** The newest figure seen under each name. One a later answer lacked stays. */
    figures: Figures;
    /** The names the last answer held. */
    brought: ReadonlySet<FigureName>;
}

const FIGURE_NAMES = Object.keys(LIVE_LIFETIME_SECONDS).filter(
    (name): name is FigureName => name !== 'ticker',
);

const NOTHING: SidebarFigures = { figures: {}, brought: new Set() };

/** A time a Date can hold. The cards print these, and formatting one it cannot hold throws. */
const isTime = (value: unknown): value is number => typeof value === 'number' && Math.abs(value) <= 8.64e15;

const isFigure = (value: unknown): value is LiveFigure<unknown> =>
    typeof value === 'object' && value !== null
    && isTime((value as LiveFigure<unknown>).fetchedAt)
    && (value as LiveFigure<unknown>).data != null;

const isSpot = (value: unknown): value is SpotQuote =>
    typeof value === 'object' && value !== null
    && isTime((value as SpotQuote).asOf)
    && Number.isFinite((value as SpotQuote).price) && (value as SpotQuote).price > 0;

/**
 * The figures after one answer. Null when it held none.
 *
 * A figure never goes backwards: the CDN can answer with a copy made before
 * the one already on screen. `wanted` is the names with a card on the page;
 * the answer is complete when it held all of those.
 */
export function acceptSidebar(
    previous: SidebarFigures,
    body: Record<string, unknown>,
    wanted: Iterable<FigureName>,
): Accepted<SidebarFigures> | null {
    const figures: Record<string, LiveFigure<unknown>> = { ...previous.figures };
    const brought = new Set<FigureName>();
    for (const name of FIGURE_NAMES) {
        const raw = body[name];
        const next = name === 'spot'
            ? (isSpot(raw) ? { data: raw, fetchedAt: raw.asOf } : null)
            : (isFigure(raw) ? raw : null);
        if (!next) continue;
        brought.add(name);
        const held = figures[name];
        if (held && next.fetchedAt <= held.fetchedAt) continue;
        figures[name] = next;
    }
    if (brought.size === 0) return null;

    // mempool.space's servers do not all hold the same newest Lightning row,
    // so a later answer can carry an earlier day. The newer day stays, dated
    // by the fetch that confirmed the provider was there.
    const lightning = (figures as Figures).lightning;
    const lightningBefore = previous.figures.lightning;
    if (lightning && lightningBefore && lightning.data.asOf < lightningBefore.data.asOf) {
        figures.lightning = { data: lightningBefore.data, fetchedAt: lightning.fetchedAt };
    }

    let complete = true;
    for (const name of wanted) {
        if (!brought.has(name)) complete = false;
    }
    return { value: { figures: figures as Figures, brought }, complete };
}

export interface FigureView<T> {
    data: T | null;
    /** Server-clock ms epoch the figure was fetched from its provider; null when the page did not say. */
    fetchedAt: number | null;
    /**
     * Too old to pass as current: older than liveFigureMaxAgeMs allows, or of
     * unknown age and not refreshed. Judged each time a refresh finishes, so
     * never true in the server's HTML or the render that hydrates it.
     */
    old: boolean;
    /** The last refresh did not bring this figure. */
    failed: boolean;
    /** Server clock (ms epoch) when the last refresh finished; null until one has. */
    checkedAt: number | null;
}

/**
 * What a card shows: the newer of the figure the page came with (`seedData`,
 * fetched at `seedFetchedAt`) and the one the poll has brought since.
 */
export function figureView<K extends FigureName>(
    name: K,
    state: PollState<SidebarFigures>,
    seedData: FigureData[K] | null,
    seedFetchedAt: number | null,
): FigureView<FigureData[K]> {
    const polled = state.value.figures[name] as LiveFigure<FigureData[K]> | undefined;
    const fromSeed = seedData !== null && (!polled || (seedFetchedAt !== null && seedFetchedAt > polled.fetchedAt));
    const data = fromSeed ? seedData : polled?.data ?? null;
    const fetchedAt = fromSeed ? seedFetchedAt : polled?.fetchedAt ?? null;
    const checkedAt = state.settledAt;
    const failed = checkedAt !== null && (state.failures > 0 || !state.value.brought.has(name));
    const old = data !== null && checkedAt !== null && (
        fetchedAt === null
            ? failed
            : checkedAt - fetchedAt > liveFigureMaxAgeMs(LIVE_LIFETIME_SECONDS[name])
    );
    return { data, fetchedAt, old, failed, checkedAt };
}

/** How many cards on the page show each figure. */
const wanted = new Map<FigureName, number>();

const sidebar = createPoller<SidebarFigures>({
    url: LIVE_SIDEBAR_URL,
    initial: NOTHING,
    accept: (previous, body) => acceptSidebar(previous, body, wanted.keys()),
});

const serverState = () => sidebar.initialState;

/**
 * One sidebar figure, kept current while the card is on the page.
 *
 * `seedData` is the figure the server rendered and `seedFetchedAt` the time
 * the server fetched it (ms epoch). The first refresh is due one lifetime
 * after that, or at once when the time is not known or there is no figure.
 */
export function useLiveFigure<K extends FigureName>(
    name: K,
    seedData: FigureData[K] | null,
    seedFetchedAt?: number | null,
): FigureView<FigureData[K]> {
    const seededAt = seedData !== null && isTime(seedFetchedAt) ? seedFetchedAt : null;

    const subscribe = useCallback((listener: () => void) => {
        const pollMs = LIVE_LIFETIME_SECONDS[name] * 1000;
        const knownAt = Math.max(sidebar.getState().value.figures[name]?.fetchedAt ?? -Infinity, seededAt ?? -Infinity);
        const dueIn = Number.isFinite(knownAt) ? knownAt + pollMs - sidebar.serverNow() : 0;
        wanted.set(name, (wanted.get(name) ?? 0) + 1);
        const unsubscribe = sidebar.subscribe({ pollMs, dueIn }, listener);
        return () => {
            unsubscribe();
            const cards = (wanted.get(name) ?? 1) - 1;
            if (cards > 0) wanted.set(name, cards);
            else wanted.delete(name);
        };
    }, [name, seededAt]);

    const state = useSyncExternalStore(subscribe, sidebar.getState, serverState);
    return figureView(name, state, seedData, seededAt);
}

import { LIVE_CDN_SECONDS } from '@/app/api/live/contract';

/**
 * A GET to one fixed address, repeated for as long as something on the page
 * shows its answer. The hero ticker has one and the sidebar cards share one.
 *
 * A plain fetch, not a Server Action: a browser sends a page's Server Actions
 * one at a time and React holds back hydration while one is pending, so a poll
 * in that queue delays the calculator. A GET is also an answer the CDN can
 * give to every visitor at once.
 *
 * The request says nothing about the visitor: no referrer (the page address
 * can hold a plan), no cookies, no query.
 *
 * Nothing is asked for until the page has been idle once. On a phone the
 * collapsed sidebar cards mount for the hydration render and are removed in
 * the same task, so by then they have unsubscribed and cost no request.
 */

/** Longest wait for an idle moment before asking anyway. */
const IDLE_TIMEOUT_MS = 2_000;
/** The wait where the browser has no idle callback to offer. */
const IDLE_FALLBACK_MS = 200;
/** Longer than the ten seconds the server gives one of its providers, so a slow figure does not cost the rest. */
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * How soon to ask again after the first answer that fell short. After a quiet
 * spell the server's first answer is missing whatever its cache held too long,
 * and it has the figure again seconds later. A little longer than the CDN may
 * hold an answer with a figure missing, so the second try is not that copy.
 */
const FOLLOW_UP_MS = (LIVE_CDN_SECONDS.sidebarDegraded + 2) * 1000;
/** Never ask more often than this, whatever asks. */
const MIN_GAP_MS = 5_000;

export interface PollInterest {
    /** How often this subscriber wants a new answer. */
    pollMs: number;
    /** Milliseconds until it wants its first one; 0 or less means as soon as the page is idle. */
    dueIn: number;
}

export interface PollState<S> {
    /** What the answers so far add up to. */
    value: S;
    /** Server clock (ms epoch) when the last attempt finished; null until one has. */
    settledAt: number | null;
    /** Attempts in a row that brought nothing usable. */
    failures: number;
    /** The browser reported losing its connection, and no attempt has succeeded since. */
    offline: boolean;
}

/** The value after an answer, and whether the answer held everything that was wanted. */
export interface Accepted<S> {
    value: S;
    complete: boolean;
}

interface PollResponse {
    ok: boolean;
    headers: { get(name: string): string | null };
    json(): Promise<unknown>;
}

/** What the poller needs from the browser, so a test can stand in for it. */
export interface PollerEnv {
    now(): number;
    fetch(url: string, init: RequestInit): Promise<PollResponse>;
    setTimer(run: () => void, ms: number): unknown;
    clearTimer(timer: unknown): void;
    /** Calls `run` once the page is idle. Returns a cancel. */
    whenIdle(run: () => void): () => void;
    isHidden(): boolean;
    /** Reports the tab being shown again and the connection returning or dropping. Returns a cancel. */
    listen(on: (event: 'visible' | 'online' | 'offline') => void): () => void;
}

export interface Poller<S> {
    /** Polls while anything is subscribed. `listener` runs whenever the state changes. */
    subscribe(interest: PollInterest, listener: () => void): () => void;
    getState(): PollState<S>;
    /** The state before anything has been asked for: what the server renders with. */
    readonly initialState: PollState<S>;
    /** The server's clock now: the visitor's, corrected by the last answer. */
    serverNow(): number;
}

const browserEnv = (): PollerEnv => ({
    now: () => Date.now(),
    fetch: (url, init) => fetch(url, init),
    setTimer: (run, ms) => window.setTimeout(run, ms),
    clearTimer: (timer) => window.clearTimeout(timer as number),
    whenIdle: (run) => {
        if (typeof window.requestIdleCallback === 'function') {
            const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
            return () => window.cancelIdleCallback(id);
        }
        const id = window.setTimeout(run, IDLE_FALLBACK_MS);
        return () => window.clearTimeout(id);
    },
    isHidden: () => document.hidden,
    listen: (on) => {
        const onVisibility = () => { if (!document.hidden) on('visible'); };
        const onOnline = () => on('online');
        const onOffline = () => on('offline');
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    },
});

/**
 * `accept` turns a 200's body into the next value, or returns null for a body
 * it cannot use. `serverNow` is the server's clock as the answer arrived: the
 * time it was put together plus the time a CDN then held it.
 */
export function createPoller<S>(options: {
    url: string;
    initial: S;
    accept: (value: S, body: Record<string, unknown>, serverNow: number) => Accepted<S> | null;
    /** Tests only. The browser is used when this is left out. */
    env?: PollerEnv;
}): Poller<S> {
    const { url, accept } = options;
    const initialState: PollState<S> = { value: options.initial, settledAt: null, failures: 0, offline: false };

    interface Subscriber extends PollInterest {
        listener: () => void;
        /** Visitor-clock ms epoch from which this subscriber wants an answer. */
        dueAt: number;
    }
    const subscribers = new Set<Subscriber>();

    let env = options.env;
    let state = initialState;
    /** Server clock minus the visitor's, as of the last answer. */
    let clockOffset = 0;
    let stop: (() => void) | null = null;
    let idle = false;
    let timer: unknown = null;
    let inFlight: AbortController | null = null;
    let lastAttemptAt = 0;
    let fellShort = false;
    let followUpAt = 0;
    let askNow = false;

    const serverNow = () => (env ? env.now() : Date.now()) + clockOffset;

    const setState = (next: PollState<S>) => {
        state = next;
        for (const subscriber of [...subscribers]) subscriber.listener();
    };

    /** Milliseconds until the next request is due; null when none should be made. */
    const nextDelay = (): number | null => {
        // A hidden tab asks for nothing; being shown again comes back through schedule().
        if (!env || !idle || inFlight || subscribers.size === 0 || env.isHidden()) return null;
        if (askNow) return 0;
        let dueAt = followUpAt > 0 ? followUpAt : Infinity;
        for (const subscriber of subscribers) dueAt = Math.min(dueAt, subscriber.dueAt);
        if (lastAttemptAt > 0) dueAt = Math.max(dueAt, lastAttemptAt + MIN_GAP_MS);
        return Math.max(0, dueAt - env.now());
    };

    const schedule = () => {
        if (!env) return;
        env.clearTimer(timer);
        timer = null;
        const delay = nextDelay();
        if (delay !== null) timer = env.setTimer(tick, delay);
    };

    const tick = () => {
        timer = null;
        // The tab may have been hidden, or a subscriber gone, while the timer ran.
        if (nextDelay() === 0) void attempt();
        else schedule();
    };

    const attempt = async () => {
        if (!env) return;
        const controller = new AbortController();
        const startedAt = env.now();
        askNow = false;
        inFlight = controller;
        lastAttemptAt = startedAt;
        const giveUp = env.setTimer(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let accepted: Accepted<S> | null = null;
        try {
            const response = await env.fetch(url, {
                referrerPolicy: 'no-referrer',
                credentials: 'omit',
                cache: 'no-store',
                signal: controller.signal,
            });
            const body: unknown = response.ok ? await response.json() : null;
            const generatedAt = body && typeof body === 'object' ? (body as Record<string, unknown>).generatedAt : null;
            if (typeof generatedAt === 'number' && Number.isFinite(generatedAt)) {
                const held = Number(response.headers.get('age'));
                const answeredAt = generatedAt + (Number.isFinite(held) && held > 0 ? held * 1000 : 0);
                accepted = accept(state.value, body as Record<string, unknown>, answeredAt);
                if (accepted) clockOffset = answeredAt - env.now();
            }
        } catch {
            // No connection, a timeout, or a body that is not JSON: counted as a failure below.
        }
        env.clearTimer(giveUp);
        // Everything unsubscribed while this was out, and the poller was reset.
        if (inFlight !== controller) return;
        inFlight = null;

        const short = !accepted || !accepted.complete;
        followUpAt = short && !fellShort ? env.now() + FOLLOW_UP_MS : 0;
        fellShort = short;
        for (const subscriber of subscribers) subscriber.dueAt = startedAt + subscriber.pollMs;
        setState({
            value: accepted ? accepted.value : state.value,
            settledAt: serverNow(),
            failures: accepted ? 0 : state.failures + 1,
            offline: accepted ? false : state.offline,
        });
        schedule();
    };

    const start = () => {
        env ??= browserEnv();
        const cancelIdle = env.whenIdle(() => {
            idle = true;
            schedule();
        });
        const unlisten = env.listen((event) => {
            if (event === 'offline') {
                if (!state.offline) setState({ ...state, offline: true });
                return;
            }
            // A connection that has come back is asked at once, whatever is due.
            if (event === 'online') askNow = true;
            schedule();
        });
        stop = () => {
            cancelIdle();
            unlisten();
        };
    };

    // What one page view learned is not carried into the next.
    const reset = () => {
        stop?.();
        stop = null;
        env?.clearTimer(timer);
        timer = null;
        inFlight?.abort();
        inFlight = null;
        idle = false;
        lastAttemptAt = 0;
        fellShort = false;
        followUpAt = 0;
        askNow = false;
        clockOffset = 0;
        state = initialState;
    };

    return {
        initialState,
        getState: () => state,
        serverNow,
        subscribe(interest, listener) {
            if (!stop) start();
            const now = env ? env.now() : Date.now();
            // Never later than one interval from now: a visitor's clock that
            // runs behind the server's makes a figure look newer than it is.
            const dueIn = interest.dueIn > 0 ? Math.min(interest.dueIn, interest.pollMs) : 0;
            const subscriber: Subscriber = { ...interest, listener, dueAt: now + dueIn };
            subscribers.add(subscriber);
            schedule();
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size > 0) return;
                // After the current task: React re-subscribes a component whose
                // props changed in the same pass, and that is not a new page view.
                queueMicrotask(() => {
                    if (subscribers.size === 0) reset();
                });
            };
        },
    };
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPoller, type Accepted, type PollerEnv } from './livePoller';

/**
 * The poller against a stand-in browser: vitest's fake clock for time and
 * timers, and a fetch whose answers the test queues.
 */

const URL = '/api/live/thing';
const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);

type Answer = { status?: number; body?: unknown; age?: string; hang?: true; throws?: true };

function browser() {
    const requests: { url: string; init: RequestInit; at: number }[] = [];
    const answers: Answer[] = [];
    let idleRun: (() => void) | null = null;
    let onEvent: ((event: 'visible' | 'online' | 'offline') => void) | null = null;
    let hidden = false;

    const env: PollerEnv = {
        now: () => Date.now(),
        fetch: (url, init) => {
            requests.push({ url, init, at: Date.now() });
            const answer = answers.shift() ?? { body: { generatedAt: Date.now(), n: requests.length } };
            if (answer.throws) return Promise.reject(new TypeError('Failed to fetch'));
            if (answer.hang) {
                return new Promise((_, reject) => {
                    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                });
            }
            return Promise.resolve({
                ok: (answer.status ?? 200) === 200,
                headers: { get: (name: string) => (name === 'age' ? answer.age ?? null : null) },
                json: async () => answer.body,
            });
        },
        setTimer: (run, ms) => setTimeout(run, ms),
        clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
        whenIdle: (run) => {
            idleRun = run;
            return () => { idleRun = null; };
        },
        isHidden: () => hidden,
        listen: (on) => {
            onEvent = on;
            return () => { onEvent = null; };
        },
    };

    return {
        env,
        requests,
        answer: (...next: Answer[]) => { answers.push(...next); },
        /** The page has gone quiet for the first time. */
        idle: () => idleRun?.(),
        hide: () => { hidden = true; },
        show: () => { hidden = false; onEvent?.('visible'); },
        online: () => onEvent?.('online'),
        offline: () => onEvent?.('offline'),
        listening: () => onEvent !== null,
    };
}

/** A poller whose value is the `n` of the last answer it accepted. */
function numberPoller(env: PollerEnv, complete = true) {
    return createPoller<number>({
        url: URL,
        initial: 0,
        env,
        accept: (_previous, body): Accepted<number> | null =>
            (typeof body.n === 'number' ? { value: body.n, complete: body.short === true ? false : complete } : null),
    });
}

const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
});
afterEach(() => {
    vi.useRealTimers();
});

describe('when the first request leaves', () => {
    it('not before the page has been idle', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        await wait(60_000);
        expect(page.requests).toHaveLength(0);

        page.idle();
        await wait(0);
        expect(page.requests).toHaveLength(1);
    });

    it('never for subscribers that left before then: a phone unmounts seven of ten cards as it hydrates', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        const leave = Array.from({ length: 10 }, () => poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {}));
        leave.slice(3).forEach((unsubscribe) => unsubscribe());
        page.idle();
        await wait(0);
        expect(page.requests).toHaveLength(1);

        const none = browser();
        const unused = numberPoller(none.env);
        Array.from({ length: 7 }, () => unused.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {})).forEach((unsubscribe) => unsubscribe());
        none.idle();
        await wait(120_000);
        expect(none.requests).toHaveLength(0);
        expect(none.listening()).toBe(false);
    });

    it('waits until a figure the page came with is due, and no longer than one interval', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        poller.subscribe({ pollMs: 30_000, dueIn: 12_000 }, () => {});
        // The visitor's clock runs behind the server's: the figure looks ten minutes from due.
        poller.subscribe({ pollMs: 300_000, dueIn: 900_000 }, () => {});
        page.idle();
        await wait(11_999);
        expect(page.requests).toHaveLength(0);
        await wait(1);
        expect(page.requests).toHaveLength(1);

        const late = browser();
        const slow = numberPoller(late.env);
        slow.subscribe({ pollMs: 300_000, dueIn: 900_000 }, () => {});
        late.idle();
        await wait(299_999);
        expect(late.requests).toHaveLength(0);
        await wait(1);
        expect(late.requests).toHaveLength(1);
    });
});

describe('the request', () => {
    it('is a GET to the fixed address that carries no referrer and no cookies', async () => {
        const page = browser();
        numberPoller(page.env).subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.idle();
        await wait(0);
        expect(page.requests[0].url).toBe(URL);
        expect(page.requests[0].init).toMatchObject({ referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store' });
        expect(page.requests[0].init.method).toBeUndefined();
        expect(page.requests[0].init.body).toBeUndefined();
    });

    it('is one per tick however many subscribe, at the shortest interval among them', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        const heard: number[] = [];
        const leaveFastest = poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => heard.push(1));
        poller.subscribe({ pollMs: 60_000, dueIn: 0 }, () => heard.push(2));
        poller.subscribe({ pollMs: 300_000, dueIn: 0 }, () => heard.push(3));
        page.idle();
        await wait(0);
        expect(page.requests).toHaveLength(1);
        expect(heard).toEqual([1, 2, 3]);

        await wait(300_000);
        // 0 s, then every 30 s up to and including 300 s.
        expect(page.requests).toHaveLength(11);
        expect(poller.getState().value).toBe(11);

        // Without the fastest subscriber the interval is the next one's.
        leaveFastest();
        await wait(59_999);
        expect(page.requests).toHaveLength(11);
        await wait(1);
        expect(page.requests).toHaveLength(12);
    });

    it('is never sooner than five seconds after the last one, whatever asks', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.idle();
        await wait(1_000);
        expect(page.requests).toHaveLength(1);
        // A card that arrives with no figure wants one now.
        poller.subscribe({ pollMs: 60_000, dueIn: 0 }, () => {});
        await wait(3_999);
        expect(page.requests).toHaveLength(1);
        await wait(1);
        expect(page.requests).toHaveLength(2);
    });

    it('is given up on after fifteen seconds and counted as a failure', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.answer({ hang: true });
        page.idle();
        await wait(14_999);
        expect(poller.getState().settledAt).toBeNull();
        await wait(1);
        expect(poller.getState()).toMatchObject({ failures: 1, value: 0 });
        expect(page.requests[0].init.signal?.aborted).toBe(true);
    });
});

describe('a hidden tab', () => {
    it('asks for nothing, and catches up once when it is shown again', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.idle();
        await wait(0);
        page.hide();
        await wait(600_000);
        expect(page.requests).toHaveLength(1);

        page.show();
        await wait(0);
        expect(page.requests).toHaveLength(2);
        await wait(29_999);
        expect(page.requests).toHaveLength(2);
        await wait(1);
        expect(page.requests).toHaveLength(3);
    });

    it('is not asked for early when it is shown again before anything is due', async () => {
        const page = browser();
        numberPoller(page.env).subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.idle();
        await wait(0);
        page.hide();
        await wait(10_000);
        page.show();
        await wait(19_999);
        expect(page.requests).toHaveLength(1);
        await wait(1);
        expect(page.requests).toHaveLength(2);
    });
});

describe('an answer that cannot be used', () => {
    const cases: [string, Answer][] = [
        ['a 503', { status: 503, body: { error: 'No figure is available right now.' } }],
        ['no connection', { throws: true }],
        ['a body without the time it was put together', { body: { n: 7 } }],
        ['a body the reader turns down', { body: { generatedAt: T0, n: 'seven' } }],
        ['a body that is not an object', { body: 'ok' }],
    ];

    it.each(cases)('%s counts as a failure and keeps the last value', async (_name, bad) => {
        const page = browser();
        const poller = numberPoller(page.env);
        poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.answer({ body: { generatedAt: T0, n: 5 } }, bad, bad);
        page.idle();
        await wait(0);
        expect(poller.getState()).toMatchObject({ value: 5, failures: 0 });
        await wait(30_000);
        expect(poller.getState()).toMatchObject({ value: 5, failures: 1 });
        await wait(30_000);
        expect(poller.getState()).toMatchObject({ value: 5, failures: 2 });

        // The next good answer clears the count.
        await wait(30_000);
        expect(poller.getState().failures).toBe(0);
    });

    it('is asked for again after twelve seconds, once: the server is short on its first answer after a quiet spell', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.answer({ status: 503 }, { status: 503 }, { status: 503 });
        page.idle();
        await wait(0);
        await wait(11_999);
        expect(page.requests).toHaveLength(1);
        await wait(1);
        expect(page.requests).toHaveLength(2);
        // Still failing: back to the ordinary interval, measured from that request.
        await wait(29_999);
        expect(page.requests).toHaveLength(2);
        await wait(1);
        expect(page.requests).toHaveLength(3);
        expect(poller.getState().failures).toBe(3);
    });

    it('the same follow-up for an answer that is usable but short of a figure', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.answer({ body: { generatedAt: T0, n: 1, short: true } });
        page.idle();
        await wait(0);
        expect(poller.getState()).toMatchObject({ value: 1, failures: 0 });
        await wait(12_000);
        expect(page.requests).toHaveLength(2);
        // That one was complete, so the next is a full interval later.
        await wait(29_999);
        expect(page.requests).toHaveLength(2);
        await wait(1);
        expect(page.requests).toHaveLength(3);
    });
});

describe('the clock', () => {
    it('is the server\'s: the time the answer was put together plus the time a CDN held it', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        // The visitor's clock is seven minutes fast, and the CDN held the answer 20 s.
        const serverThen = T0 - 7 * 60_000;
        page.answer({ body: { generatedAt: serverThen - 20_000, n: 1 }, age: '20' });
        page.idle();
        await wait(0);
        expect(poller.getState().settledAt).toBe(serverThen);
        await wait(5_000);
        expect(poller.serverNow()).toBe(serverThen + 5_000);

        // A failed attempt still settles on the server's clock.
        page.answer({ throws: true });
        await wait(25_000);
        expect(poller.getState()).toMatchObject({ failures: 1, settledAt: serverThen + 30_000 });
    });

    it('is the visitor\'s until an answer has arrived', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        expect(poller.serverNow()).toBe(T0);
        poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.answer({ throws: true });
        page.idle();
        await wait(0);
        expect(poller.getState().settledAt).toBe(T0);
    });
});

describe('the connection', () => {
    it('dropping is reported at once and stays reported until an attempt succeeds', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        const heard = vi.fn();
        poller.subscribe({ pollMs: 30_000, dueIn: 0 }, heard);
        page.idle();
        await wait(0);
        heard.mockClear();

        page.offline();
        expect(poller.getState()).toMatchObject({ offline: true, failures: 0 });
        expect(heard).toHaveBeenCalledTimes(1);

        page.answer({ throws: true });
        await wait(30_000);
        expect(poller.getState()).toMatchObject({ offline: true, failures: 1 });
        await wait(12_000);
        expect(poller.getState()).toMatchObject({ offline: false, failures: 0 });
    });

    it('coming back is asked at once, whatever is due', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        poller.subscribe({ pollMs: 300_000, dueIn: 0 }, () => {});
        page.idle();
        await wait(0);
        await wait(1_000);
        page.online();
        await wait(0);
        expect(page.requests).toHaveLength(2);
    });
});

describe('leaving the page', () => {
    it('stops the timers, the listeners and a request in flight, and forgets what was learned', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        const leave = poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.idle();
        await wait(0);
        expect(poller.getState().value).toBe(1);

        page.answer({ hang: true });
        await wait(30_000);
        expect(page.requests).toHaveLength(2);
        leave();
        await wait(0);
        expect(page.requests[1].init.signal?.aborted).toBe(true);
        expect(page.listening()).toBe(false);
        expect(poller.getState()).toBe(poller.initialState);
        await wait(600_000);
        expect(page.requests).toHaveLength(2);
    });

    it('is not what a component does when it subscribes again in the same pass', async () => {
        const page = browser();
        const poller = numberPoller(page.env);
        const leave = poller.subscribe({ pollMs: 30_000, dueIn: 0 }, () => {});
        page.idle();
        await wait(0);
        leave();
        poller.subscribe({ pollMs: 30_000, dueIn: 30_000 }, () => {});
        await wait(0);
        expect(poller.getState().value).toBe(1);
        await wait(30_000);
        expect(page.requests).toHaveLength(2);
    });
});

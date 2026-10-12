import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Server-side plumbing for every request this site makes to a third party.
 *
 * SERVER ONLY (node:async_hooks). Imported by app/actions.ts and the route
 * handlers; never import it from a client component.
 *
 * 1. A timeout that bounds the wait. Aborting the request is not enough: when
 *    Next refetches an expired cache entry during a static render it drops the
 *    caller's AbortSignal, so the request is raced against a timer as well.
 *
 * 2. The age of the answer. Outside a static render, Next's Data Cache hands
 *    back an EXPIRED entry at once and refreshes it in the background, with no
 *    limit on how expired: after a quiet weekend that is Friday's price. The
 *    response's own Date header survives the cache, so it says when the
 *    payload was really fetched; when that is too long ago, the request is
 *    repeated under a cache key the cache has not seen.
 *
 * 3. Live probes. /api/health has to report what the upstream says NOW, not
 *    what a cache remembers, without giving the public server actions a
 *    cache-bypass anyone could use to hammer a provider. A probe is a scope
 *    (runAsLiveProbe), not an argument: nothing a caller can send sets it.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export type NextRequestInit = RequestInit & { next?: { revalidate?: number } };

// ── Live probes ───────────────────────────────────────────────────────────────

// Kept on globalThis: Next compiles the same module once per bundle layer
// (server components, server actions called from the browser, route handlers),
// and a probe started in one copy must be visible to the fetch made in another.
const PROBE_KEY = Symbol.for('btcdca.upstream.probe');
type GlobalWithProbe = typeof globalThis & { [PROBE_KEY]?: AsyncLocalStorage<true> };
const probeScope: AsyncLocalStorage<true> =
    ((globalThis as GlobalWithProbe)[PROBE_KEY] ??= new AsyncLocalStorage<true>());

/**
 * Run `fn` with every upstream request inside it sent straight to the provider
 * (`cache: 'no-store'`), and with the in-memory caches in app/actions.ts
 * skipped on read. Only for a dynamic route handler: a no-store fetch during a
 * static render makes Next abandon the render.
 */
export function runAsLiveProbe<T>(fn: () => Promise<T>): Promise<T> {
    return probeScope.run(true, fn);
}

export const isLiveProbe = (): boolean => probeScope.getStore() === true;

// ── Timeouts ──────────────────────────────────────────────────────────────────

export class UpstreamTimeoutError extends Error {
    constructor(what: string, ms: number) {
        super(`${what} did not answer within ${ms}ms`);
        this.name = 'UpstreamTimeoutError';
    }
}

export class UpstreamHttpError extends Error {
    readonly status: number;
    constructor(what: string, status: number) {
        super(`${what} answered ${status}`);
        this.name = 'UpstreamHttpError';
        this.status = status;
    }
}

/**
 * A 200 whose body is not JSON: a cut-short transfer or an HTML interstitial.
 * Next caches any 200, so the caller may want one more try around the cache.
 */
export class UpstreamPayloadError extends Error {
    constructor(what: string) {
        super(`${what} answered 200 with a body that is not JSON`);
        this.name = 'UpstreamPayloadError';
    }
}

const hostOf = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return 'upstream';
    }
};

/** Reject after `ms` whatever `promise` is doing. The promise itself is left to finish or fail on its own. */
export function withDeadline<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new UpstreamTimeoutError(what, ms)), ms);
    });
    // The loser of the race still settles later; without this a late rejection
    // is reported as unhandled.
    promise.catch(() => {});
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * fetch() that gives up after `timeoutMs`, both by aborting the request and by
 * racing it (see point 1 above). Inside a live probe the Data Cache is bypassed
 * unless the caller marks the request `immutable`.
 */
export function fetchWithTimeout(
    url: string,
    options: NextRequestInit & { immutable?: boolean } = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
    const { immutable, ...rest } = options;
    let init: NextRequestInit = rest;
    if (isLiveProbe() && !immutable) {
        // `cache: 'no-store'` together with `next.revalidate` is a conflict
        // Next resolves by ignoring both, so the cache setting goes alone.
        init = { ...rest, cache: 'no-store' };
        delete init.next;
    }
    const controller = new AbortController();
    const request = fetch(url, { ...init, signal: controller.signal });
    return withDeadline(request, timeoutMs, hostOf(url)).catch((error) => {
        controller.abort();
        throw error;
    });
}

// ── Age-bounded requests ──────────────────────────────────────────────────────

/**
 * When a response was really fetched: its Date header, which Next stores with
 * the cached body. Falls back to `now` (assume fresh) when the header is
 * missing or unusable.
 */
export function responseTime(res: Response, now: number = Date.now()): number {
    const header = res.headers.get('date');
    const parsed = header ? Date.parse(header) : NaN;
    // A clock a little ahead of ours is normal; never report the future.
    if (!Number.isFinite(parsed) || parsed > now + 60_000) return now;
    // A provider's own CDN stamps the current Date on a copy it has held for
    // a while and says how long in Age (Coinbase's candles: up to 300s).
    const age = Number(res.headers.get('age'));
    const heldMs = Number.isFinite(age) && age > 0 ? age * 1000 : 0;
    return Math.min(parsed - heldMs, now);
}

/**
 * How old a cached answer may be before it is refetched in-band. Twice its
 * lifetime: anything fresher is at worst one background refresh behind, and
 * bypassing the cache for that would just double the upstream traffic.
 */
export const maxAcceptableAgeMs = (revalidateSeconds: number): number =>
    Math.max(revalidateSeconds * 2000, revalidateSeconds * 1000 + 60_000);

const withParam = (url: string, name: string, value: string): string =>
    `${url}${url.includes('?') ? '&' : '?'}${name}=${value}`;

export interface UpstreamRequest {
    headers?: Record<string, string>;
    /** Seconds the answer may be reused from Next's Data Cache. */
    revalidate: number;
    timeoutMs?: number;
    /**
     * Name of a query parameter the upstream ignores. Given one, an answer
     * older than maxAcceptableAgeMs is refetched under a different cache key
     * (see point 2 above). Leave it out for an upstream that rejects unknown
     * parameters; the caller then has to judge the age itself.
     */
    bustParam?: string;
    /**
     * Skip the cached copy on purpose: the payload it holds failed validation.
     * Needs `bustParam`.
     */
    retry?: boolean;
    /** Data that never changes once published: keep using the cache inside a live probe. */
    immutable?: boolean;
}

export interface UpstreamResponse {
    res: Response;
    /** ms epoch the payload was fetched from the provider (not when it was read from a cache). */
    fetchedAt: number;
    /**
     * Set when the cached answer was too old, the provider was asked again and
     * did not answer: `res` is the old copy. For a figure that has to be
     * current, that is a failure of the provider.
     */
    refetchFailed?: true;
}

/** One upstream GET through the Data Cache, with the timeout and the age bound described above. */
export async function upstreamFetch(url: string, request: UpstreamRequest): Promise<UpstreamResponse> {
    const { headers, revalidate, timeoutMs = DEFAULT_TIMEOUT_MS, bustParam, retry, immutable } = request;
    const init: NextRequestInit & { immutable?: boolean } = { headers, next: { revalidate }, immutable };
    const now = Date.now();
    const lifetimeMs = Math.max(1, revalidate) * 1000;
    // One spare key per cache lifetime, so a burst of callers that all find the
    // entry expired share a single refetch instead of minting a key each.
    const window = Math.floor(now / lifetimeMs);
    // A request under a spare key was either made just now or cached earlier in
    // this same window, so it is at most one lifetime old whatever its Date
    // header claims. Without this floor, an upstream that sent a wrong Date
    // would look permanently out of date and never be believed.
    const spareKeyTime = (res: Response): number => Math.max(responseTime(res, now), now - lifetimeMs);

    if (retry && bustParam) {
        const res = await fetchWithTimeout(withParam(url, bustParam, `r${window}`), init, timeoutMs);
        return { res, fetchedAt: spareKeyTime(res) };
    }

    const res = await fetchWithTimeout(url, init, timeoutMs);
    const fetchedAt = responseTime(res, now);
    // Immutable data cannot go out of date, however long ago it was fetched.
    const expired = !immutable && now - fetchedAt > maxAcceptableAgeMs(revalidate);
    if (!expired || !bustParam || !res.ok || isLiveProbe()) return { res, fetchedAt };

    try {
        const fresh = await fetchWithTimeout(withParam(url, bustParam, String(window)), init, timeoutMs);
        if (fresh.ok) {
            // The superseded body is never read; release it.
            void res.body?.cancel().catch(() => {});
            return { res: fresh, fetchedAt: spareKeyTime(fresh) };
        }
    } catch {
        // Fall through: the caller gets the old answer, its true age, and the
        // fact that the provider could not be asked.
    }
    return { res, fetchedAt, refetchFailed: true };
}

/** upstreamFetch + status check + JSON parse, the parse included in the deadline. */
export async function upstreamJson(
    url: string,
    request: UpstreamRequest,
): Promise<{ json: unknown; fetchedAt: number; refetchFailed?: true }> {
    const { res, fetchedAt, refetchFailed } = await upstreamFetch(url, request);
    if (!res.ok) throw new UpstreamHttpError(hostOf(url), res.status);
    try {
        const json: unknown = await withDeadline(res.json(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS, `${hostOf(url)} body`);
        return { json, fetchedAt, refetchFailed };
    } catch (error) {
        // Only a body that will not parse. A body that timed out or broke off
        // mid-transfer stays a failed request, which is not worth a second try.
        if (error instanceof SyntaxError) throw new UpstreamPayloadError(hostOf(url));
        throw error;
    }
}

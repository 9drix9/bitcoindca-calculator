import type { PriceProvider } from '@/data/priceSources';
import type { PriceMode } from '@/types';
import { parseUtcDate } from './dates';

/**
 * A request for a price series: which exchange, and the plan window it is for.
 * Dates are 'yyyy-MM-dd' UTC days, as the calculator's date fields hold them.
 */
export interface PriceRequest {
    provider: PriceProvider;
    start: string;
    end: string;
}

export const samePriceRequest = (a: PriceRequest | null, b: PriceRequest | null): boolean =>
    a === b
    || (a !== null && b !== null && a.provider === b.provider && a.start === b.start && a.end === b.end);

/**
 * True when the series that was loaded for `loaded` also prices `wanted`.
 *
 * A series is fetched from 14 days before its start to the day after its end,
 * one row per day, so it holds every row a LATER start with the same end would
 * be sent: the engine looks prices up by day and gives the same result from
 * either (pinned by a test). Nothing else is safe to reuse:
 *
 *  - an earlier start has purchases the series has no rows for;
 *  - a different end changes the series' last rows, which is what a result
 *    with no live price is valued at: an earlier end computed from the longer
 *    series would be valued at a price from after the plan ended;
 *  - another exchange's series is another exchange's prices.
 */
export const answersPriceRequest = (loaded: PriceRequest | null, wanted: PriceRequest): boolean => {
    if (loaded === null || loaded.provider !== wanted.provider || loaded.end !== wanted.end) return false;
    // Compared as dates: a string compare would wave through a five-digit year.
    const loadedStart = parseUtcDate(loaded.start);
    const wantedStart = parseUtcDate(wanted.start);
    return Number.isFinite(loadedStart) && Number.isFinite(wantedStart) && loadedStart <= wantedStart;
};

/** Why the form's own plan is not what the results show. */
export type ViewHold = 'dates' | 'loading' | 'failed';

/**
 * Which plan window the results describe.
 *
 *  - `current`: the form's own window.
 *  - `earlier`: the last window that could be shown. The form has moved on to
 *    one that cannot be shown yet (`because`), and the earlier result stays on
 *    screen, marked as such, instead of being swapped for a placeholder.
 *  - `none`: nothing can be shown.
 */
export type ResultView =
    | { kind: 'current'; request: PriceRequest }
    | { kind: 'earlier'; request: PriceRequest; because: ViewHold }
    | { kind: 'none'; because: ViewHold };

export interface ResultViewInput {
    priceMode: PriceMode;
    /** False while the date fields hold something the engine cannot run. */
    datesValid: boolean;
    /** What the form asks for right now. */
    form: PriceRequest;
    /** The last window shown as `current`, if any. */
    shown: PriceRequest | null;
    /** The request the series in memory was loaded for; null when there is no series. */
    loaded: PriceRequest | null;
    /** True when the last attempt to load the form's series failed. */
    failed: boolean;
}

/**
 * Decides what the results area shows for the form as it stands.
 *
 * Manual mode prices every buy at one typed figure, so it needs no series and
 * only invalid dates can hold it back. With live prices the form's window is
 * shown once the loaded series answers it (see answersPriceRequest); until
 * then the earlier window is kept, but only while the series in memory still
 * answers THAT window, so a figure is never computed from prices that belong
 * to a different one.
 */
export function selectResultView({ priceMode, datesValid, form, shown, loaded, failed }: ResultViewInput): ResultView {
    const priced = (request: PriceRequest) => priceMode === 'manual' || answersPriceRequest(loaded, request);
    if (datesValid && priced(form)) return { kind: 'current', request: form };
    const because: ViewHold = !datesValid ? 'dates' : failed ? 'failed' : 'loading';
    if (shown !== null && priced(shown)) return { kind: 'earlier', request: shown, because };
    return { kind: 'none', because };
}

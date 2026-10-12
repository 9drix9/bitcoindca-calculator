import { ImageResponse } from 'next/og';
import { BRAND_OG_PATH } from '@/components/brand/Logo';
import {
    computeShareCard,
    resolveShareParams,
    toCalculatorParams,
    ShareCardData,
} from '@/app/share/shareData';

// nodejs (not edge) so the server actions' fetch + LRU cache path is reused.
export const runtime = 'nodejs';

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Every string on the card is built from validated numbers and fixed words
 * (shareData: decodeParams drops anything that is not a number, a date or a
 * known keyword), so no free text from the URL is ever drawn. What a URL can
 * still do is make a figure long: amounts go up to a billion a day and a
 * yearly raise compounds. Satori does not shrink or wrap a number, it lets it
 * run off the canvas, so the type steps down with the length instead.
 */
function fitFontSize(text: string, steps: readonly (readonly [maxChars: number, size: number])[], floor: number): number {
    for (const [maxChars, size] of steps) {
        if (text.length <= maxChars) return size;
    }
    return floor;
}

function Header() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
                style={{
                    width: 72,
                    height: 72,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <svg width={64} height={64} viewBox="0 0 24 24" fill="#f59e0b">
                    <path d={BRAND_OG_PATH} />
                </svg>
            </div>
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#f8fafc', letterSpacing: -0.5 }}>
                Bitcoin DCA Calculator
            </div>
        </div>
    );
}

function Domain() {
    return (
        <div style={{ display: 'flex', fontSize: 22, color: '#f59e0b', letterSpacing: 1 }}>
            btcdollarcostaverage.com
        </div>
    );
}

function ResultCard({ card }: { card: ShareCardData }) {
    // 1072px of width inside the padding. Measured on rendered cards, a figure
    // with its separators averages about half its font size per character, so
    // each step below leaves a margin on that.
    const valueSize = fitFontSize(card.currentValueText, [[18, 96], [26, 72], [36, 52]], 36);
    const profitSize = fitFontSize(card.profitText, [[44, 44]], 32);
    // The plan line wraps, at about 80 characters a line at 28px. Four lines
    // is all the card has room for; the longest line shareData can build is
    // about 340 characters.
    const paramsSize = fitFontSize(card.paramsLine, [[240, 28]], 24);

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                backgroundColor: '#020617',
                fontFamily: 'sans-serif',
                padding: 64,
            }}
        >
            <Header />

            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                    style={{
                        display: 'flex',
                        fontSize: 22,
                        fontWeight: 600,
                        color: '#64748b',
                        letterSpacing: 4,
                        textTransform: 'uppercase',
                    }}
                >
                    {card.valueLabel}
                </div>
                <div
                    style={{
                        display: 'flex',
                        fontSize: valueSize,
                        fontWeight: 800,
                        color: '#f8fafc',
                        letterSpacing: -1,
                        marginTop: 8,
                    }}
                >
                    {card.currentValueText}
                </div>
                <div
                    style={{
                        display: 'flex',
                        fontSize: profitSize,
                        fontWeight: 700,
                        color: card.isProfit ? '#34d399' : '#fb7185',
                        marginTop: 8,
                    }}
                >
                    {card.profitText}
                </div>
                <div style={{ display: 'flex', fontSize: paramsSize, lineHeight: 1.3, color: '#94a3b8', marginTop: 24 }}>
                    {card.paramsLine}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Domain />
            </div>
        </div>
    );
}

function GenericCard() {
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#020617',
                fontFamily: 'sans-serif',
                padding: 80,
            }}
        >
            <div
                style={{
                    width: 120,
                    height: 120,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 48,
                }}
            >
                <svg width={108} height={108} viewBox="0 0 24 24" fill="#f59e0b">
                    <path d={BRAND_OG_PATH} />
                </svg>
            </div>
            <div
                style={{
                    display: 'flex',
                    fontSize: 68,
                    fontWeight: 800,
                    color: '#f8fafc',
                    letterSpacing: -2,
                    textAlign: 'center',
                    marginBottom: 24,
                }}
            >
                Bitcoin DCA Calculator
            </div>
            <div
                style={{
                    display: 'flex',
                    fontSize: 28,
                    color: '#94a3b8',
                    maxWidth: 760,
                    textAlign: 'center',
                    lineHeight: 1.4,
                }}
            >
                Backtest your dollar-cost-averaging strategy with real market data
            </div>
            <div style={{ display: 'flex', fontSize: 20, color: '#64748b', marginTop: 56, letterSpacing: 1 }}>
                btcdollarcostaverage.com
            </div>
        </div>
    );
}

const SHORT_CACHE = 'public, max-age=300, s-maxage=300';

/**
 * The finished PNG of a result card (the generic card for null), or a
 * rejection when it cannot be drawn.
 *
 * ImageResponse draws nothing in its constructor: the work happens when its
 * body is read, so a card Satori refuses never throws where it is created.
 * Returned as it is, such a response has already promised 200, image/png and
 * an hour in every cache before its body breaks off. Reading the body here
 * puts the failure where GET's fallback can catch it.
 */
function draw(card: ShareCardData | null): Promise<ArrayBuffer> {
    const element = card ? <ResultCard card={card} /> : <GenericCard />;
    return new ImageResponse(element, { width: WIDTH, height: HEIGHT }).arrayBuffer();
}

const png = (body: ArrayBuffer, cacheControl: string): Response =>
    new Response(body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': cacheControl } });

export async function GET(request: Request) {
    let card: ShareCardData | null = null;
    try {
        const raw = Object.fromEntries(new URL(request.url).searchParams);
        // One reading of the clock decides the default dates and what "today"
        // is for the figures, as on /share and /embed.
        const now = Date.now();
        card = await computeShareCard(resolveShareParams(toCalculatorParams(raw), now), now);
    } catch {
        card = null;
    }

    // Shorter cache on the fallback so a transient API failure doesn't pin a
    // generic card to a shared link for a full hour. The same goes for a card
    // drawn on the other exchange's prices, an earlier copy of the series or
    // constant FX rates: correct enough to show, not to keep.
    const cacheControl = card && !card.degraded ? 'public, max-age=3600, s-maxage=3600' : SHORT_CACHE;

    try {
        return png(await draw(card), cacheControl);
    } catch (error) {
        console.error('[api/og] render failed:', error);
        return png(await draw(null), SHORT_CACHE);
    }
}

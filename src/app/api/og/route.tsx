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
                    Current value
                </div>
                <div
                    style={{
                        display: 'flex',
                        fontSize: 96,
                        fontWeight: 800,
                        color: '#f8fafc',
                        letterSpacing: -3,
                        marginTop: 8,
                    }}
                >
                    {card.currentValueText}
                </div>
                <div
                    style={{
                        display: 'flex',
                        fontSize: 44,
                        fontWeight: 700,
                        color: card.isProfit ? '#34d399' : '#fb7185',
                        marginTop: 8,
                    }}
                >
                    {card.profitText}
                </div>
                <div style={{ display: 'flex', fontSize: 28, color: '#94a3b8', marginTop: 24 }}>
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

export async function GET(request: Request) {
    let card: ShareCardData | null = null;
    try {
        const raw = Object.fromEntries(new URL(request.url).searchParams);
        card = await computeShareCard(resolveShareParams(toCalculatorParams(raw)));
    } catch {
        card = null;
    }

    // Shorter cache on the fallback so a transient API failure doesn't pin a
    // generic card to a shared link for a full hour.
    const cacheControl = card
        ? 'public, max-age=3600, s-maxage=3600'
        : 'public, max-age=300, s-maxage=300';

    try {
        return new ImageResponse(card ? <ResultCard card={card} /> : <GenericCard />, {
            width: WIDTH,
            height: HEIGHT,
            headers: { 'Cache-Control': cacheControl },
        });
    } catch (error) {
        console.error('[api/og] render failed:', error);
        return new ImageResponse(<GenericCard />, {
            width: WIDTH,
            height: HEIGHT,
            headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
        });
    }
}

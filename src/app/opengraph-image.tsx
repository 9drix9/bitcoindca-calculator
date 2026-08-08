import { ImageResponse } from 'next/og';
import { SAT_LADDER_OG_PATH } from '@/components/brand/Logo';

export const runtime = 'edge';
export const alt = 'Bitcoin DCA Calculator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
    return new ImageResponse(
        (
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
                {/* Sat Ladder mark */}
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
                        <path d={SAT_LADDER_OG_PATH} />
                    </svg>
                </div>

                {/* Title */}
                <div
                    style={{
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

                {/* Subtitle */}
                <div
                    style={{
                        fontSize: 28,
                        color: '#94a3b8',
                        maxWidth: 760,
                        textAlign: 'center',
                        lineHeight: 1.4,
                    }}
                >
                    Backtest your dollar-cost-averaging strategy with real market data
                </div>

                {/* Domain */}
                <div
                    style={{
                        fontSize: 20,
                        color: '#64748b',
                        marginTop: 56,
                        letterSpacing: 1,
                    }}
                >
                    btcdollarcostaverage.com
                </div>
            </div>
        ),
        { ...size }
    );
}

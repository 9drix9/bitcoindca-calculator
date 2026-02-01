import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Bitcoin DCA Calculator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'sans-serif',
                }}
            >
                <div
                    style={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: '#f59e0b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 44,
                        fontWeight: 'bold',
                        color: 'white',
                        marginBottom: 24,
                    }}
                >
                    ₿
                </div>
                <div
                    style={{
                        fontSize: 56,
                        fontWeight: 800,
                        background: 'linear-gradient(90deg, #f59e0b, #ea580c)',
                        backgroundClip: 'text',
                        color: 'transparent',
                        marginBottom: 16,
                    }}
                >
                    Bitcoin DCA Calculator
                </div>
                <div
                    style={{
                        fontSize: 24,
                        color: '#94a3b8',
                        maxWidth: 600,
                        textAlign: 'center',
                    }}
                >
                    Calculate your returns with real historical data from Kraken and Coinbase
                </div>
                <div
                    style={{
                        fontSize: 16,
                        color: '#64748b',
                        marginTop: 32,
                    }}
                >
                    btcdollarcostaverage.com
                </div>
            </div>
        ),
        { ...size }
    );
}

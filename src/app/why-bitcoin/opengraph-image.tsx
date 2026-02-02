import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Why Bitcoin Has Value';
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
                        fontSize: 48,
                        fontWeight: 800,
                        background: 'linear-gradient(90deg, #f59e0b, #ea580c)',
                        backgroundClip: 'text',
                        color: 'transparent',
                        marginBottom: 16,
                        textAlign: 'center',
                        maxWidth: 800,
                    }}
                >
                    Where Does Bitcoin&apos;s Value Come From?
                </div>
                <div
                    style={{
                        fontSize: 22,
                        color: '#94a3b8',
                        maxWidth: 700,
                        textAlign: 'center',
                        lineHeight: 1.4,
                    }}
                >
                    User Adoption &middot; Network Effect &middot; Cost of Mining &middot; Exiting Fiat
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

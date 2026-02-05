import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Why Self-Custody Matters for Bitcoin';
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
                <svg
                    width="80"
                    height="80"
                    viewBox="0 0 64 64"
                    style={{ marginBottom: 24 }}
                >
                    <circle cx="32" cy="32" r="32" fill="#f59e0b" />
                    <path
                        fill="white"
                        d="M41.7 27.8c.5-3.4-2.1-5.2-5.6-6.4l1.1-4.6-2.8-.7-1.1 4.5c-.7-.2-1.5-.4-2.2-.5l1.1-4.5-2.8-.7-1.1 4.6c-.6-.1-1.2-.3-1.7-.4l-3.9-1-.7 3s2.1.5 2 .5c1.1.3 1.3 1 1.3 1.6l-1.3 5.3c.1 0 .2 0 .3.1h-.3l-1.8 7.4c-.1.3-.5.9-1.3.7 0 0-2-.5-2-.5l-1.4 3.2 3.7.9c.7.2 1.3.3 2 .5l-1.2 4.6 2.8.7 1.2-4.6c.8.2 1.5.4 2.2.5l-1.1 4.6 2.8.7 1.2-4.6c4.8.9 8.4.5 9.9-3.8 1.2-3.5-.1-5.5-2.5-6.8 1.8-.4 3.2-1.6 3.5-4.1zm-6.3 8.8c-.9 3.5-6.8 1.6-8.7 1.1l1.6-6.2c1.9.5 8.1 1.4 7.1 5.1zm.9-8.9c-.8 3.2-5.7 1.6-7.3 1.2l1.4-5.7c1.6.4 6.8 1.1 5.9 4.5z"
                    />
                </svg>
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
                    Why Self-Custody Matters
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
                    Not Your Keys, Not Your Coins &middot; Hardware Wallets &middot; Secure Your Bitcoin
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

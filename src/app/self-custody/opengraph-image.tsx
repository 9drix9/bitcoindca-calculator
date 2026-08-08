import { ImageResponse } from 'next/og';
import { SAT_LADDER_OG_PATH } from '@/components/brand/Logo';

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
                    viewBox="0 0 24 24"
                    fill="#f59e0b"
                    style={{ marginBottom: 24 }}
                >
                    <path d={SAT_LADDER_OG_PATH} />
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

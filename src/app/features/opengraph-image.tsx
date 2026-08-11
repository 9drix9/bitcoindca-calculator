import { ImageResponse } from 'next/og';
import { BRAND_OG_PATH } from '@/components/brand/Logo';

export const runtime = 'edge';
export const alt = 'Bitcoin DCA Calculator Features Guide';
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
                    <path d={BRAND_OG_PATH} />
                </svg>
                <div
                    style={{
                        fontSize: 52,
                        fontWeight: 800,
                        background: 'linear-gradient(90deg, #f59e0b, #ea580c)',
                        backgroundClip: 'text',
                        color: 'transparent',
                        marginBottom: 16,
                        textAlign: 'center',
                    }}
                >
                    Features Guide
                </div>
                <div
                    style={{
                        fontSize: 24,
                        color: '#94a3b8',
                        maxWidth: 800,
                        textAlign: 'center',
                        lineHeight: 1.4,
                    }}
                >
                    Learn how to use every tool in the Bitcoin DCA Calculator
                </div>
                <div
                    style={{
                        display: 'flex',
                        gap: 16,
                        marginTop: 32,
                        fontSize: 14,
                        color: '#64748b',
                    }}
                >
                    <span>12 Calculator Tools</span>
                    <span>&middot;</span>
                    <span>10 Live Widgets</span>
                    <span>&middot;</span>
                    <span>Beginner Friendly</span>
                </div>
                <div
                    style={{
                        fontSize: 16,
                        color: '#64748b',
                        marginTop: 24,
                    }}
                >
                    btcdollarcostaverage.com
                </div>
            </div>
        ),
        { ...size }
    );
}

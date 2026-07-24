'use client';

import { useState } from 'react';

interface WalletImageProps {
    src: string;
    alt: string;
    fallbackEmoji: string;
}

export const WalletImage = ({ src, alt, fallbackEmoji }: WalletImageProps) => {
    const [failed, setFailed] = useState(false);

    if (failed) {
        return (
            <div className="text-center p-4">
                <div className="text-4xl mb-2">{fallbackEmoji}</div>
                <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{alt}</div>
            </div>
        );
    }

    return (
        // Plain <img> is intentional: the onError fallback pattern is simpler and
        // more reliable than next/image for these small static PNGs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={alt}
            width={220}
            height={220}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-contain p-4"
            onError={() => setFailed(true)}
        />
    );
};

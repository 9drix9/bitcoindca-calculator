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
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={alt}
            className="w-full h-full object-contain p-4"
            onError={() => setFailed(true)}
        />
    );
};

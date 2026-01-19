'use client';

import { useEffect, useRef } from 'react';

interface AdSlotProps {
    slotId: string;
    format?: 'auto' | 'fluid' | 'rectangle';
    className?: string;
    style?: React.CSSProperties;
}

export const AdSlot = ({ slotId, format = 'auto', className = '', style = {} }: AdSlotProps) => {
    const adRef = useRef<HTMLModElement>(null);

    useEffect(() => {
        try {
            // @ts-ignore
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (err) {
            console.error('AdSense error', err);
        }
    }, []);

    return (
        <div className={`overflow-hidden ${className}`}>
            <ins
                className="adsbygoogle block"
                style={{ display: 'block', ...style }}
                data-ad-client="ca-pub-7196704678615727"
                data-ad-slot={slotId}
                data-ad-format={format}
                data-full-width-responsive="true"
            />
        </div>
    );
};

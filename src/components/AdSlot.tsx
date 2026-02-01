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
    const pushed = useRef(false);

    useEffect(() => {
        // Guard against double-push (React strict mode, conditional re-mounts)
        if (pushed.current) return;

        // Only push if the <ins> element exists and hasn't been filled yet
        const insEl = adRef.current;
        if (!insEl) return;
        if (insEl.dataset.adsbygoogleStatus) return; // already filled

        try {
            // @ts-expect-error adsbygoogle is injected by the external script
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            pushed.current = true;
        } catch (err) {
            console.error('AdSense error', err);
        }
    }, []);

    return (
        <div className={`overflow-hidden ${className}`}>
            <ins
                ref={adRef}
                className="adsbygoogle"
                style={{ display: 'block', ...style }}
                data-ad-client="ca-pub-7196704678615727"
                data-ad-slot={slotId}
                data-ad-format={format}
                data-full-width-responsive="true"
            />
        </div>
    );
};

'use client';

import { useState, useEffect, useRef } from 'react';

interface AdSlotProps {
    unitId?: string;
    className?: string;
}

export const AdSlot = ({ unitId = '2426249', className = '' }: AdSlotProps) => {
    const [visible, setVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} className={`w-full relative ${className}`}>
            {visible && (
                <iframe
                    data-aa={unitId}
                    src={`//acceptable.a-ads.com/${unitId}/?size=Adaptive`}
                    title="Advertisement"
                    loading="lazy"
                    suppressHydrationWarning
                    style={{
                        border: 0,
                        padding: 0,
                        width: '100%',
                        height: 'auto',
                        overflow: 'hidden',
                        display: 'block',
                        margin: '0 auto',
                    }}
                />
            )}
        </div>
    );
};

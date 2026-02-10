'use client';

import { useEffect, useRef } from 'react';

interface AdSlotProps {
    unitId?: string;
    className?: string;
}

export const AdSlot = ({ unitId = '2426249', className = '' }: AdSlotProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const loaded = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !loaded.current) {
                    loaded.current = true;
                    observer.disconnect();

                    const script = document.createElement('script');
                    script.src = `//acceptable.a-ads.com/${unitId}/?size=Adaptive`;
                    script.async = true;
                    el.appendChild(script);
                }
            },
            { rootMargin: '200px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [unitId]);

    return <div ref={ref} className={`w-full relative ${className}`} />;
};

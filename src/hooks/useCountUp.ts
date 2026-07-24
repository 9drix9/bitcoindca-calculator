'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animate a number toward its new value (350ms ease-out).
 * Returns the raw value with no animation when the user prefers reduced motion,
 * and snaps immediately on the first render so SSR/hydration output matches.
 */
export function useCountUp(target: number, durationMs = 350): number {
    const [display, setDisplay] = useState(target);
    const firstRender = useRef(true);
    const frameRef = useRef<number | null>(null);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            setDisplay(target);
            return;
        }
        if (!Number.isFinite(target)) {
            setDisplay(target);
            return;
        }
        if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setDisplay(target);
            return;
        }

        const from = display;
        if (from === target) return;
        const start = performance.now();

        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / durationMs);
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplay(from + (target - from) * eased);
            if (t < 1) frameRef.current = requestAnimationFrame(tick);
        };
        frameRef.current = requestAnimationFrame(tick);
        return () => {
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target, durationMs]);

    return display;
}

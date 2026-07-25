'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Forwards humans to the calculator with the shared params. Social crawlers
 * don't execute JS, so they stay on /share and read its result-specific meta.
 */
export function ShareRedirect({ target }: { target: string }) {
    const router = useRouter();

    useEffect(() => {
        router.replace(target);
    }, [router, target]);

    return null;
}

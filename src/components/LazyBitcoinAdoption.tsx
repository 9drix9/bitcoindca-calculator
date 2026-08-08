'use client';

import dynamic from 'next/dynamic';

/**
 * Client-side boundary for the Recharts-backed adoption chart.
 *
 * `ssr: false` is rejected by next/dynamic inside a Server Component, and
 * src/app/page.tsx is one — so the opt-out has to happen behind a 'use client'
 * module. Without it, importing this chart from the homepage drags Recharts
 * (~370 KB) into the server render and the initial script set.
 */
const BitcoinAdoption = dynamic(
    () => import('@/components/BitcoinAdoption').then((m) => m.BitcoinAdoption),
    {
        ssr: false,
        loading: () => <div className="h-[400px] bg-slate-100 dark:bg-slate-800/50 rounded-xl animate-pulse" />,
    },
);

export function LazyBitcoinAdoption() {
    return <BitcoinAdoption />;
}

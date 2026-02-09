'use client';

import dynamic from 'next/dynamic';

const Analytics = dynamic(() => import('@vercel/analytics/next').then(m => m.Analytics), { ssr: false });
const SpeedInsights = dynamic(() => import('@vercel/speed-insights/next').then(m => m.SpeedInsights), { ssr: false });

export function LazyAnalytics() {
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}

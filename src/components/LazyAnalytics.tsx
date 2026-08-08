'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const Analytics = dynamic(() => import('@vercel/analytics/next').then(m => m.Analytics), { ssr: false });
const SpeedInsights = dynamic(() => import('@vercel/speed-insights/next').then(m => m.SpeedInsights), { ssr: false });

export function LazyAnalytics() {
  const pathname = usePathname();

  // /embed-guide tells publishers the widget "loads no third-party scripts,
  // sets no cookies, and collects nothing from your readers". That promise is
  // made to someone else's audience on someone else's site, so it has to be
  // literally true — no analytics inside the embedded iframe.
  if (pathname === '/embed' || pathname?.startsWith('/embed/')) return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}

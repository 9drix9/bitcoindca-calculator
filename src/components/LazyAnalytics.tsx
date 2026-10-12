'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const Analytics = dynamic(() => import('@vercel/analytics/next').then(m => m.Analytics), { ssr: false });
const SpeedInsights = dynamic(() => import('@vercel/speed-insights/next').then(m => m.SpeedInsights), { ssr: false });

/**
 * Cuts a report's page address down to origin + path before either Vercel
 * script sends it.
 *
 * The calculator keeps its settings in the address bar (amount, dates, fee, a
 * starting stack and what it cost) and both scripts report `location.href` as
 * it stands, so without this every page view and every vitals report carried
 * the visitor's plan. /privacy says everything after a "?" or a "#" is removed.
 * This function is what makes that sentence true, so the two change together
 * (src/app/privacy/disclosure.test.ts holds them to each other).
 *
 * The whole query string goes, not a list of known keys: a list has to be kept
 * in step with every tool that adds a parameter, and the day it falls behind
 * the new one is sent. Campaign tags go with the rest.
 *
 * Returning null makes either script send nothing. That is the right failure:
 * an address that cannot be parsed cannot be shown to be clean.
 *
 * Declared at module scope because both components re-register `beforeSend`
 * whenever its identity changes.
 */
export function stripQueryAndHash<T extends { url: string }>(event: T): T | null {
  try {
    const url = new URL(event.url);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.href };
  } catch {
    return null;
  }
}

export function LazyAnalytics() {
  const pathname = usePathname();

  // /embed-guide tells publishers the widget "loads no third-party scripts,
  // sets no cookies and runs no analytics". That promise is made to someone
  // else's audience on someone else's site, so it has to be literally true:
  // no analytics inside the embedded iframe.
  if (pathname === '/embed' || pathname?.startsWith('/embed/')) return null;

  return (
    <>
      <Analytics beforeSend={stripQueryAndHash} />
      <SpeedInsights beforeSend={stripQueryAndHash} />
    </>
  );
}

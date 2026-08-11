'use client';

import dynamic from 'next/dynamic';
import { SkeletonCard } from '@/components/Skeleton';
import type { DcaCalculatorProps } from '@/components/DcaCalculator';

export function DcaCalculatorSkeleton() {
  return (
  <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 animate-pulse">
            <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
            {/* Preset chip rows. h-11 below sm: the real chips are <button>s, so
                the globals.css 44px base-layer floor governs them on phones. */}
            <div className="space-y-3 mb-5 sm:mb-6">
              <div>
                <div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded mb-1.5" />
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-11 sm:h-7 w-32 bg-slate-100 dark:bg-slate-800 rounded-full" />
                  ))}
                </div>
              </div>
              <div>
                <div className="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded mb-1.5" />
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-11 sm:h-7 w-36 bg-slate-100 dark:bg-slate-800 rounded-full" />
                  ))}
                </div>
              </div>
            </div>
            {/* Must mirror the real form grid in DcaCalculator (2-up on phones,
                exchange presets spanning the full row after the third field) or
                the swap shifts everything below by a couple hundred pixels. */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                </div>
              ))}
              <div className="col-span-2 lg:col-span-3">
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-1.5" />
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-11 sm:h-7 w-24 bg-slate-100 dark:bg-slate-800 rounded-full" />
                  ))}
                </div>
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                // The last cell mirrors the real Price Mode cell's spans.
                <div key={i} className={`space-y-1.5${i === 3 ? ' sm:col-span-2 lg:col-span-1' : ''}`}>
                  <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between">
              <div className="h-6 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="h-6 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        </div>
  );
}

const DcaCalculator = dynamic(
  () => import('@/components/DcaCalculator').then(m => m.DcaCalculator),
  {
    loading: () => <DcaCalculatorSkeleton />,
    // NO ssr:false. This is the site's primary ranking content; with SSR disabled
    // Googlebot received the skeleton above and nothing else — no inputs, no
    // result cards, no explainer copy. The chart is what actually needs to stay
    // off the server (see the DcaChart import in DcaCalculator.tsx), not this.
  }
);

export function LazyDcaCalculator(props: DcaCalculatorProps) {
  return <DcaCalculator {...props} />;
}

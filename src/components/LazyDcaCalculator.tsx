'use client';

import dynamic from 'next/dynamic';
import { SkeletonCard } from '@/components/Skeleton';
import type { DcaCalculatorProps } from '@/components/DcaCalculator';

export function DcaCalculatorSkeleton() {
  return (
  <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 animate-pulse">
            <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
            {/* preset chip rows */}
            <div className="space-y-2 mb-5">
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-7 w-32 bg-slate-100 dark:bg-slate-800 rounded-full" />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-7 w-36 bg-slate-100 dark:bg-slate-800 rounded-full" />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
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

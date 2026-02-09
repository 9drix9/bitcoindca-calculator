'use client';

import dynamic from 'next/dynamic';
import { SkeletonCard } from '@/components/Skeleton';

const DcaCalculator = dynamic(
  () => import('@/components/DcaCalculator').then(m => m.DcaCalculator),
  {
    loading: () => (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 animate-pulse">
          <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    ),
    ssr: false,
  }
);

export function LazyDcaCalculator() {
  return <DcaCalculator />;
}

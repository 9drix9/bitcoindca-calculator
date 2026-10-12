'use client';

import { SkeletonCard } from '@/components/Skeleton';

const BAR = 'bg-slate-200 dark:bg-slate-700 rounded';
const BLOCK = 'bg-slate-100 dark:bg-slate-800';

/** A labelled field: the label's line, then the control, 44px where a finger does the pointing and 38px for a mouse. */
const FieldSkeleton = () => (
  <div className="space-y-1.5">
    <div className={`h-4 sm:h-[18px] w-20 ${BAR}`} />
    <div className={`h-[38px] max-sm:h-11 pointer-coarse:h-11 rounded-lg ${BLOCK}`} />
  </div>
);

/** A chip. The real ones are <button>s, so the 44px floor in globals.css governs them on phones and on any coarse pointer. */
const ChipSkeleton = ({ className }: { className: string }) => (
  <div className={`h-7 max-sm:h-11 pointer-coarse:h-11 rounded-full ${BLOCK} ${className}`} />
);

/**
 * The calculator's shape while the page's data is on the way.
 *
 * It stands in for the form, the headline card and the four figures, and each
 * piece is built from the same grid, spacing and control heights as the real
 * one, so the swap moves nothing: the chips wrap where the real chips wrap, and
 * the fields that phones fold away are left out below sm here too. When the
 * form's layout changes this has to change with it.
 */
export function DcaCalculatorSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8" aria-hidden="true">
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 animate-pulse">
        <div className={`h-7 w-32 mb-4 ${BAR}`} />
        {/* Scenario chips, at the widths of the real labels so they wrap alike.
            Phones show three and the "More scenarios" toggle. */}
        <div className="space-y-3 mb-5 sm:mb-6">
          <div>
            <div className={`h-4 w-28 mb-1.5 ${BAR}`} />
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <ChipSkeleton className="w-[198px] sm:w-[194px]" />
              <ChipSkeleton className="w-[140px] sm:w-[136px]" />
              <ChipSkeleton className="w-[148px] sm:w-[144px]" />
              <ChipSkeleton className="hidden sm:block w-[146px]" />
              <ChipSkeleton className="hidden sm:block w-[142px]" />
              <ChipSkeleton className="sm:hidden w-[130px]" />
            </div>
          </div>
          <div className="hidden sm:block">
            <div className={`h-4 w-40 mb-1.5 ${BAR}`} />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <ChipSkeleton key={i} className="w-[172px]" />
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {/* Amount, frequency, start date, end date. */}
          {Array.from({ length: 4 }).map((_, i) => (
            <FieldSkeleton key={i} />
          ))}
          {/* Phones: the "Fees and more" row. */}
          <div className={`col-span-2 sm:hidden h-14 rounded-lg ${BLOCK}`} />
          {/* sm and up: the fields that row folds away on phones. */}
          <div className="hidden sm:grid col-span-2 lg:col-span-4 grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            <FieldSkeleton />
            <FieldSkeleton />
            <div className="col-span-2">
              <div className={`h-4 w-64 max-w-full mb-2 ${BAR}`} />
              <div className={`h-4 w-28 mb-1 ${BAR}`} />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <ChipSkeleton key={i} className="w-[88px]" />
                ))}
              </div>
              {/* Two lines at lg, where this cell is half the row. */}
              <div className={`h-4 lg:h-8 w-80 max-w-full mt-1.5 ${BAR}`} />
            </div>
            <FieldSkeleton />
            {/* Price mode: the switch, the price source and its caption. */}
            <div className="space-y-3">
              <FieldSkeleton />
              <div>
                <div className={`h-4 w-20 mb-1 ${BAR}`} />
                <div className={`h-[38px] pointer-coarse:h-11 rounded-lg ${BLOCK}`} />
                <div className={`h-4 w-40 max-w-full mt-1 ${BAR}`} />
              </div>
            </div>
            <div className="col-span-2 lg:col-span-4 flex h-11 items-center">
              <div className={`h-4 w-56 ${BAR}`} />
            </div>
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div className={`h-6 w-32 rounded ${BLOCK}`} />
          <div className={`h-8 max-sm:h-11 pointer-coarse:h-11 w-20 rounded ${BLOCK}`} />
        </div>
      </div>
      {/* The headline card, the Units row, then the four figures. */}
      <div className="h-[206px] min-[375px]:h-[186px] sm:h-[237px] lg:h-[258px] rounded-2xl border border-[var(--hairline)] bg-white dark:bg-slate-900 shadow-[var(--elev-1)] animate-pulse" />
      <div className="h-7 max-sm:h-12 pointer-coarse:h-12" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    </div>
  );
}

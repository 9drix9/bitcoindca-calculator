import type { Frequency } from '@/types';

/**
 * The plan every surface opens on: $50 a week over the last 5 years, with a
 * 0.5% fee per buy.
 *
 * One definition, so the headline number above the fold can be reproduced by
 * the calculator directly below it: anything that describes or computes the
 * default plan (the calculator's initial state, the hero stat, /share and
 * /api/v1 fallbacks) reads it from here.
 *
 * No imports from utils on purpose: utils/dates derives the default window
 * from `yearsBack`, so this file has to stay a leaf.
 */
export const DEFAULT_PLAN: {
    /** Per purchase, in the display currency (USD when no currency is set). */
    readonly amount: number;
    readonly frequency: Frequency;
    /** The window is the last `yearsBack` years, ending today (UTC). */
    readonly yearsBack: number;
    /** Percentage fee taken out of every scheduled buy. */
    readonly feePercentage: number;
} = {
    amount: 50,
    frequency: 'weekly',
    yearsBack: 5,
    feePercentage: 0.5,
};

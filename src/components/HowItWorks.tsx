import { DollarSign, Calendar, TrendingUp } from 'lucide-react';

const STEPS = [
    {
        icon: DollarSign,
        title: 'Pick an amount',
        description: 'Whatever you’d put in each time. $10 a week counts.',
    },
    {
        icon: Calendar,
        title: 'Set your schedule',
        description: 'Daily, weekly, bi-weekly, or monthly, across any date range you pick',
    },
    {
        icon: TrendingUp,
        title: 'See your results',
        description: 'The Bitcoin you’d be holding today, and what it would be worth',
    },
];

/**
 * Three explanatory steps.
 *
 * On phones these used to be three stacked cards — roughly 420px of a 844px
 * viewport spent on instructions before the visitor reached the tool they came
 * for. Below `sm` they collapse to a single compact card with one row per step:
 * same information, about a third of the height. The full card treatment
 * returns at `sm` and up, where the three-across grid costs nothing.
 */
export const HowItWorks = () => (
    <section aria-label="How it works">
        {/* Mobile: one card, three tight rows */}
        <div className="sm:hidden rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <ol className="space-y-2.5">
                {STEPS.map((step, i) => (
                    <li key={step.title} className="flex items-start gap-3">
                        <span
                            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-slate-950"
                            aria-hidden="true"
                        >
                            {i + 1}
                        </span>
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">{step.title}</h3>
                            <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">
                                {step.description}
                            </p>
                        </div>
                    </li>
                ))}
            </ol>
        </div>

        {/* sm and up: the original three-across cards */}
        <div className="hidden sm:grid sm:grid-cols-3 gap-4 sm:gap-6">
            {STEPS.map((step, i) => (
                <div
                    key={step.title}
                    className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-3"
                >
                    <div className="mx-auto w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-sm font-bold text-amber-700 dark:text-amber-400 relative">
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[11px] font-bold flex items-center justify-center">
                            {i + 1}
                        </span>
                        <step.icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-white">
                        {step.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {step.description}
                    </p>
                </div>
            ))}
        </div>
    </section>
);

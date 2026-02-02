import { DollarSign, Calendar, TrendingUp } from 'lucide-react';

const STEPS = [
    {
        icon: DollarSign,
        title: 'Pick an amount',
        description: 'Choose how much you want to invest regularly — even $10/week works',
    },
    {
        icon: Calendar,
        title: 'Set your schedule',
        description: 'Pick how often (weekly, monthly) and a date range to simulate',
    },
    {
        icon: TrendingUp,
        title: 'See your results',
        description: 'Instantly see how much Bitcoin you\u2019d have accumulated and your returns',
    },
];

export const HowItWorks = () => (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {STEPS.map((step, i) => (
            <div
                key={step.title}
                className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-3"
            >
                <div className="mx-auto w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-sm font-bold text-amber-700 dark:text-amber-400 relative">
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center">
                        {i + 1}
                    </span>
                    <step.icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-white">
                    {step.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {step.description}
                </p>
            </div>
        ))}
    </section>
);

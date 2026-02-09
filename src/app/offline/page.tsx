import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Offline | Bitcoin DCA Calculator',
  description: 'You are currently offline.',
};

export default function OfflinePage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md space-y-6">
        <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto">
          <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center text-white text-lg font-bold">
            ₿
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            You&apos;re Offline
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
            It looks like you&apos;ve lost your internet connection. The page you
            requested isn&apos;t available offline yet. Reconnect and try again.
          </p>
        </div>

        <a
          href="."
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Try Again
        </a>
      </div>
    </div>
  );
}

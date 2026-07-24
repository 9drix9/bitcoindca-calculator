'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calculator, BookOpen, Shield, Pickaxe } from 'lucide-react';

const tabs = [
  { href: '/', label: 'Calculator', icon: Calculator },
  { href: '/why-bitcoin', label: 'Learn', icon: BookOpen },
  { href: '/self-custody', label: 'Self-Custody', icon: Shield },
  { href: '/mining', label: 'Mining', icon: Pickaxe },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] bottom-nav-safe-area"
    >
      {/* -mt-px lets each tab's 2px indicator overlay the nav's hairline border */}
      <div className="grid grid-cols-4 h-16 -mt-px">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors border-t-2 ${
                isActive
                  ? 'border-amber-500 text-amber-700 dark:text-amber-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.75} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

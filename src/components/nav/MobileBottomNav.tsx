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
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid grid-cols-4">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-14 text-[10px] font-medium transition-colors ${
                isActive
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

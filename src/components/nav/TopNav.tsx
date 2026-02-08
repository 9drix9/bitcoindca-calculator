'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';

const links = [
  { href: '/', label: 'Calculator' },
  { href: '/why-bitcoin', label: 'Learn' },
  { href: '/self-custody', label: 'Self-Custody' },
  { href: '/mining', label: 'Mining' },
  { href: '/features', label: 'Features' },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="hidden md:block border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <nav aria-label="Main navigation" className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div
              className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 group-hover:scale-105 transition-transform"
              aria-hidden="true"
            >
              ₿
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
              Bitcoin DCA
            </span>
          </Link>

          {links.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`text-sm transition-colors ${
                  isActive
                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}

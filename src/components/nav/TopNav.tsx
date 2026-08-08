'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoLockup } from '@/components/brand/Logo';

const links = [
  { href: '/', label: 'Calculator' },
  // /calculators and /dca were both orphaned: 105 scenario pages and the tool
  // hub had sitemap entries but no link path from anywhere on the site.
  { href: '/calculators', label: 'Calculators' },
  { href: '/dca', label: 'Scenarios' },
  { href: '/why-bitcoin', label: 'Learn' },
  { href: '/self-custody', label: 'Self-Custody' },
  { href: '/mining', label: 'Mining' },
  { href: '/about', label: 'About' },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="hidden md:block border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <nav aria-label="Main navigation" className="flex items-center gap-6">
          <Link href="/" className="group" aria-label="Bitcoin DCA Calculator — home">
            <LogoLockup />
          </Link>

          {links.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1 text-sm transition-colors ${
                  isActive
                    ? 'text-amber-700 dark:text-amber-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400'
                }`}
              >
                {label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-amber-500"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}

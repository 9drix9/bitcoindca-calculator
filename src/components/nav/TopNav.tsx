'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoLockup } from '@/components/brand/Logo';

// Labels here are for scanning a horizontal list, so they must be visually
// distinct at a glance — "Calculator" next to "Calculators" differed by one
// character and read as a duplicate. The hub keeps the name "Calculators"
// everywhere it identifies itself (page h1, breadcrumbs, BreadcrumbList JSON-LD,
// the footer's "All Calculators" link), which is also the anchor text that helps
// it rank; only the nav chip is shortened. Matches the mobile tab bar.
const links = [
  { href: '/', label: 'Calculator' },
  // /calculators and /dca were both orphaned: 105 scenario pages and the tool
  // hub had sitemap entries but no link path from anywhere on the site.
  { href: '/calculators', label: 'Tools' },
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
        {/* gap-4 below lg: at 768px (iPad portrait) gap-6 left 0px between the
            last link and the theme toggle, wrapped the wordmark to two lines,
            and broke "Self-Custody" at its hyphen. nowrap keeps every label on
            one line; the header only renders at md+, so no md: prefix needed. */}
        <nav aria-label="Main navigation" className="flex items-center gap-4 lg:gap-6">
          <Link href="/" className="group" aria-label="Bitcoin DCA Calculator, home">
            {/* textClassName replaces the default, so text-xl is restated. */}
            <LogoLockup textClassName="text-xl whitespace-nowrap" />
          </Link>

          {links.map(({ href, label }) => {
            // Prefix match on section roots, exact only for "/". Exact-matching
            // everything meant no nav item lit up on /calculators/bitcoin-fire or
            // /dca/100-per-week-since-2020 — the deepest pages on the site had no
            // "you are here". The mobile tab bar already worked this way.
            const isActive = href === '/'
              ? pathname === '/'
              : pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1 text-sm whitespace-nowrap transition-colors ${
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

'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TopNav } from './TopNav';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileMenuDrawer } from './MobileMenuDrawer';

export function ResponsiveNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <>
      {/* Desktop top nav */}
      <TopNav />

      {/* Mobile top bar */}
      <header className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="flex items-center gap-2 group">
            <div
              className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 group-hover:scale-105 transition-transform"
              aria-hidden="true"
            >
              ₿
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
              Bitcoin DCA
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-2 -m-1 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileMenuDrawer open={drawerOpen} onClose={closeDrawer} />

      {/* Mobile bottom tab bar */}
      <MobileBottomNav />
    </>
  );
}

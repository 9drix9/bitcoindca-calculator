'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TopNav } from './TopNav';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileMenuDrawer } from './MobileMenuDrawer';

export function ResponsiveNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* Desktop top nav */}
      <TopNav />

      {/* Mobile top bar */}
      <header className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="flex items-center gap-2 group">
            <div
              className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 group-hover:scale-105 transition-transform"
              aria-hidden="true"
            >
              ₿
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-700 dark:from-amber-500 dark:to-orange-600 bg-clip-text text-transparent">
              Bitcoin DCA
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              ref={menuButtonRef}
              onClick={() => setDrawerOpen(true)}
              className="p-2 -m-1 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-controls="mobile-menu-drawer"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileMenuDrawer open={drawerOpen} onClose={closeDrawer} triggerRef={menuButtonRef} />

      {/* Mobile bottom tab bar */}
      <MobileBottomNav />
    </>
  );
}

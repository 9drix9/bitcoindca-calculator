'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoLockup } from '@/components/brand/Logo';
import { TopNav } from './TopNav';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileMenuDrawer } from './MobileMenuDrawer';

export function ResponsiveNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // The /embed widget renders inside third-party iframes: no site chrome.
  // Exact match only — /embed-guide is a normal page and keeps its navigation.
  if (pathname === '/embed' || pathname?.startsWith('/embed/')) return null;

  return (
    <>
      {/* Desktop top nav */}
      <TopNav />

      {/* Mobile top bar — logo and theme only. The hamburger moved into the
          bottom bar's "More" tab so there is one menu instead of two competing
          ones, and so the primary controls sit in the thumb zone. */}
      <header className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md sticky top-0 z-50">
        {/* Horizontal insets keep the logo clear of the notch and rounded
            corners when a notched phone is held in landscape. */}
        <div className="flex items-center justify-between h-14 pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)]">
          <Link href="/" className="group" aria-label="Bitcoin DCA Calculator — home">
            <LogoLockup markClassName="w-6 h-6" textClassName="text-lg" />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileMenuDrawer open={drawerOpen} onClose={closeDrawer} triggerRef={menuButtonRef} />

      {/* Mobile bottom tab bar */}
      <MobileBottomNav onOpenMenu={openDrawer} menuOpen={drawerOpen} triggerRef={menuButtonRef} />
    </>
  );
}

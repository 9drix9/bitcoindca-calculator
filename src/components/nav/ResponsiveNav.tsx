'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoLockup } from '@/components/brand/Logo';
import { TopNav } from './TopNav';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileMenuDrawer } from './MobileMenuDrawer';
import { scrollToTopInstead } from './currentPageClick';
import { isEmbedPath } from './navPathname';
import { useNavPathname } from './useNavPathname';

export function ResponsiveNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  // Two buttons open the drawer (More in the tab bar, Menu in the header), and
  // only one of them is on screen at a time. Whichever was pressed is where
  // focus goes back to.
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const openDrawer = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    openerRef.current = e.currentTarget;
    setDrawerOpen(true);
  }, []);
  const pathname = useNavPathname();

  // The /embed widget renders inside third-party iframes: no site chrome.
  // Exact match only — /embed-guide is a normal page and keeps its navigation.
  if (isEmbedPath(pathname)) return null;

  return (
    <>
      {/* Desktop top nav */}
      <TopNav />

      {/* Mobile top bar: logo and theme toggle. The menu belongs to the bottom
          bar's "More" tab, so there is one menu and the primary controls sit in
          the thumb zone; the Menu button below stands in only while that bar
          is hidden. */}
      <header className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md sticky top-0 z-50">
        {/* Horizontal insets keep the logo clear of the notch and rounded
            corners when a notched phone is held in landscape. */}
        <div className="flex items-center justify-between h-14 pl-[max(env(safe-area-inset-left),1rem)] pr-[max(env(safe-area-inset-right),1rem)]">
          {/* min-h-11: the lockup is 28px tall in a 56px bar, and the link would
              otherwise be exactly that. The bar does not grow. */}
          <Link
            href="/"
            onClick={pathname === '/' ? scrollToTopInstead : undefined}
            className="group flex min-h-11 items-center"
            aria-label="Bitcoin DCA Calculator, home"
          >
            <LogoLockup markClassName="w-6 h-6" textClassName="text-lg" />
          </Link>
          <div className="flex items-center gap-1">
            {/* The tab bar is hidden where the screen is too short for it
                (globals.css: a phone held sideways, a desktop window zoomed to
                200%). This button is the way to the menu there, and only there:
                .nav-hidden-only shows it under the same media query. A plain
                button, not a second nav labelled "Main navigation": that label
                is a selector (see MobileBottomNav). */}
            <div className="nav-hidden-only">
              <button
                type="button"
                onClick={openDrawer}
                aria-label="Menu"
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                aria-controls="mobile-menu-drawer"
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <Menu size={22} aria-hidden="true" />
              </button>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileMenuDrawer open={drawerOpen} onClose={closeDrawer} triggerRef={openerRef} />

      {/* Mobile bottom tab bar */}
      <MobileBottomNav onOpenMenu={openDrawer} menuOpen={drawerOpen} />
    </>
  );
}

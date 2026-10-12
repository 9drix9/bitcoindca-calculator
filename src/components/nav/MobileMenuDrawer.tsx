'use client';

import { useCallback, useEffect, useRef } from 'react';
import Link, { useLinkStatus } from 'next/link';
import {
  X, Sparkles, FileText, Info, Github, Scale, CalendarDays, User, Mail,
  Shield, Pickaxe, Receipt, Grid3x3, FlaskConical, Code2, Loader2,
  type LucideIcon,
} from 'lucide-react';
import { primaryTabs } from './MobileBottomNav';
import { isPlainClick } from './navPathname';
import { useNavPathname } from './useNavPathname';

// This is the "More" overflow behind the bottom bar's last tab, so it does not
// repeat the four primary destinations (/, /calculators, /dca, /why-bitcoin)
// while the bar is on screen. Where the bar is hidden they are listed first:
// see the .nav-hidden-only group below.
// Self-Custody and Mining live here now that Learn is a single tab.
const drawerLinks = [
  { href: '/self-custody', label: 'Self-Custody', icon: Shield },
  { href: '/mining', label: 'Mining', icon: Pickaxe },
  { href: '/bitcoin-dca-tax', label: 'DCA & Taxes', icon: Receipt },
  { href: '/lump-sum-vs-dca', label: 'Lump Sum vs DCA', icon: Scale },
  { href: '/best-day-to-buy-bitcoin', label: 'Best Day to Buy', icon: CalendarDays },
  { href: '/dca/start-date-heatmap', label: 'Start-Date Heatmap', icon: Grid3x3 },
  { href: '/methodology', label: 'Methodology & Data', icon: FlaskConical },
  { href: '/features', label: 'Features', icon: Sparkles },
  { href: '/embed-guide', label: 'Embed the Widget', icon: Code2 },
  { href: '/about', label: 'About', icon: Info },
  { href: '/author', label: 'Who Built This', icon: User },
  { href: '/contact', label: 'Contact', icon: Mail },
  { href: '/privacy', label: 'Privacy Policy', icon: FileText },
  { href: '/terms', label: 'Terms of Service', icon: FileText },
] as const;

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled])';
const OPENER_SELECTOR = '[aria-controls="mobile-menu-drawer"]';

/**
 * Shows that a tap registered while the page it leads to is loading.
 *
 * Drawer links are not prefetched (see DrawerLink), so on a slow connection
 * the route is fetched on the tap and the drawer sits unchanged until it
 * arrives. Always rendered at a fixed size, so the row does not shift; the
 * delay keeps it out of sight on a fast one.
 */
function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <Loader2
      size={16}
      aria-hidden="true"
      className={`ml-auto shrink-0 transition-opacity delay-150 ${pending ? 'opacity-100 animate-spin' : 'opacity-0'}`}
    />
  );
}

function DrawerLink({
  href,
  label,
  icon: Icon,
  current,
  onClick,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 'page' for the page on screen, 'true' for the section it belongs to. */
  current?: 'page' | 'true';
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={href}
      // replace: see the history note in MobileMenuDrawer.
      replace
      // The closed drawer is translated off-screen, not display:none, which
      // parks its links 16px past the right edge, inside the 200px margin Next
      // prefetches within. Left to prefetch, every phone page view would fetch
      // every route listed here whether or not the menu was opened. A tap
      // fetches the route on demand; the four tab-bar links still prefetch.
      prefetch={false}
      onClick={onClick}
      aria-current={current}
      className={`flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        current
          ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <Icon size={18} aria-hidden="true" />
      {label}
      <LinkPending />
    </Link>
  );
}

interface MobileMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The button that opened the drawer — focus returns to it on close. */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function MobileMenuDrawer({ open, onClose, triggerRef }: MobileMenuDrawerProps) {
  const pathname = useNavPathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // Close on route change
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // The drawer and its overlay are `md:hidden`, but the body scroll lock is
  // not. Rotating a phone to landscape crosses the md breakpoint (390x844
  // becomes 844px wide), which would hide the drawer while leaving the body
  // pinned with no reachable close control — a stuck page. Close on crossing.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(min-width: 768px)');
    if (mq.matches) {
      onClose();
      return;
    }
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) onClose();
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [open, onClose]);

  // Android hardware/gesture back must close the drawer, not leave the site.
  // Opening pushes a throwaway history entry so `back` has something to pop;
  // popstate then closes the drawer instead of navigating away.
  //
  // CRITICAL: the entry must only be popped when the drawer closes WITHOUT a
  // navigation. Tapping a link in the drawer changes the route, which closes
  // the drawer via the route-change effect — and popping there would rewind the
  // navigation the user just made, dumping them back on the page they started
  // from. That made every link in this menu appear broken.
  //
  // So the cleanup compares the route now against the route when we opened, and
  // pops only if it is unchanged (tap outside, X, ESC).
  //
  // After a navigation there is nothing left to pop, because the drawer's links
  // navigate with `replace`: the new page overwrites the throwaway entry. Landing
  // on top of it would leave a second copy of the page the drawer was opened from
  // in history ([about, about, mining]), and Back from the new page would take
  // two presses, the first appearing to do nothing.
  const ownEntry = useRef(false);
  const pathAtOpen = useRef<string | null>(null);
  const livePath = useRef(pathname);

  // Kept current in an effect (not during render) so the cleanup below reads the
  // post-navigation route. React flushes this before the `open` effect's cleanup.
  useEffect(() => {
    livePath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    pathAtOpen.current = livePath.current;
    window.history.pushState({ drawer: true }, '');
    ownEntry.current = true;

    const onPop = () => {
      // The browser already popped our entry — do not pop again on cleanup.
      ownEntry.current = false;
      onClose();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      const navigated = livePath.current !== pathAtOpen.current;
      if (ownEntry.current && !navigated) {
        window.history.back();
      }
      ownEntry.current = false;
    };
  }, [open, onClose]);

  // iOS-safe body scroll lock: fix the body in place while open, restore
  // the scroll position on close (overflow:hidden alone does not stop
  // background touch scrolling in iOS Safari). The cleanup is the unlock, so
  // React also runs it if this component unmounts while open (e.g. navigating
  // to /embed, where ResponsiveNav renders nothing) — the body can never be
  // left pinned.
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    // Restoring the offset is only right when the close happens on the SAME
    // page. When a drawer link navigates, this cleanup runs after the route
    // change and was stamping the OLD page's scroll position onto the new one
    // — every drawer navigation landed mid-page instead of at the top.
    const lockedHref = window.location.pathname + window.location.hash;
    const { style } = document.body;
    const prev = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow,
    };
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';
    style.overflow = 'hidden';
    return () => {
      style.position = prev.position;
      style.top = prev.top;
      style.left = prev.left;
      style.right = prev.right;
      style.width = prev.width;
      style.overflow = prev.overflow;
      const sameSpot = window.location.pathname + window.location.hash === lockedHref;
      window.scrollTo(0, sameSpot ? scrollY : 0);
    };
  }, [open]);

  // Focus management: move focus into the dialog on open, return it to the
  // trigger button on close.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const first = drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      const opener = triggerRef?.current;
      opener?.focus();
      // A hidden button cannot take focus, and the opener is hidden if the
      // screen was turned while the drawer was open: the tab bar's More and
      // the header's Menu swap places. Use whichever is on screen now.
      if (document.activeElement !== opener) {
        Array.from(document.querySelectorAll<HTMLElement>(OPENER_SELECTOR))
          .find((el) => el.getClientRects().length > 0)
          ?.focus();
      }
    }
  }, [open, triggerRef]);

  // Real focus trap: Tab / Shift+Tab cycle within the dialog.
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const root = drawerRef.current;
    if (!root) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !root.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // Tapping the entry for the page you are already on is "never mind", not a
  // navigation: the route does not change, so the close-on-route-change effect
  // never fires. Close the drawer here, which also pops the throwaway history
  // entry. Modified clicks are left alone so "open in new tab" still works.
  const closeOnCurrentPage = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!isPlainClick(e)) return;
      e.preventDefault();
      onClose();
    },
    [onClose],
  );

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 transition-opacity duration-200 md:hidden ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer — inert while closed so its controls leave the tab order
          and the accessibility tree (React 19 supports inert as a boolean). */}
      <div
        ref={drawerRef}
        id="mobile-menu-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        onKeyDown={handleKeyDown}
        className={`fixed top-0 right-0 bottom-0 z-[70] w-64 overflow-y-auto overscroll-contain bg-white dark:bg-slate-900 shadow-xl transition-transform duration-200 ease-out md:hidden pr-[env(safe-area-inset-right)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <span className="font-semibold text-sm text-slate-800 dark:text-white">Menu</span>
          <button
            onClick={onClose}
            className="-my-2 -mr-2 h-11 w-11 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav
          aria-label="Menu navigation"
          className="p-4 pb-[max(env(safe-area-inset-bottom),1rem)] space-y-1"
        >
          {/* The tab bar's four destinations, only where the tab bar is hidden
              (globals.css shows .nav-hidden-only under the same media query).
              Lit by section, as in the bar; only an exact match is "the
              page", since a page inside Learn has its own entry below. */}
          <div className="nav-hidden-only space-y-1">
            {primaryTabs.map(({ href, label, icon, match }) => (
              <DrawerLink
                key={href}
                href={href}
                label={label}
                icon={icon}
                current={pathname === href ? 'page' : match(pathname) ? 'true' : undefined}
                onClick={pathname === href ? closeOnCurrentPage : undefined}
              />
            ))}
            <div className="border-t border-slate-200 dark:border-slate-800 my-3" />
          </div>

          {drawerLinks.map(({ href, label, icon }) => (
            <DrawerLink
              key={href}
              href={href}
              label={label}
              icon={icon}
              current={pathname === href ? 'page' : undefined}
              onClick={pathname === href ? closeOnCurrentPage : undefined}
            />
          ))}

          <div className="border-t border-slate-200 dark:border-slate-800 my-3" />

          <a
            href="https://github.com/9drix9/bitcoindca-calculator"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Github size={18} />
            GitHub
          </a>
        </nav>
      </div>
    </>
  );
}

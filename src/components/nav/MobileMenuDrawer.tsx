'use client';

import { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, Sparkles, FileText, Info, Github } from 'lucide-react';

const drawerLinks = [
  { href: '/features', label: 'Features', icon: Sparkles },
  { href: '/about', label: 'About', icon: Info },
  { href: '/privacy', label: 'Privacy Policy', icon: FileText },
  { href: '/terms', label: 'Terms of Service', icon: FileText },
] as const;

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled])';

interface MobileMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The button that opened the drawer — focus returns to it on close. */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function MobileMenuDrawer({ open, onClose, triggerRef }: MobileMenuDrawerProps) {
  const pathname = usePathname();
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

  // iOS-safe body scroll lock: fix the body in place while open, restore
  // the scroll position on close (overflow:hidden alone does not stop
  // background touch scrolling in iOS Safari).
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
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
      window.scrollTo(0, scrollY);
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
      triggerRef?.current?.focus();
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
        className={`fixed top-0 right-0 bottom-0 z-[70] w-64 bg-white dark:bg-slate-900 shadow-xl transition-transform duration-200 ease-out md:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <span className="font-semibold text-sm text-slate-800 dark:text-white">Menu</span>
          <button
            onClick={onClose}
            className="p-2 -m-2 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav aria-label="Menu navigation" className="p-4 space-y-1">
          {drawerLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}

          <div className="border-t border-slate-200 dark:border-slate-800 my-3" />

          <a
            href="https://github.com/9drix9/bitcoindca-calculator"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Github size={18} />
            GitHub
          </a>
        </nav>
      </div>
    </>
  );
}

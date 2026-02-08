'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, Sparkles, FileText, Github } from 'lucide-react';

const drawerLinks = [
  { href: '/features', label: 'Features', icon: Sparkles },
  { href: '/privacy', label: 'Privacy Policy', icon: FileText },
  { href: '/terms', label: 'Terms of Service', icon: FileText },
] as const;

interface MobileMenuDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileMenuDrawer({ open, onClose }: MobileMenuDrawerProps) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);

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

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Focus trap: focus close button when drawer opens
  useEffect(() => {
    if (open && drawerRef.current) {
      const closeBtn = drawerRef.current.querySelector('button');
      closeBtn?.focus();
    }
  }, [open]);

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

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
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

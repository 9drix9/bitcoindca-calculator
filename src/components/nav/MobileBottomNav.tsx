'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calculator, LayoutGrid, TrendingUp, BookOpen, Menu } from 'lucide-react';
import clsx from 'clsx';
import { useKeyboardOpen } from '@/hooks/useKeyboardOpen';

/**
 * The site's single mobile navigation.
 *
 * Previously there were two competing systems: this bar (4 hardcoded content
 * pages) and a hamburger drawer in the top bar (10 different links). A visitor
 * had two menus that disagreed about what the site contained, and neither
 * listed the calculator hub or the scenario cluster.
 *
 * Now the bar is primary and its last item opens the drawer — the standard
 * iOS "More" tab / Android bottom-navigation overflow pattern. The top bar keeps
 * only the logo and theme toggle, which gives back a row of vertical space on
 * small screens and puts every primary destination in the thumb zone.
 */
const tabs = [
    { href: '/', label: 'Calculate', icon: Calculator, match: (p: string) => p === '/' },
    { href: '/calculators', label: 'Tools', icon: LayoutGrid, match: (p: string) => p.startsWith('/calculators') },
    // Prefix match so /dca/100-per-week-since-2020 keeps the tab lit.
    { href: '/dca', label: 'Scenarios', icon: TrendingUp, match: (p: string) => p.startsWith('/dca') },
    {
        href: '/why-bitcoin',
        label: 'Learn',
        icon: BookOpen,
        match: (p: string) =>
            p.startsWith('/why-bitcoin') ||
            p.startsWith('/self-custody') ||
            p.startsWith('/mining') ||
            p.startsWith('/bitcoin-dca-tax'),
    },
] as const;

export function MobileBottomNav({
    onOpenMenu,
    menuOpen,
    triggerRef,
}: {
    onOpenMenu: () => void;
    menuOpen: boolean;
    /** So the drawer can return focus here when it closes. */
    triggerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
    const pathname = usePathname() ?? '/';
    const keyboardOpen = useKeyboardOpen();

    // While the keyboard is up the bar is useless and actively harmful: on
    // browsers that do not resize the layout viewport it detaches from the
    // bottom edge and hovers over the content with a gap under it. Hiding it
    // also gives the field being typed into a whole extra row of screen.
    if (keyboardOpen) return null;

    return (
        <nav
            aria-label="Main navigation"
            className="bottom-nav-fill fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] bottom-nav-safe-area"
        >
            {/* -mt-px lets each tab's 2px indicator overlay the nav's hairline border */}
            <div className="grid grid-cols-5 h-16 -mt-px">
                {tabs.map(({ href, label, icon: Icon, match }) => {
                    const isActive = !menuOpen && match(pathname);
                    return (
                        <Link
                            key={href}
                            href={href}
                            aria-current={isActive ? 'page' : undefined}
                            className={clsx(
                                'flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors border-t-2',
                                isActive
                                    ? 'border-amber-500 text-amber-700 dark:text-amber-400'
                                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
                            )}
                        >
                            <Icon size={21} strokeWidth={isActive ? 2.5 : 1.75} aria-hidden="true" />
                            <span>{label}</span>
                        </Link>
                    );
                })}

                <button
                    ref={triggerRef}
                    type="button"
                    onClick={onOpenMenu}
                    aria-haspopup="dialog"
                    aria-expanded={menuOpen}
                    aria-controls="mobile-menu-drawer"
                    className={clsx(
                        'flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors border-t-2',
                        menuOpen
                            ? 'border-amber-500 text-amber-700 dark:text-amber-400'
                            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
                    )}
                >
                    <Menu size={21} strokeWidth={menuOpen ? 2.5 : 1.75} aria-hidden="true" />
                    <span>More</span>
                </button>
            </div>
        </nav>
    );
}

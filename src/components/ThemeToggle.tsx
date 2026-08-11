'use client';

import { useEffect, useState, useSyncExternalStore, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'theme-preference';

function getStoredTheme(): Theme {
    if (typeof window === 'undefined') return 'system';
    const stored = localStorage.getItem(THEME_KEY);
    if (stored && ['light', 'dark', 'system'].includes(stored)) return stored as Theme;
    return 'system';
}

function applyTheme(theme: Theme) {
    const root = document.documentElement;
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
}

let listeners: Array<() => void> = [];
function subscribe(callback: () => void) {
    listeners.push(callback);
    return () => { listeners = listeners.filter(l => l !== callback); };
}
function getSnapshot(): Theme {
    return getStoredTheme();
}

export const ThemeToggle = () => {
    const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'system' as Theme);
    // Resolved theme, tracked post-mount so SSR/hydration stays consistent.
    // null = unknown (before mount) -> generic label.
    const [isDark, setIsDark] = useState<boolean | null>(null);

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    useEffect(() => {
        if (theme === 'system') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = () => applyTheme('system');
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }
    }, [theme]);

    // Mirror the resolved theme from the <html> class so the accessible
    // label/state always match what the user actually sees (covers toggle
    // clicks, system-preference changes, and other tabs).
    useEffect(() => {
        const root = document.documentElement;
        const update = () => setIsDark(root.classList.contains('dark'));
        update();
        const observer = new MutationObserver(update);
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    const toggle = useCallback(() => {
        const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, next);
        listeners.forEach(l => l());
    }, []);

    const label = isDark === null
        ? 'Toggle theme'
        : isDark
            ? 'Switch to light theme'
            : 'Switch to dark theme';

    // CSS-driven icon swap avoids hydration mismatch — the theme script
    // adds .dark before React hydrates, so the correct icon shows instantly.
    return (
        // No aria-pressed: the accessible name describes the action ("Switch
        // to…"), and the ARIA button pattern forbids combining a changing
        // action label with a pressed state — "pressed" of what is ambiguous.
        <button
            onClick={toggle}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 active:bg-slate-300 dark:active:bg-white/15 transition-colors"
            title={label}
            aria-label={label}
        >
            <Sun className="w-5 h-5 text-amber-400 hidden dark:block" />
            <Moon className="w-5 h-5 text-slate-600 block dark:hidden" />
        </button>
    );
};

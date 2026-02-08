'use client';

import { useEffect, useSyncExternalStore, useCallback } from 'react';
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

    const toggle = useCallback(() => {
        const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, next);
        listeners.forEach(l => l());
    }, []);

    // CSS-driven icon swap avoids hydration mismatch — the theme script
    // adds .dark before React hydrates, so the correct icon shows instantly.
    return (
        <button
            onClick={toggle}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 active:bg-slate-300 dark:active:bg-white/15 transition-colors"
            title="Toggle theme"
            aria-label="Toggle theme"
        >
            <Sun className="w-5 h-5 text-amber-400 hidden dark:block" />
            <Moon className="w-5 h-5 text-slate-600 block dark:hidden" />
        </button>
    );
};

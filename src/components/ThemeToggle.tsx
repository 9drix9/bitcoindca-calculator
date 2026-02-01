'use client';

import { useEffect, useSyncExternalStore, useCallback } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

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

    const cycle = useCallback(() => {
        const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
        localStorage.setItem(THEME_KEY, next);
        listeners.forEach(l => l());
    }, [theme]);

    const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
    const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';

    return (
        <button
            onClick={cycle}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={`Theme: ${label}`}
            aria-label={`Current theme: ${label}. Click to switch.`}
        >
            <Icon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>
    );
};

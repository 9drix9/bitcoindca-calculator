'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Download, X, Share } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';

// Stores the dismissal timestamp (ms). Legacy value '1' parses as an
// expired timestamp, so previously-permanent dismissals become re-offerable.
const DISMISS_KEY = 'pwa-install-dismissed';
const VISIT_KEY = 'pwa-visit-count';
const CONSENT_KEY = 'cookie-consent';
const REOFFER_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // re-offer 30 days after dismissal
const ENGAGEMENT_DELAY_MS = 45_000; // 45s after the user's first interaction

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return true; // unparseable -> stay dismissed
    return Date.now() - ts < REOFFER_AFTER_MS;
  } catch {
    return true;
  }
}

/** The cookie banner is gone once a consent with a boolean analytics flag is stored. */
function isConsentResolved(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    const consent = JSON.parse(raw) as { analytics?: unknown };
    return typeof consent.analytics === 'boolean';
  } catch {
    return false;
  }
}

// Environment facts, evaluated once per page load (cached for a stable
// useSyncExternalStore snapshot; the cache also makes the sessionStorage
// visit-count increment run exactly once, StrictMode included).
interface InstallEnv {
  blocked: boolean; // dismissed recently, already installed, or storage unavailable
  iosSafari: boolean;
  returningVisit: boolean; // 2nd+ pageview this session
}

const SERVER_ENV: InstallEnv = { blocked: true, iosSafari: false, returningVisit: false };
let envCache: InstallEnv | null = null;

function getInstallEnv(): InstallEnv {
  if (envCache) return envCache;

  let blocked: boolean;
  try {
    blocked =
      isDismissedRecently() ||
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as unknown as { standalone?: boolean }).standalone);
  } catch {
    blocked = true;
  }

  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);

  let returningVisit = false;
  try {
    const visits = (parseInt(sessionStorage.getItem(VISIT_KEY) ?? '0', 10) || 0) + 1;
    sessionStorage.setItem(VISIT_KEY, String(visits));
    returningVisit = visits >= 2;
  } catch {}

  envCache = { blocked, iosSafari: isIos && isSafari, returningVisit };
  return envCache;
}

function subscribeNoop() {
  return () => {};
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function PwaInstallPrompt() {
  const env = useSyncExternalStore(subscribeNoop, getInstallEnv, () => SERVER_ENV);
  // Never stack on top of the cookie consent banner: wait until consent is
  // stored (CookieConsent dispatches a 'storage' event when it saves).
  const consentResolved = useSyncExternalStore(subscribeToStorage, isConsentResolved, () => false);

  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [engagedByTimer, setEngagedByTimer] = useState(false);

  // Android / Desktop Chrome: capture beforeinstallprompt
  useEffect(() => {
    if (env.blocked) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [env]);

  // Engagement gate: a returning (second) pageview qualifies immediately;
  // otherwise arm a 45s timer on the user's first interaction.
  useEffect(() => {
    if (env.blocked || env.returningVisit) return;
    let timer: number | undefined;
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll'];
    const onFirstInteraction = () => {
      events.forEach((t) => window.removeEventListener(t, onFirstInteraction));
      timer = window.setTimeout(() => setEngagedByTimer(true), ENGAGEMENT_DELAY_MS);
    };
    events.forEach((t) => window.addEventListener(t, onFirstInteraction, { passive: true }));
    return () => {
      events.forEach((t) => window.removeEventListener(t, onFirstInteraction));
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [env]);

  const rememberDismissal = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDismissed(true);
      rememberDismissal();
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
    rememberDismissal();
  }, []);

  const engaged = env.returningVisit || engagedByTimer;

  // Nothing to show
  if (
    env.blocked ||
    dismissed ||
    !engaged ||
    !consentResolved ||
    (!deferredPrompt && !env.iosSafari)
  ) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Install app"
      className="fixed left-0 right-0 z-40 p-3 sm:p-4 pl-[max(env(safe-area-inset-left),0.75rem)] pr-[max(env(safe-area-inset-right),0.75rem)] sm:pl-[max(env(safe-area-inset-left),1rem)] sm:pr-[max(env(safe-area-inset-right),1rem)] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] bottom-[calc(var(--bottom-nav-h)_+_max(env(safe-area-inset-bottom),12px))] md:bottom-0 md:pb-[max(env(safe-area-inset-bottom),1rem)]"
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 dark:bg-slate-800 flex items-center justify-center shrink-0">
            <Logo className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            {deferredPrompt ? (
              <>
                <p className="text-sm font-medium text-slate-800 dark:text-white">
                  Install Bitcoin DCA Calculator
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {/* beforeinstallprompt also fires on desktop Chromium, so
                      keep this line platform-neutral. */}
                  Quick access from your home screen or dock
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-800 dark:text-white">
                  Add to Home Screen
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tap <Share size={12} className="inline -mt-0.5" aria-hidden="true" /> then &quot;Add to Home Screen&quot;
                </p>
              </>
            )}
          </div>
          {/* h-11/w-11, not min-h-[44px]: globals.css sets an unlayered
              `button { min-height: 36px }` under 640px that outranks
              Tailwind's layered min-h-* utilities. */}
          <div className="flex items-center gap-2 shrink-0">
            {deferredPrompt && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 h-11 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
              >
                <Download size={14} />
                Install
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
              aria-label="Dismiss install prompt"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

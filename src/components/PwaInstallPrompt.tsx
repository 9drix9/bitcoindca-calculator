'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { Download, X, Share } from 'lucide-react';
import clsx from 'clsx';
import { Logo } from '@/components/brand/Logo';
import { isEmbedPath } from '@/components/nav/navPathname';
import { useBottomNavGone } from '@/hooks/useBottomNavGone';
import { useBottomOverlayHeight } from '@/hooks/useBottomOverlayHeight';
import { useConsentStatus } from '@/hooks/useConsent';
import { readStorage, storageAvailable, writeStorage } from '@/hooks/safeStorage';

// Stores the dismissal timestamp (ms). Legacy value '1' parses as an
// expired timestamp, so previously-permanent dismissals become re-offerable.
const DISMISS_KEY = 'pwa-install-dismissed';
const VISIT_KEY = 'pwa-visit-count';
const REOFFER_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // re-offer 30 days after dismissal
const ENGAGEMENT_DELAY_MS = 45_000; // 45s after the user's first interaction

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isDismissedRecently(): boolean {
  // No storage means a dismissal could never be remembered, and the prompt
  // would come back on every page. Treat it as dismissed.
  if (!storageAvailable('local')) return true;
  const raw = readStorage('local', DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return true; // unparseable -> stay dismissed
  return Date.now() - ts < REOFFER_AFTER_MS;
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

  // Never inside the embeddable widget. It runs in someone else's page, where
  // there is nothing to install, and the visit counter below has no business
  // being written into a publisher's reader's browser.
  if (isEmbedPath(window.location.pathname)) {
    envCache = SERVER_ENV;
    return envCache;
  }

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

  // If the count cannot be stored, every pageview reads as the first: the 45s
  // engagement timer below still qualifies the visitor.
  const visits = (parseInt(readStorage('session', VISIT_KEY) ?? '0', 10) || 0) + 1;
  const returningVisit = writeStorage('session', VISIT_KEY, String(visits)) && visits >= 2;

  envCache = { blocked, iosSafari: isIos && isSafari, returningVisit };
  return envCache;
}

function subscribeNoop() {
  return () => {};
}

export function PwaInstallPrompt() {
  const env = useSyncExternalStore(subscribeNoop, getInstallEnv, () => SERVER_ENV);
  // Never stack on top of the cookie consent banner: wait until the visitor has
  // answered it. Same store the banner reads, so the two cannot disagree.
  const consentResolved = useConsentStatus() === 'resolved';
  // The prompt sits above the tab bar with a 76px offset. When the bar is not
  // there (unmounted for the keyboard, or hidden in phone landscape) that offset
  // would leave it hovering mid-screen with the page showing underneath.
  const bottomNavGone = useBottomNavGone();
  const promptRef = useRef<HTMLDivElement>(null);

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
    writeStorage('local', DISMISS_KEY, String(Date.now()));
  };

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // Either answer ends the offer. A "no" in the browser's own dialog is a
    // dismissal like the X: the browser fires beforeinstallprompt again as soon
    // as the choice resolves, and without this the bar would be straight back.
    setDismissed(true);
    setDeferredPrompt(null);
    rememberDismissal();
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
    rememberDismissal();
  }, []);

  const engaged = env.returningVisit || engagedByTimer;

  const shown =
    !env.blocked &&
    !dismissed &&
    engaged &&
    consentResolved &&
    (deferredPrompt !== null || env.iosSafari);

  // Like the cookie banner, this covers a strip of the page until dismissed, so
  // the page has to scroll around it.
  useBottomOverlayHeight(promptRef, shown);

  if (!shown) return null;

  return (
    <div
      ref={promptRef}
      role="dialog"
      aria-label="Install app"
      // globals.css takes this off screen while a field is being typed into on
      // a short viewport, and DockedResult stays away while anything carrying
      // the attribute is showing.
      data-bottom-overlay
      className={clsx(
        'fixed left-0 right-0 z-40 p-3 sm:p-4 pl-[max(env(safe-area-inset-left),0.75rem)] pr-[max(env(safe-area-inset-right),0.75rem)] sm:pl-[max(env(safe-area-inset-left),1rem)] sm:pr-[max(env(safe-area-inset-right),1rem)] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]',
        // Same two positions as the cookie banner. The sm:pb is needed: sm:p-4
        // above would otherwise override the safe-area padding from 640px up,
        // which is exactly the landscape-phone band where the bar is hidden.
        bottomNavGone
          ? 'bottom-0 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:pb-[max(env(safe-area-inset-bottom),1rem)]'
          : 'bottom-[calc(var(--bottom-nav-h)_+_max(env(safe-area-inset-bottom),12px))] md:bottom-0 md:pb-[max(env(safe-area-inset-bottom),1rem)]',
      )}
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
                  Tap <Share size={12} className="inline -mt-0.5" aria-hidden="true" />
                  <span className="sr-only">the Share button</span> then &quot;Add to Home Screen&quot;
                </p>
              </>
            )}
          </div>
          {/* h-11/w-11 at every width: the globals.css button floor is for
              narrow screens and coarse pointers, and this bar also shows on a
              desktop. */}
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

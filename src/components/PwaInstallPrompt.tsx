'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, X, Share } from 'lucide-react';

const DISMISS_KEY = 'pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosPrompt, setShowIosPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Check if already dismissed
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }

    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((navigator as unknown as { standalone?: boolean }).standalone) return;

    setDismissed(false);

    // Android / Desktop Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari detection
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
    if (isIos && isSafari) {
      setShowIosPrompt(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDismissed(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosPrompt(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  }, []);

  // Nothing to show
  if (dismissed || (!deferredPrompt && !showIosPrompt)) return null;

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">
            ₿
          </div>
          <div className="flex-1 min-w-0">
            {deferredPrompt ? (
              <>
                <p className="text-sm font-medium text-slate-800 dark:text-white">
                  Install Bitcoin DCA Calculator
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Add to your home screen for quick access
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-800 dark:text-white">
                  Add to Home Screen
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tap <Share size={12} className="inline -mt-0.5" /> then &quot;Add to Home Screen&quot;
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {deferredPrompt && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
              >
                <Download size={14} />
                Install
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
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

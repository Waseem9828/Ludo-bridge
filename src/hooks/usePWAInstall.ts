import { useEffect, useState } from 'react';
import { getPWAInstallMode, isIOSUserAgent, isStandaloneDisplayMode } from '../utils/pwa';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standalone = isStandaloneDisplayMode({
      matchMediaStandalone: window.matchMedia('(display-mode: standalone)').matches,
      navigatorStandalone: (window.navigator as unknown as { standalone?: boolean }).standalone,
    });
    setIsInstalled(standalone);
    setIsIOS(isIOSUserAgent(window.navigator.userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  const mode = getPWAInstallMode({
    isInstalled,
    hasDeferredPrompt: Boolean(deferredPrompt),
    isIOS,
  });

  return {
    mode,
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

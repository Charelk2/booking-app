'use client';

import { useEffect, useMemo } from 'react';
import api from '@/lib/api';

declare global {
  interface Window { google?: any }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const TRUSTED_DEVICE_KEY = 'booka.trusted_device_id';

type Props = {
  next?: string;
  enabled?: boolean;
};

export default function GoogleOneTap({ next, enabled = true }: Props) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const nextPath = useMemo(() => {
    if (typeof window === 'undefined') return next || '/dashboard';
    return next || window.location.pathname + window.location.search || '/dashboard';
  }, [next]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const loadGsi = () => new Promise<void>((resolve, reject) => {
      if (document.getElementById('gsi-script')) return resolve();
      const s = document.createElement('script');
      s.id = 'gsi-script';
      s.src = GSI_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load Google script'));
      document.head.appendChild(s);
    });

    const handleGsiCredential = async (response: { credential?: string }) => {
      try {
        if (!response?.credential) return;
        let did = '';
        try {
          did = localStorage.getItem(TRUSTED_DEVICE_KEY) || '';
          if (!did) {
            const id = crypto.getRandomValues(new Uint32Array(4)).join('-');
            localStorage.setItem(TRUSTED_DEVICE_KEY, id);
            did = id;
          }
        } catch {}
        await api.post('/auth/google/onetap', { credential: response.credential, next: nextPath, deviceId: did });
        // Let the app react to cookie session
        if (typeof window !== 'undefined') window.location.replace(nextPath);
      } catch (e) {
        // Silent fail; One Tap should be non-blocking
        // eslint-disable-next-line no-console
        console.warn('One Tap sign-in failed', e);
      }
    };

    const init = async () => {
      try {
        if (!clientId) return;
        // Suppress when already logged in (cookie session + cached user)
        try {
          if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('user') || sessionStorage.getItem('user');
            if (stored) return; // user already signed in
          }
        } catch {}
        await loadGsi();
        if (cancelled || !window.google?.accounts?.id) return;

        const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
        const isLocal = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
        const envPref = (process.env.NEXT_PUBLIC_GSI_USE_FEDCM || '').toLowerCase();
        const envAllowsFedCM = !['0','false','no','off'].includes(envPref);
        const fedcmPreferred = isSecure && !isLocal && envAllowsFedCM;

        const initAndPrompt = (useFed: boolean) => {
          window.google!.accounts.id.initialize({
            client_id: clientId,
            callback: handleGsiCredential,
            auto_select: true,
            cancel_on_tap_outside: false,
            use_fedcm_for_prompt: useFed,
            context: 'signin',
            itp_support: true,
          });
          window.google!.accounts.id.prompt((notification: any) => {
            try {
              const displayed = notification.isDisplayed?.();
              const skipped = notification.isSkippedMoment?.();
              const dismissed = notification.isDismissedMoment?.();
              if (useFed && (!displayed || skipped || dismissed)) {
                window.google!.accounts.id.cancel();
                initAndPrompt(false);
              }
            } catch {}
          });
        };

        initAndPrompt(fedcmPreferred);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('GSI init failed', e);
      }
    };

    void init();
    return () => {
      cancelled = true;
      try {
        window.google?.accounts.id.cancel();
        window.google?.accounts.id.disableAutoSelect();
      } catch {}
    };
  }, [clientId, nextPath, enabled]);

  return null;
}

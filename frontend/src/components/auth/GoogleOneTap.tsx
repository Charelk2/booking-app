'use client';

import { useMemo, useCallback } from 'react';
import api, { getCurrentUser } from '@/lib/api';
import { useGoogleOneTap } from '@/hooks/useGoogleOneTap';

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

  const handleGsiCredential = useCallback(async (response: { credential?: string }) => {
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
      // Fill user cache eagerly so the app sees the session before navigation
      try {
        const me = await getCurrentUser();
        const user = me.data;
        try { localStorage.setItem('user', JSON.stringify(user)); } catch {}
      } catch {}
      if (typeof window !== 'undefined') window.location.replace(nextPath);
    } catch (e) {
      // Silent fail; One Tap should be non-blocking
      // eslint-disable-next-line no-console
      console.warn('One Tap sign-in failed', e);
    }
  }, [nextPath]);

  // Enable only when:
  // - prop enabled is true
  // - client id present
  // - no existing stored user
  const allowOneTap = useMemo(() => {
    if (!enabled) return false;
    if (!clientId) return false;
    try {
      const stored = typeof window !== 'undefined' && (localStorage.getItem('user') || sessionStorage.getItem('user'));
      if (stored) return false;
    } catch {}
    return true;
  }, [enabled, clientId]);

  // FedCM preference mirrors previous logic: only on HTTPS, not localhost, env allows
  const useFedCm = useMemo(() => {
    try {
      const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const isLocal = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
      const envPref = (process.env.NEXT_PUBLIC_GSI_USE_FEDCM || '').toLowerCase();
      const envAllows = !['0', 'false', 'no', 'off'].includes(envPref);
      return isSecure && !isLocal && envAllows;
    } catch {
      return true;
    }
  }, []);

  useGoogleOneTap({ clientId: allowOneTap ? clientId : undefined, onCredential: handleGsiCredential, context: 'signin', useFedCm });

  return null;
}

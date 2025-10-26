import { useEffect, useRef } from 'react';
import { loadScriptOnce } from '@/lib/loadScriptOnce';

type GsiIdApi = {
  initialize: (opts: Record<string, unknown>) => void;
  prompt: (...args: unknown[]) => void;
  cancel: () => void;
  disableAutoSelect: () => void;
};

const GSI_SRC = 'https://accounts.google.com/gsi/client';

type FallbackMode = 'never' | 'whenNotDisplayed' | 'always';

type Options = {
  clientId?: string;
  onCredential: (payload: { credential?: string }) => void;
  context?: 'signin' | 'signup';
  useFedCm?: boolean;
  fallbackMode?: FallbackMode; // default: 'whenNotDisplayed'
};

export function useGoogleOneTap({ clientId, onCredential, context = 'signin', useFedCm = true, fallbackMode = 'whenNotDisplayed' }: Options) {
  const idApiRef = useRef<GsiIdApi | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    let fallbackAttempted = false;

    const run = async () => {
      await loadScriptOnce('gsi-script', GSI_SRC);
      if (cancelled) return;
      const idApi = window.google?.accounts?.id as GsiIdApi | undefined;
      if (!idApi) return;
      idApiRef.current = idApi;

      const initAndPrompt = (withFed: boolean) => {
        if (cancelled) return;
        idApi.initialize({
          client_id: clientId,
          callback: onCredential,
          auto_select: true,
          cancel_on_tap_outside: false,
          use_fedcm_for_prompt: withFed,
          context,
        });
        idApi.prompt((notification: any) => {
          try {
            if (!withFed) return; // No fallback chain from classic
            if (fallbackMode === 'never' || fallbackAttempted) return;
            const displayed = notification?.isDisplayed?.();
            const skipped = notification?.isSkippedMoment?.();
            const dismissed = notification?.isDismissedMoment?.();
            // Respect explicit dismissals; do not retry
            if (dismissed) return;
            const shouldFallback =
              fallbackMode === 'always' ||
              (fallbackMode === 'whenNotDisplayed' && (displayed === false || !!skipped));
            if (shouldFallback) {
              fallbackAttempted = true;
              try { idApi.cancel(); } catch {}
              // Re-init promptly without FedCM; run on next tick to avoid race
              setTimeout(() => {
                if (!cancelled) initAndPrompt(false);
              }, 0);
            }
          } catch {}
        });
      };

      initAndPrompt(!!useFedCm);
    };

    void run();
    return () => {
      cancelled = true;
      try {
        idApiRef.current?.cancel();
        idApiRef.current?.disableAutoSelect();
      } catch {}
      idApiRef.current = null;
    };
  }, [clientId, onCredential, context, useFedCm]);
}

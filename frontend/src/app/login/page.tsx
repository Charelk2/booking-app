'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import AuthInput from '@/components/auth/AuthInput';
import { useAuth } from '@/contexts/AuthContext';
import api, {
  requestMagicLink,
  webauthnGetAuthenticationOptions,
  webauthnVerifyAuthentication,
} from '@/lib/api';

type PwForm = { email: string; password: string; remember: boolean };
type MfaForm = { code: string; trustedDevice?: boolean };
type MagicForm = { email: string };

declare global {
  interface Window {
    google?: any;
    AppleID?: any;
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_SRC = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
const TRUSTED_DEVICE_KEY = 'booka.trusted_device_id';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const nextPath = useMemo(() => next, [next]);

  const { login, verifyMfa, user, refreshUser } = useAuth();

  // UI / state
  const [error, setError] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [autoTrying, setAutoTrying] = useState(true);
  const [magicSent, setMagicSent] = useState(false);

  // Google button + Apple button readiness (to hide fallbacks)
  const [googleButtonReady, setGoogleButtonReady] = useState(false);
  const [appleButtonReady, setAppleButtonReady] = useState(false);

  // Refs to button containers for responsive rendering
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const appleBtnRef = useRef<HTMLDivElement | null>(null);

  // “Trust this device” id for MFA skip
  const [trustedDeviceId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const existing = localStorage.getItem(TRUSTED_DEVICE_KEY);
    if (existing) return existing;
    const id = window.crypto.getRandomValues(new Uint32Array(4)).join('-');
    localStorage.setItem(TRUSTED_DEVICE_KEY, id);
    return id;
  });

  const liveRef = useRef<HTMLParagraphElement | null>(null);
  const announce = (msg: string) => { if (liveRef.current) liveRef.current.textContent = msg; };

  // Redirect if already signed in
  useEffect(() => {
    if (user) {
      const target = next || (user.user_type === 'service_provider' ? '/dashboard' : '/');
      router.replace(target);
    }
  }, [user, next, router]);

  // Forms
  const { register: regPw, handleSubmit: submitPw, formState: { isSubmitting: pwSubmitting, errors: pwErrors } } =
    useForm<PwForm>({ defaultValues: { email: '', remember: true } });

  const { register: regMfa, handleSubmit: submitMfa, formState: { isSubmitting: mfaSubmitting } } =
    useForm<MfaForm>({ defaultValues: { trustedDevice: true } });

  const { register: regMagic, handleSubmit: submitMagic, formState: { isSubmitting: magicSubmitting, errors: magicErrors } } =
    useForm<MagicForm>({ defaultValues: { email: '' } });

  // Helpers for WebAuthn (passkeys)
  const b64ToBuf = (s: string) => {
    let base64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  };
  const bufToB64 = (buf: ArrayBuffer) => {
    const bin = String.fromCharCode(...new Uint8Array(buf));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'');
  };

  // -------- Google Identity Services: One Tap + Official Button (responsive) --------
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const loadScript = (id: string, src: string) =>
    new Promise<void>((resolve, reject) => {
      if (document.getElementById(id)) return resolve();
      const s = document.createElement('script');
      s.id = id;
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });

  const handleGsiCredential = async (response: { credential?: string }) => {
    try {
      if (!response?.credential) return;
      await api.post('/auth/google/onetap', {
        credential: response.credential,
        next: nextPath,
        deviceId: trustedDeviceId,
      });
      try { await refreshUser?.(); } catch {}
      router.replace(nextPath);
    } catch (e: any) {
      console.warn('One Tap / button sign-in failed', e?.response?.data || e?.message);
    }
  };

  // Render (or re-render) the official Google button with a computed width
  const renderGoogleButton = () => {
    const container = googleBtnRef.current;
    if (!container || !window.google?.accounts?.id?.renderButton) return;
    // Clear previous render
    container.innerHTML = '';
    const width = Math.min(420, Math.max(280, container.offsetWidth || 320));
    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      width, // px
    });
    setGoogleButtonReady(true);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!googleClientId) return;
        await loadScript('gsi-script', GSI_SRC);
        if (cancelled || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGsiCredential,
          auto_select: true,
          cancel_on_tap_outside: false,
          use_fedcm_for_prompt: true,
          context: 'signin',
        });

        // Official button
        renderGoogleButton();

        // Re-render on container resize (best) or window resize (fallback)
        let ro: ResizeObserver | null = null;
        if ('ResizeObserver' in window && googleBtnRef.current) {
          ro = new ResizeObserver(() => renderGoogleButton());
          ro.observe(googleBtnRef.current);
        } else {
          const onResize = () => { renderGoogleButton(); };
          window.addEventListener('resize', onResize);
          // cleanup attached on return
          (renderGoogleButton as any)._cleanup = () => window.removeEventListener('resize', onResize);
        }

        // One Tap prompt (GIS decides visibility)
        window.google.accounts.id.prompt();

        // Cleanup
        return () => {
          cancelled = true;
          try {
            ro?.disconnect();
            (renderGoogleButton as any)._cleanup?.();
            window.google?.accounts.id.cancel();
            window.google?.accounts.id.disableAutoSelect();
          } catch {}
        };
      } catch (e) {
        console.warn('GSI init failed', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId, nextPath, trustedDeviceId]);

  // Manual passkey trigger
  const signInWithPasskey = async () => {
    setError('');
    try {
      if (!('PublicKeyCredential' in window)) {
        setError('Passkeys are not supported on this device.');
        return;
      }
      const { data: opts } = await webauthnGetAuthenticationOptions();
      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: b64ToBuf(opts.challenge),
        allowCredentials: (opts.allowCredentials || []).map((c: any) => ({ type: 'public-key', id: b64ToBuf(c.id) })),
        userVerification: opts.userVerification || 'preferred',
      };
      const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
      const assertion = cred.response as AuthenticatorAssertionResponse;

      await webauthnVerifyAuthentication({
        id: cred.id,
        type: cred.type,
        rawId: bufToB64(cred.rawId),
        response: {
          clientDataJSON: bufToB64(assertion.clientDataJSON),
          authenticatorData: bufToB64(assertion.authenticatorData),
          signature: bufToB64(assertion.signature),
          userHandle: assertion.userHandle ? bufToB64(assertion.userHandle) : undefined,
        },
        deviceId: trustedDeviceId,
      });
      try { await refreshUser?.(); } catch {}
      router.replace(nextPath);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Passkey sign-in failed.';
      setError(typeof msg === 'string' ? msg : 'Passkey sign-in failed.');
      announce('Passkey sign-in failed.');
    }
  };

  // Try auto passkey (Conditional UI)
  useEffect(() => {
    let cancelled = false;
    const tryAutoPasskey = async () => {
      if (!('PublicKeyCredential' in window)) { setAutoTrying(false); return; }
      try {
        // @ts-ignore
        const condAvailable = typeof PublicKeyCredential.isConditionalMediationAvailable === 'function'
          // @ts-ignore
          ? await PublicKeyCredential.isConditionalMediationAvailable()
          : false;

        const { data: opts } = await webauthnGetAuthenticationOptions();
        const publicKey: PublicKeyCredentialRequestOptions = {
          challenge: b64ToBuf(opts.challenge),
          allowCredentials: (opts.allowCredentials || []).map((c: any) => ({ type: 'public-key', id: b64ToBuf(c.id) })),
          userVerification: opts.userVerification || 'preferred',
        };

        const cred = (await navigator.credentials.get({
          publicKey,
          // @ts-ignore
          mediation: condAvailable ? 'conditional' : undefined,
        })) as PublicKeyCredential | null;

        if (!cred) { if (!cancelled) setAutoTrying(false); return; }
        const assertion = cred.response as AuthenticatorAssertionResponse;

        await webauthnVerifyAuthentication({
          id: cred.id,
          type: cred.type,
          rawId: bufToB64(cred.rawId),
          response: {
            clientDataJSON: bufToB64(assertion.clientDataJSON),
            authenticatorData: bufToB64(assertion.authenticatorData),
            signature: bufToB64(assertion.signature),
            userHandle: assertion.userHandle ? bufToB64(assertion.userHandle) : undefined,
          },
          deviceId: trustedDeviceId,
        });

        try { await refreshUser?.(); } catch {}
        if (!cancelled) router.replace(nextPath);
      } catch {
        if (!cancelled) setAutoTrying(false);
      }
    };
    const t = setTimeout(() => { void tryAutoPasskey(); }, 120);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPath, trustedDeviceId]);

  // -------- Apple JS Sign In (official widget + popup) --------
  const appleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;             // e.g., com.yourapp.web
  const appleRedirectURI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI || ''; // your backend callback URL

  const initApple = async () => {
    if (!appleClientId || !appleRedirectURI) return;
    await loadScript('appleid-js', APPLE_SRC);
    if (!window.AppleID?.auth) return;

    // Initialize Apple JS
    window.AppleID.auth.init({
      clientId: appleClientId,
      scope: 'name email',
      redirectURI: appleRedirectURI,
      usePopup: true, // no full-page redirect; we’ll POST the result to backend
    });

    // Render a responsive Apple button by using Apple’s container + data-* attrs
    const host = appleBtnRef.current;
    if (!host) return;

    // Clear & build the button container
    host.innerHTML = '';
    const btn = document.createElement('div');
    btn.id = 'appleid-signin';
    btn.setAttribute('data-color', 'black');   // 'black' | 'white'
    btn.setAttribute('data-border', 'true');   // Apple styles the border
    btn.setAttribute('data-type', 'continue'); // 'sign in' | 'continue'
    btn.style.height = '44px';
    btn.style.width = '100%';
    host.appendChild(btn);

    // Click to trigger Apple sign in popup; on success we post token/code to backend
    btn.addEventListener('click', async () => {
      try {
        const result = await window.AppleID.auth.signIn();
        // Send id_token / code to your backend for verification & session creation
        await api.post('/auth/apple/js', {
          id_token: result?.authorization?.id_token,
          code: result?.authorization?.code,
          user: result?.user, // name/email on first sign
          next: nextPath,
          deviceId: trustedDeviceId,
        });
        try { await refreshUser?.(); } catch {}
        router.replace(nextPath);
      } catch (err) {
        console.warn('Apple sign-in failed', err);
      }
    });

    setAppleButtonReady(true);
  };

  // Initialize Apple and re-size button responsively
  useEffect(() => {
    let ro: ResizeObserver | null = null;
    let cleanupResize: (() => void) | null = null;

    (async () => {
      try {
        await initApple();

        // ResizeObserver to keep visuals crisp
        if ('ResizeObserver' in window && appleBtnRef.current) {
          ro = new ResizeObserver(() => {
            // Re-init to let Apple button match new width
            void initApple();
          });
          ro.observe(appleBtnRef.current);
        } else {
          const onResize = () => { void initApple(); };
          window.addEventListener('resize', onResize);
          cleanupResize = () => window.removeEventListener('resize', onResize);
        }
      } catch (e) {
        console.warn('Apple init failed', e);
      }
    })();

    return () => {
      ro?.disconnect();
      cleanupResize?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appleClientId, appleRedirectURI, nextPath, trustedDeviceId]);

  // Password sign-in
  const onPasswordSignIn = async ({ email, password, remember }: PwForm) => {
    setError('');
    try {
      const res = await login(email.trim().toLowerCase(), password, remember);
      if (res?.mfaRequired && res?.token) {
        setMfaToken(res.token);
        return;
      }
    } catch (e: any) {
      setError(e?.message || 'Invalid email or password.');
      announce('Sign-in failed.');
    }
  };

  // MFA verify
  const onVerifyMfa = async ({ code, trustedDevice }: MfaForm) => {
    if (!mfaToken) return;
    try {
      setError('');
      await verifyMfa(mfaToken, code, trustedDevice, trustedDevice ? trustedDeviceId : undefined);
    } catch {
      setError('Invalid verification code.');
      announce('Invalid verification code.');
    }
  };

  // Magic link
  const onSendMagic = async ({ email }: MagicForm) => {
    setError('');
    setMagicSent(false);
    try {
      await requestMagicLink(email.trim().toLowerCase(), nextPath);
      setMagicSent(true);
      announce('Magic link sent. Check your inbox.');
    } catch {
      setError('Unable to send magic link.');
      announce('Unable to send magic link.');
    }
  };

  // Fallback OAuth links (used only if buttons fail to render)
  const base = (api.defaults.baseURL || '').replace(/\/+$/, '');
  const googleHref = `${base}/auth/google/login?next=${encodeURIComponent(nextPath)}`;
  const appleHref  = `${base}/auth/apple/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <MainLayout>
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Sign in to Booka</h1>
            <p className="mt-1 text-sm text-gray-600">Fast options first. Or use your email below.</p>
            <p ref={liveRef} aria-live="polite" className="sr-only" />
          </div>

          {/* Auto passkey hint */}
          {autoTrying && (
            <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-sm text-gray-700 dark:text-gray-200">Checking for a saved passkey…</p>
            </div>
          )}

          {/* Primary: Passkey + Google + Apple (official widgets) */}
          <div className="mt-6 grid gap-3">
            <Button onClick={signInWithPasskey} className="w-full">Continue with Passkey</Button>

            {/* Google official button with resize-aware rendering */}
            <div className="relative">
              <div ref={googleBtnRef} className="w-full flex justify-center" />
              {!googleButtonReady && (
                <a
                  href={googleHref}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
                >
                  Continue with Google
                </a>
              )}
            </div>

            {/* Apple official widget container (responsive); shows fallback <a> if JS fails */}
            <div className="relative">
              <div ref={appleBtnRef} className="w-full" />
              {!appleButtonReady && (
                <a
                  href={appleHref}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-900"
                >
                  Continue with Apple
                </a>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            <span className="text-xs uppercase tracking-wider text-gray-500">or</span>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>

          {/* Email + Password (always visible) */}
          <form className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900" onSubmit={submitPw(onPasswordSignIn)}>
            <AuthInput
              id="email"
              type="email"
              label="Email address"
              autoComplete="email"
              registration={regPw('email', {
                required: 'Email is required',
                pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'Invalid email address' },
                setValueAs: (v) => String(v || '').trim().toLowerCase(),
              })}
              error={pwErrors.email}
            />
            <AuthInput
              id="password"
              type="password"
              label="Password"
              autoComplete="current-password"
              registration={regPw('password', {
                required: 'Password is required',
                minLength: { value: 6, message: 'Must be at least 6 characters' },
              })}
              error={pwErrors.password}
            />
            <div className="mt-1 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300" {...regPw('remember')} defaultChecked />
                Remember me
              </label>
              <Link href="/forgot-password" className="text-sm font-medium text-brand-dark hover:text-brand">
                Forgot password?
              </Link>
            </div>

            {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}

            <Button type="submit" disabled={pwSubmitting} className="w-full">
              {pwSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* Magic link */}
          <form onSubmit={submitMagic(onSendMagic)} className="mt-3 space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <AuthInput
              id="magic-email"
              type="email"
              label="Prefer a magic link? Enter email"
              autoComplete="email"
              registration={regMagic('email', {
                required: 'Email is required',
                pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'Invalid email address' },
                setValueAs: (v) => String(v || '').trim().toLowerCase(),
              })}
              error={magicErrors.email}
            />
            <Button type="submit" className="w-full" disabled={magicSubmitting}>
              {magicSubmitting ? 'Sending…' : 'Send magic link'}
            </Button>
            {magicSent && <p className="text-sm text-green-700">We sent you a sign-in link. Check your inbox.</p>}
          </form>

          {/* MFA step (trusted device) */}
          {mfaToken && (
            <form className="mt-6 space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900" onSubmit={submitMfa(onVerifyMfa)}>
              <AuthInput
                id="mfa-code"
                type="text"
                label="Verification code"
                registration={regMfa('code', { required: 'Code is required' })}
                error={undefined}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300" {...regMfa('trustedDevice')} defaultChecked />
                Trust this device for 30 days
              </label>
              {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}
              <Button type="submit" disabled={mfaSubmitting} className="w-full">
                {mfaSubmitting ? 'Verifying…' : 'Verify'}
              </Button>
            </form>
          )}

          <p className="mt-8 text-center text-sm text-gray-500">
            New to Booka?{' '}
            <Link href={`/register?next=${encodeURIComponent(nextPath)}`} className="font-semibold text-brand-dark hover:text-brand">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </MainLayout>
  );
}

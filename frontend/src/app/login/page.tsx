'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import AuthInput from '@/components/auth/AuthInput';
import { useAuth } from '@/contexts/AuthContext';
import api, { getApiOrigin, getEmailStatus, requestMagicLink } from '@/lib/api';

// --------------------------------------
// Types
// --------------------------------------
type EmailOnlyForm = { email: string };
type PwForm = { email: string; password: string; remember: boolean };
type MfaForm = { code: string; trustedDevice?: boolean };
type EmailStatusResponse = { exists: boolean; providers: string[]; locked: boolean };

type GoogleIdentity = {
  accounts?: {
    id?: {
      initialize: (...args: unknown[]) => void;
      prompt: (...args: unknown[]) => void;
      cancel: () => void;
      disableAutoSelect: () => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

// External widget script URLs
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const TRUSTED_DEVICE_KEY = 'booka.trusted_device_id';

type Stage = 'email' | 'password' | 'mfa';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const nextPath = useMemo(() => next, [next]);

  // Thin redirect to unified /auth page
  useEffect(() => {
    try {
      const intent = 'login';
      router.replace(`/auth?intent=${intent}&next=${encodeURIComponent(nextPath)}`);
    } catch {}
  }, [router, nextPath]);

  const { login, verifyMfa, user, refreshUser } = useAuth();

  // UI & flow state
  const [stage, setStage] = useState<Stage>('email');
  const [error, setError] = useState('');
  const [errorSubtext, setErrorSubtext] = useState('');
  const [errorPrimaryAction, setErrorPrimaryAction] = useState<{ label: string; href: string } | null>(null);
  const [errorSecondaryAction, setErrorSecondaryAction] = useState<{ label: string; onClick: () => void } | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  // Passkey auto-try removed for this view
  const [magicSent, setMagicSent] = useState(false);
  const [emailStatusCache, setEmailStatusCache] = useState<{ email: string; status: EmailStatusResponse } | null>(null);

  // Hide official buttons; keep One Tap only

  // Trusted device id (for MFA skip)
  const [trustedDeviceId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const existing = localStorage.getItem(TRUSTED_DEVICE_KEY);
    if (existing) return existing;
    const id = window.crypto.getRandomValues(new Uint32Array(4)).join('-');
    localStorage.setItem(TRUSTED_DEVICE_KEY, id);
    return id;
  });

  // a11y polite announcements
  const liveRef = useRef<HTMLParagraphElement | null>(null);
  const announce = (msg: string) => {
    if (liveRef.current) liveRef.current.textContent = msg;
  };

  const showError = (
    message: string,
    options?: {
      subtext?: string;
      primaryAction?: { label: string; href: string };
      secondaryAction?: { label: string; onClick: () => void };
    },
  ) => {
    setError(message);
    setErrorSubtext(options?.subtext ?? '');
    setErrorPrimaryAction(options?.primaryAction ?? null);
    setErrorSecondaryAction(options?.secondaryAction ?? null);
  };

  const clearError = () => {
    showError('');
  };

  const extractMessage = (err: unknown, fallback = 'An unexpected error occurred.') => {
    if (typeof err === 'string' && err) return err;
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const maybeMessage = (err as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage) return maybeMessage;
    }
    return fallback;
  };

  const goToEmailStage = () => {
    setStage('email');
    clearError();
    setMagicSent(false);
    setEmailStatusCache(null);
    setPwValue('password', '');
  };

  // Redirect if already signed in
  useEffect(() => {
    if (user) {
      const target = next || (user.user_type === 'service_provider' ? '/dashboard' : '/');
      router.replace(target);
    }
  }, [user, next, router]);

  // --------------------------------------
  // Forms
  // --------------------------------------
  const {
    register: regEmail,
    handleSubmit: submitEmail,
    formState: { errors: emailErrors, isSubmitting: emailSubmitting },
    getValues: getEmailValues,
  } = useForm<EmailOnlyForm>({ defaultValues: { email: '' } });

  const {
    register: regPw,
    handleSubmit: submitPw,
    setValue: setPwValue,
    formState: { isSubmitting: pwSubmitting, errors: pwErrors },
  } = useForm<PwForm>({ defaultValues: { email: '', remember: true } });

  const {
    register: regMfa,
    handleSubmit: submitMfa,
    formState: { isSubmitting: mfaSubmitting },
  } = useForm<MfaForm>({ defaultValues: { trustedDevice: true } });

  // --------------------------------------
  // (Passkeys removed for this view)

  // --------------------------------------
  // Google Identity Services: One Tap + official button
  // --------------------------------------
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

  const handleGsiCredential = useCallback(
    async (response: { credential?: string }) => {
      try {
        if (!response?.credential) return;
        await api.post('/auth/google/onetap', {
          credential: response.credential,
          next: nextPath,
          deviceId: trustedDeviceId,
        });
        try {
          await refreshUser?.();
        } catch {
          /* ignore refresh failures */
        }
        router.replace(nextPath);
      } catch (error: unknown) {
        let detail = extractMessage(error, 'Sign-in failed');
        if (typeof error === 'object' && error && 'response' in error) {
          const responseData = (error as { response?: { data?: unknown } }).response?.data;
          if (responseData !== undefined) {
            detail = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
          }
        }
        console.warn('One Tap / button sign-in failed', detail);
      }
    },
    [nextPath, refreshUser, router, trustedDeviceId],
  );

  // Hide official Google button; only initialize One Tap prompt

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

        window.google.accounts.id.prompt();

        return () => {
          cancelled = true;
          try {
            window.google?.accounts.id.cancel();
            window.google?.accounts.id.disableAutoSelect();
          } catch {
            /* ignore cancel errors */
          }
        };
      } catch (error: unknown) {
        console.warn('GSI init failed', extractMessage(error, 'Initialization error'));
      }
    })();
  }, [googleClientId, handleGsiCredential]);

  // Apple official widget removed; we use redirect via icon button

  // Passkeys disabled on this page

  // --------------------------------------
  // Actions
  // --------------------------------------
  const onEmailContinue = ({ email }: EmailOnlyForm) => {
    clearError();
    const normalized = (email || '').trim().toLowerCase();
    setPwValue('email', normalized);
    setPwValue('password', '');
    setStage('password');
    setEmailStatusCache(null);
  };

  const onPasswordSignIn = async ({ email, password, remember }: PwForm) => {
    clearError();
    try {
      const normalized = email.trim().toLowerCase();
      const res = await login(normalized, password, remember);
      if (res?.mfaRequired && res?.token) {
        setMfaToken(res.token);
        setStage('mfa');
        return;
      }
    } catch (error: unknown) {
      const normalized = email.trim().toLowerCase();
      let message = extractMessage(error, 'Invalid email or password.');
      let subtext = '';
      let primaryAction: { label: string; href: string } | undefined;
      let secondaryAction: { label: string; onClick: () => void } | undefined;

      const ensureStatus = async () => {
        if (emailStatusCache?.email === normalized) {
          return emailStatusCache.status;
        }
        try {
          const res = await getEmailStatus(normalized);
          const status = res.data as EmailStatusResponse;
          setEmailStatusCache({ email: normalized, status });
          return status;
        } catch {
          /* ignore email status lookup failures */
          return null;
        }
      };

      const status = await ensureStatus();
      const registerHref = `/register?email=${encodeURIComponent(normalized)}&next=${encodeURIComponent(nextPath)}`;
      const resetHref = `/forgot-password?email=${encodeURIComponent(normalized)}`;

      if (status && !status.exists) {
        message = `We couldn’t find an account for ${normalized}.`;
        subtext = 'Create a free account to continue or try a different email address.';
        primaryAction = { label: 'Create an account', href: registerHref };
        secondaryAction = { label: 'Try a different email', onClick: goToEmailStage };
        announce(`We couldn't find an account for ${normalized}. You can create one or try another email.`);
        showError(message, { subtext, primaryAction, secondaryAction });
        return;
      }

      if (status && status.locked) {
        message = 'We temporarily locked this account after too many attempts.';
        subtext = 'Reset your password and we’ll guide you back in right away.';
        primaryAction = { label: 'Reset password', href: resetHref };
        announce('Account temporarily locked. Reset your password to continue.');
        showError(message, { subtext, primaryAction });
        return;
      }

      if (!subtext) {
        subtext = 'Double-check your password or reset it below.';
      }
      if (!primaryAction) {
        primaryAction = { label: 'Reset password', href: resetHref };
      }
      announce('Sign-in failed.');
      showError(message, { subtext, primaryAction });
    }
  };

  const onVerifyMfa = async ({ code, trustedDevice }: MfaForm) => {
    if (!mfaToken) return;
    try {
      clearError();
      await verifyMfa(mfaToken, code, trustedDevice, trustedDevice ? trustedDeviceId : undefined);
    } catch {
      showError('Invalid verification code.');
      announce('Invalid verification code.');
    }
  };

  const onSendMagicLink = async () => {
    clearError();
    setMagicSent(false);
    const email = (getEmailValues('email') || '').trim().toLowerCase();
    if (!email) {
      showError('Enter your email first.');
      return;
    }
    try {
      await requestMagicLink(email, nextPath);
      setMagicSent(true);
      announce('Magic link sent. Check your inbox.');
    } catch {
      showError('Unable to send magic link.');
      announce('Unable to send magic link.');
    }
  };

  // Fallback OAuth links (only used if JS widgets fail)
  const base = getApiOrigin();
  const googleHref = `${base}/auth/google/login?next=${encodeURIComponent(nextPath)}`;
  const appleHref  = `${base}/auth/apple/login?next=${encodeURIComponent(nextPath)}`;
  const facebookHref = `${base}/auth/facebook/login?next=${encodeURIComponent(nextPath)}`;

const SocialRow = () => (
  <div className="flex items-center justify-center gap-4">
    {/* Google square button */}
    <a
      href={googleHref}
      className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
      aria-label="Sign in with Google"
      title="Sign in with Google"
    >
      <svg viewBox="0 0 262 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" aria-hidden="true" focusable="false" width="22" height="22" role="img">
        <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4"></path>
        <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853"></path>
        <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05"></path>
        <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335"></path>
      </svg>
  </a>

    {/* Apple square button */}
    <a
      href={appleHref}
      className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
      aria-label="Sign in with Apple"
      title="Sign in with Apple"
    >
      <svg width="22" xmlns="http://www.w3.org/2000/svg" height="22" viewBox="0 0 170 170" aria-hidden="true" focusable="false" role="img">
        <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.197-2.12-9.973-3.17-14.34-3.17-4.58 0-9.492 1.05-14.746 3.17-5.262 2.13-9.501 3.24-12.742 3.35-4.929.21-9.842-1.96-14.746-6.52-3.13-2.73-7.045-7.41-11.735-14.04-5.032-7.08-9.169-15.29-12.41-24.65-3.471-10.11-5.211-19.9-5.211-29.378 0-10.857 2.346-20.221 7.045-28.068 3.693-6.303 8.606-11.275 14.755-14.925s12.793-5.51 19.948-5.629c3.915 0 9.049 1.211 15.429 3.591 6.362 2.388 10.447 3.599 12.238 3.599 1.339 0 5.877-1.416 13.57-4.239 7.275-2.618 13.415-3.702 18.445-3.275 13.63 1.1 23.87 6.473 30.68 16.153-12.19 7.386-18.22 17.731-18.1 31.002.11 10.337 3.86 18.939 11.23 25.769 3.34 3.17 7.07 5.62 11.22 7.36-.9 2.61-1.85 5.11-2.86 7.51zM119.11 7.24c0 8.102-2.96 15.667-8.86 22.669-7.12 8.324-15.732 13.134-25.071 12.375a25.222 25.222 0 0 1-.188-3.07c0-7.778 3.386-16.102 9.399-22.908 3.002-3.446 6.82-6.311 11.45-8.597 4.62-2.252 8.99-3.497 13.1-3.71.12 1.083.17 2.166.17 3.24z"></path>
      </svg>
    </a>

    {/* Facebook square button */}
    <a
      href={facebookHref}
      className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
      aria-label="Sign in with Facebook"
      title="Sign in with Facebook"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img">
        <path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.593 1.323-1.325V1.325C24 .593 23.407 0 22.675 0z"></path>
      </svg>
    </a>
  </div>
);

  return (
    <MainLayout>
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-10">
        <div className="w-full max-w-[440px]">
          <div className="text-left">
            <h1 className="text-2xl font-bold tracking-tight">Sign in or create an account</h1>
            <p className="mt-2 text-sm text-gray-600">
              Use your Booka account to access bookings, messages, and payments.
            </p>
            <p ref={liveRef} aria-live="polite" className="sr-only" />
          </div>

          {/* Panel */}
          <div className="mt-6 bg-white border-b dark:border-gray-800 dark:bg-gray-900">
            <div className="">
              {/* EMAIL STAGE */}
              {stage === 'email' && (
                <form onSubmit={submitEmail(onEmailContinue)} className="space-y-4">
                  <AuthInput
                    id="email"
                    type="email"
                    label="Email address"
                    placeholder="Enter your email address"
                    autoComplete="email webauthn"
                    registration={
                      regEmail('email', {
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address',
                        },
                        setValueAs: (v) => String(v || '').trim().toLowerCase(),
                      })
                    }
                    error={emailErrors.email}
                  />
                  <Button type="submit" disabled={emailSubmitting} className="w-full">
                    {emailSubmitting ? 'Continuing…' : 'Continue with email'}
                  </Button>

                  {/* Divider with text */}
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                    <span className="text-sm  tracking-wider text-gray-500">
                      or use one of these options
                    </span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                  </div>

                  {/* Social options */}
                  <div className="grid pt-2 gap-3">
                    <SocialRow />
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={onSendMagicLink}
                        className="text-xs font-light text-gray-500 hover:text-brand pb-4"
                      >
                        Email me a sign-in link instead
                      </button>
                      {magicSent && (
                        <p className="mt-1 text-sm text-green-700">We sent you a sign-in link. Check your inbox.</p>
                      )}
                    </div>
                  </div>
                </form>
              )}

              {/* PASSWORD STAGE */}
              {stage === 'password' && (
                <form onSubmit={submitPw(onPasswordSignIn)} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Enter your password</h2>
                    <button
                      type="button"
                      onClick={goToEmailStage}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Change email
                    </button>
                  </div>

                  <AuthInput
                    id="pw-email"
                    type="email"
                    label="Email address"
                    autoComplete="email"
                    registration={
                      regPw('email', {
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address',
                        },
                        setValueAs: (v) => String(v || '').trim().toLowerCase(),
                      })
                    }
                    error={pwErrors.email}
                  />

                  <AuthInput
                    id="password"
                    type="password"
                    label="Password"
                    autoComplete="current-password"
                    registration={
                      regPw('password', {
                        required: 'Password is required',
                        minLength: { value: 6, message: 'Must be at least 6 characters' },
                      })
                    }
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

                  {error && (
                    <div className="space-y-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
                      <p>{error}</p>
                      {errorSubtext && <p className="text-red-700/90">{errorSubtext}</p>}
                      {(errorPrimaryAction || errorSecondaryAction) && (
                        <div className="flex flex-wrap gap-3 pt-1">
                          {errorPrimaryAction && (
                            <Link
                              href={errorPrimaryAction.href}
                              className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:border-red-300 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                            >
                              {errorPrimaryAction.label}
                            </Link>
                          )}
                          {errorSecondaryAction && (
                            <button
                              type="button"
                              onClick={errorSecondaryAction.onClick}
                              className="text-sm font-medium text-red-700 underline-offset-2 hover:underline"
                            >
                              {errorSecondaryAction.label}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <Button type="submit" disabled={pwSubmitting} className="w-full">
                    {pwSubmitting ? 'Signing in…' : 'Sign in'}
                  </Button>

                  {/* Divider within password stage */}
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                    <span className="text-xs uppercase tracking-wider text-gray-500">or use one of these options</span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                  </div>

                  <div className="grid gap-3">
                    <SocialRow />
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={onSendMagicLink}
                        className="text-sm font-medium text-brand-dark hover:text-brand"
                      >
                        Email me a sign-in link instead
                      </button>
                      {magicSent && (
                        <p className="mt-1 text-sm text-green-700">We sent you a sign-in link. Check your inbox.</p>
                      )}
                    </div>
                  </div>
                </form>
              )}

              {/* MFA STAGE */}
              {stage === 'mfa' && mfaToken && (
                <form onSubmit={submitMfa(onVerifyMfa)} className="space-y-4">
                  <h2 className="text-base font-semibold">Verification code</h2>
                  <AuthInput
                    id="mfa-code"
                    type="text"
                    label="Enter the 6-digit code"
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
            </div>

            {/* Passkey hint removed */}
          </div>

          {/* Footer (Terms & Privacy) */}
          <div className="mt-6 text-center text-xs text-gray-500">
            By signing in or creating an account, you agree with our{' '}
            <Link href="/terms" className="font-medium text-brand-dark hover:text-brand">
              Terms & Conditions
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-medium text-brand-dark hover:text-brand">
              Privacy Policy
            </Link>
            .
            <div className="mt-2">© {new Date().getFullYear()} Booka.co.za — All rights reserved.</div>
          </div>

          {/* New user link */}
          <p className="mt-6 text-center text-sm text-gray-500">
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

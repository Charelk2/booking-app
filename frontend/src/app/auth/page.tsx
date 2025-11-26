'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, UseFormRegisterReturn, FieldError, Controller } from 'react-hook-form';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import AuthInput from '@/components/auth/AuthInput';
import { useAuth } from '@/contexts/AuthContext';
import api, { getApiOrigin, requestMagicLink, getEmailStatus } from '@/lib/api';
import { useGoogleOneTap } from '@/hooks/useGoogleOneTap';

import PhoneNumberField from '@/components/auth/PhoneNumberField';
import { isValidPhoneNumber } from 'react-phone-number-input';

type Phase = 'signin' | 'signup' | 'mfa';

type SignInForm = { email: string; password: string; remember: boolean };
type SignupForm = {
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string; // E.164 (e.g., +27821234567)
  password: string;
  confirmPassword: string;
  marketing_opt_in?: boolean;
  terms?: boolean;
};
type MfaForm = { code: string; trustedDevice?: boolean };

const TRUSTED_DEVICE_KEY = 'booka.trusted_device_id';

/** A11y live region helper */
const useAnnouncer = () => {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const announce = (msg: string) => {
    if (ref.current) ref.current.textContent = msg;
  };
  return { ref, announce };
};

/** Password input with show/hide + Caps Lock hint */
function PasswordField({
  id,
  label,
  registration,
  error,
  autoComplete = 'current-password',
  placeholder,
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const state = (e as any).getModifierState?.('CapsLock');
    if (typeof state === 'boolean') setCaps(state);
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-gray-900 dark:text-gray-100">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className={[
            'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm',
            'focus:outline-none focus:ring-2 focus:ring-brand/60 focus:border-brand',
            'dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700',
            error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '',
          ].join(' ')}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onKeyUp={handleKey}
          onKeyDown={handleKey}
          {...registration}
        />
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-2 my-auto inline-flex h-8 items-center rounded px-2 text-xs text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand/60 dark:text-gray-300 dark:hover:text-white"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {caps && (
        <p className="text-xs text-amber-600" role="status">
          Caps Lock is ON
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-600" role="alert">
          {error.message}
        </p>
      )}
    </div>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const params = useSearchParams();

  // Intent & routing
  const intent = (params.get('intent') || '').toLowerCase();
  const role = (params.get('role') || '').toLowerCase();
  const next = params.get('next') || '/dashboard';
  const nextPath = useMemo(() => next, [next]);

  const { user, login, verifyMfa, register: registerUser, refreshUser } = useAuth();

  // UI state
  const [phase, setPhase] = useState<Phase>('signin');
  const [error, setError] = useState('');
  const [errorSubtext, setErrorSubtext] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [queuedProviderModal, setQueuedProviderModal] = useState(false);

  const { ref: liveRef, announce } = useAnnouncer();

  // Trusted device identifier for MFA
  const [trustedDeviceId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const existing = localStorage.getItem(TRUSTED_DEVICE_KEY);
    if (existing) return existing;
    const id = window.crypto.getRandomValues(new Uint32Array(4)).join('-');
    localStorage.setItem(TRUSTED_DEVICE_KEY, id);
    return id;
  });

  const clearError = () => {
    setError('');
    setErrorSubtext('');
  };
  const extractMessage = (err: unknown, fallback = 'Something went wrong.') => {
    if (typeof err === 'string' && err) return err;
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const maybeMessage = (err as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage) return maybeMessage;
    }
    return fallback;
  };

  // If already signed in
  useEffect(() => {
    if (!user) return;
    if (role === 'service_provider') {
      try {
        window.dispatchEvent(new CustomEvent('provider:onboarding-open', { detail: { next: nextPath } }));
      } catch {}
    } else {
      const target = nextPath || (user.user_type === 'service_provider' ? '/dashboard' : '/');
      router.replace(target);
    }
  }, [user, role, nextPath, router]);

  // Forms
  const {
    register: regSignIn,
    handleSubmit: submitSignIn,
    setValue: setSignInValue,
    formState: { errors: signInErrors, isSubmitting: signingIn },
    getValues: getSignInValues,
  } = useForm<SignInForm>({ defaultValues: { email: '', remember: true } });

  const {
    register: regSignup,
    handleSubmit: submitSignup,
    watch: watchSignup,
    control,
    formState: { errors: signupErrors, isSubmitting: signupSubmitting },
    setValue: setSignupValue,
  } = useForm<SignupForm>({ defaultValues: { marketing_opt_in: true, terms: false } });

  const {
    register: regMfa,
    handleSubmit: submitMfa,
    formState: { isSubmitting: mfaSubmitting },
  } = useForm<MfaForm>({ defaultValues: { trustedDevice: true } });

  const password = watchSignup('password', '');
  const passwordStrength = useMemo(() => {
    let s = 0;
    if ((password || '').length >= 8) s += 1;
    if (/[A-Z]/.test(password)) s += 1;
    if (/[0-9]/.test(password)) s += 1;
    if (/[^A-Za-z0-9]/.test(password)) s += 1;
    return s;
  }, [password]);

  // Google One Tap
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

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
        } catch {}
        if (role === 'service_provider') {
          setQueuedProviderModal(true);
          try {
            window.dispatchEvent(new CustomEvent('provider:onboarding-open', { detail: { next: nextPath } }));
          } catch {}
        } else {
          router.replace(nextPath);
        }
      } catch (error: unknown) {
        // Non-blocking
        // eslint-disable-next-line no-console
        console.warn('One Tap sign-in failed:', extractMessage(error, 'Sign-in failed'));
      }
    },
    [nextPath, refreshUser, router, trustedDeviceId, role],
  );

  useGoogleOneTap({ clientId: googleClientId, onCredential: handleGsiCredential, context: 'signin', useFedCm: true });

  // Phase init based on ?intent
  useEffect(() => {
    setPhase(intent === 'signup' ? 'signup' : 'signin');
  }, [intent]);

  // Prefill email when provided in query
  useEffect(() => {
    const prefillEmail = (params.get('email') || '').trim().toLowerCase();
    if (prefillEmail) {
      setSignInValue('email', prefillEmail);
      setSignupValue('email', prefillEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAuthSuccess = async (wasEmailSignup?: boolean) => {
    try {
      await refreshUser?.();
    } catch {}
    if (role === 'service_provider') {
      setQueuedProviderModal(true);
      try {
        window.dispatchEvent(
          new CustomEvent('provider:onboarding-open', { detail: { next: nextPath, wasEmailSignup } }),
        );
      } catch {}
      return; // modal will handle redirect post-onboarding
    }
    router.replace(nextPath || '/dashboard');
  };

  // Actions
  const onSignIn = async ({ email, password, remember }: SignInForm) => {
    clearError();
    try {
      const normalized = (email || '').trim().toLowerCase();
      const res = await login(normalized, password, remember);
      if (res?.mfaRequired && res?.token) {
        setMfaToken(res.token);
        setPhase('mfa');
        announce('Verification required. Enter your 6-digit code.');
        return;
      }
      announce('Signed in successfully.');
      await onAuthSuccess();
    } catch (err: unknown) {
      // Default, non-enumerating copy
      let title = 'Invalid email or password.';
      let subtext =
        'Double-check your email and password or reset your password. If you signed up with Google, use the Sign in with Google option below.';

      const status = (err as any)?.response?.status as number | undefined;

      // Explicit lockout handling (rate limiting)
      if (status === 429) {
        title = 'Too many sign-in attempts.';
        subtext =
          'For your security, sign-in is temporarily locked. Please wait a few minutes before trying again, or use Forgot password to reset your password.';
      } else {
        const normalizedEmail = (email || '').trim().toLowerCase();
        if (normalizedEmail) {
          try {
            const res = await getEmailStatus(normalizedEmail);
            const data = (res.data || {}) as {
              exists?: boolean;
              providers?: string[];
              locked?: boolean;
            };
            const exists = !!data.exists;
            const providers = Array.isArray(data.providers) ? data.providers : [];
            const socialNames: Record<string, string> = {
              google: 'Google',
              apple: 'Apple',
              facebook: 'Facebook',
            };
            const socialProviders = providers.filter((p) => socialNames[p]);

            if (!exists) {
              title = "We couldn't find an account with that email.";
              subtext = 'Check for typos or create a new account below.';
            } else if (socialProviders.length > 0) {
              const names = socialProviders.map((p) => socialNames[p]);
              let providerLabel = '';
              if (names.length === 1) {
                providerLabel = names[0];
              } else if (names.length === 2) {
                providerLabel = `${names[0]} or ${names[1]}`;
              } else {
                providerLabel = `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
              }
              title = 'Check how you usually sign in.';
              subtext = `This email is already registered. If you created your account with ${providerLabel}, use the ${providerLabel} button below, or reset your password to sign in with email.`;
            } else if (exists) {
              title = 'Incorrect email or password.';
              subtext = 'Double-check your details or reset your password.';
            }
          } catch {
            // If email-status fails, fall back to the default generic copy.
          }
        }
      }

      setError(title);
      setErrorSubtext(subtext);
      announce('Sign-in failed.');
    }
  };

  const onVerifyMfa = async ({ code, trustedDevice }: MfaForm) => {
    if (!mfaToken) return;
    clearError();
    try {
      await verifyMfa(mfaToken, code, trustedDevice);
      announce('Verification successful.');
      await onAuthSuccess();
    } catch {
      setError('Invalid verification code.');
      announce('Invalid verification code.');
    }
  };

  const onSignupSubmit = async (data: SignupForm) => {
    clearError();
    if (!data.terms) {
      setError('Please accept the Terms & Privacy to continue.');
      announce('Please accept the Terms & Privacy to continue.');
      return;
    }
    try {
      await registerUser({
        email: (data.email || '').trim().toLowerCase(),
        first_name: (data.first_name || '').trim(),
        last_name: (data.last_name || '').trim(),
        phone_number: data.phone_number, // already E.164 from PhoneInput
        password: data.password,
        marketing_opt_in: !!data.marketing_opt_in,
        user_type: 'client' as const,
      });
      announce('Account created.');
      await onAuthSuccess(true);
    } catch (e: any) {
      try {
        // eslint-disable-next-line no-console
        console.error('Register failed:', e?.response?.status, e?.response?.data);
      } catch {}
      setError(e?.message || 'Registration failed.');
      announce('Registration failed.');
    }
  };

  const onSendMagicLink = async () => {
    clearError();
    setMagicSent(false);
    const email = (getSignInValues('email') || '').trim().toLowerCase();
    if (!email) {
      setError('Enter your email first.');
      announce('Enter your email first.');
      return;
    }
    try {
      await requestMagicLink(email, nextPath);
      setMagicSent(true);
      announce('Magic link sent. Check your inbox.');
    } catch {
      setError('Unable to send magic link.');
      announce('Unable to send magic link.');
    }
  };

  // OAuth fallback links
  const base = getApiOrigin();
  const googleHref = `${base}/auth/google/login?next=${encodeURIComponent(nextPath)}`;
  const appleHref = `${base}/auth/apple/login?next=${encodeURIComponent(nextPath)}`;
  const facebookHref = `${base}/auth/facebook/login?next=${encodeURIComponent(nextPath)}`;

  const markExternalAuthPending = () => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('auth:external_pending', '1');
      }
    } catch {}
  };

  const SocialRow = () => (
    <div className="flex items-center justify-center gap-4">
      <a
        href={googleHref}
        onClick={markExternalAuthPending}
        className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand/60"
        aria-label="Sign in with Google"
        title="Sign in with Google"
      >
        <svg viewBox="0 0 262 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" aria-hidden="true" focusable="false" width="20" height="20" role="img">
          <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4" />
          <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853" />
          <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05" />
          <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335" />
        </svg>
      </a>
      <a
        href={appleHref}
        className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand/60"
        aria-label="Sign in with Apple"
        title="Sign in with Apple"
      >
        <svg width="18" height="18" viewBox="0 0 170 170" aria-hidden="true" focusable="false" role="img">
          <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.197-2.12-9.973-3.17-14.34-3.17-4.58 0-9.492 1.05-14.746 3.17-5.262 2.13-9.501 3.24-12.742 3.35-4.929.21-9.842-1.96-14.746-6.52-3.13-2.73-7.045-7.41-11.735-14.04-5.032-7.08-9.169-15.29-12.41-24.65-3.471-10.11-5.211-19.9-5.211-29.378 0-10.857 2.346-20.221 7.045-28.068 3.693-6.303 8.606-11.275 14.755-14.925s12.793-5.51 19.948-5.629c3.915 0 9.049 1.211 15.429 3.591 6.362 2.388 10.447 3.599 12.238 3.599 1.339 0 5.877-1.416 13.57-4.239 7.275-2.618 13.415-3.702 18.445-3.275 13.63 1.1 23.87 6.473 30.68 16.153-12.19 7.386-18.22 17.731-18.1 31.002.11 10.337 3.86 18.939 11.23 25.769 3.34 3.17 7.07 5.62 11.22 7.36-.9 2.61-1.85 5.11-2.86 7.51zM119.11 7.24c0 8.102-2.96 15.667-8.86 22.669-7.12 8.324-15.732 13.134-25.071 12.375a25.222 25.222 0 0 1-.188-3.07c0-7.778 3.386-16.102 9.399-22.908 3.002-3.446 6.82-6.311 11.45-8.597 4.62-2.252 8.99-3.497 13.1-3.71.12 1.083.17 2.166.17 3.24z" />
        </svg>
      </a>
      <a
        href={facebookHref}
        className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand/60"
        aria-label="Sign in with Facebook"
        title="Sign in with Facebook"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img">
          <path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.593 1.323-1.325V1.325C24 .593 23.407 0 22.675 0z" />
        </svg>
      </a>
    </div>
  );

  return (
    <MainLayout>
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-10">
        <div className="w-full max-w-[560px]">
          <header className="text-left">
            <h1 className="text-2xl font-bold tracking-tight">Welcome</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Sign in or create an account.
            </p>
            <p ref={liveRef} aria-live="polite" className="sr-only" />
          </header>

          {/* Auth Card */}
          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-6">
            {/* Tabs (Sign in / Create account) */}
            <nav
              role="tablist"
              aria-label="Authentication"
              className="mb-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-sm dark:bg-gray-800"
            >
              {(['signin', 'signup'] as const).map((key) => {
                const active = phase === key;
                return (
                  <button
                    key={key}
                    role="tab"
                    id={`${key}-tab`}
                    aria-controls={`${key}-panel`}
                    aria-selected={active}
                    onClick={() => setPhase(key)}
                    className={[
                      'rounded-md px-3 py-2 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
                      active
                        ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white'
                        : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white',
                    ].join(' ')}
                  >
                    {key === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                );
              })}
            </nav>

            {/* Sign in panel */}
            <div role="tabpanel" id="signin-panel" aria-labelledby="signin-tab" hidden={phase !== 'signin'}>
              <form onSubmit={submitSignIn(onSignIn)} className="space-y-4">
                <AuthInput
                  id="si-email"
                  type="email"
                  label="Email address"
                  placeholder="youw@ntobooka.co.za"
                  autoComplete="username email"
                  registration={regSignIn('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address',
                    },
                    setValueAs: (v) => String(v || '').trim().toLowerCase(),
                  })}
                  error={signInErrors.email}
                />

                <PasswordField
                  id="si-password"
                  label="Password"
                  placeholder="Your password"
                  autoComplete="current-password"
                  registration={regSignIn('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'Must be at least 6 characters' },
                  })}
                  error={signInErrors.password}
                />

                <div className="mt-1 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300" {...regSignIn('remember')} defaultChecked />
                    Remember me
                  </label>
                  <Link
                    href={`/forgot-password?email=${encodeURIComponent(
                      (getSignInValues('email') || '').trim().toLowerCase(),
                    )}`}
                    className="text-sm font-medium text-brand-dark hover:text-brand"
                  >
                    Forgot password?
                  </Link>
                </div>

                {error && phase === 'signin' && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
                    <p className="font-semibold">{error}</p>
                    {errorSubtext && <p className="mt-1">{errorSubtext}</p>}
                  </div>
                )}

                <Button type="submit" disabled={signingIn} className="w-full">
                  {signingIn ? 'Signing in…' : 'Sign in'}
                </Button>

                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                  <span className="text-xs uppercase tracking-wider text-gray-500">or continue with</span>
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                </div>

                <div className="grid gap-3">
                  <SocialRow />
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={onSendMagicLink}
                      className="text-xs font-medium text-gray-600 hover:text-brand dark:text-gray-300"
                    >
                      Email me a sign-in link instead
                    </button>
                    {magicSent && <p className="mt-1 text-sm text-green-700">We sent you a sign-in link. Check your inbox.</p>}
                  </div>
                </div>
              </form>
            </div>

            {/* Signup panel */}
            <div role="tabpanel" id="signup-panel" aria-labelledby="signup-tab" hidden={phase !== 'signup'}>
              <form onSubmit={submitSignup(onSignupSubmit)} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <AuthInput
                    id="su-email"
                    type="email"
                    label="Email"
                    autoComplete="email username"
                    registration={regSignup('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Invalid email address',
                      },
                      setValueAs: (v) => String(v || '').trim().toLowerCase(),
                    })}
                    error={signupErrors.email}
                  />
                  <AuthInput
                    id="first_name"
                    type="text"
                    label="First name"
                    autoComplete="given-name"
                    registration={regSignup('first_name', { required: 'First name is required' })}
                    error={signupErrors.first_name}
                  />
                  <AuthInput
                    id="last_name"
                    type="text"
                    label="Last name"
                    autoComplete="family-name"
                    registration={regSignup('last_name', { required: 'Last name is required' })}
                    error={signupErrors.last_name}
                  />

                  {/* ZA-only phone with flags & E.164 */}
                  <Controller
                    name="phone_number"
                    control={control}
                    rules={{
                      required: 'Phone number is required',
                      validate: (value) =>
                        (value && isValidPhoneNumber(value)) || 'Invalid South African phone number',
                    }}
                    render={({ field, fieldState }) => (
                      <PhoneNumberField
                        id="phone_number"
                        label="Phone number"
                        value={field.value}
                        onChange={field.onChange}
                        error={fieldState.error?.message}
                        required
                      />
                    )}
                  />
                </div>

                <div>
                  <PasswordField
                    id="su-password"
                    label="Password"
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    registration={regSignup('password', {
                      required: 'Password is required',
                      minLength: { value: 8, message: 'Use at least 8 characters' },
                    })}
                    error={signupErrors.password}
                  />
                  {password && (
                    <div className="mt-2">
                      <div className="h-2 w-full rounded bg-gray-200 dark:bg-gray-800">
                        <div
                          className={['bg-red-500', 'bg-yellow-500', 'bg-brand', 'bg-green-600'][Math.max(passwordStrength - 1, 0)]}
                          style={{ width: `${(passwordStrength / 4) * 100}%`, height: '100%', borderRadius: '9999px' }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                        {['Weak', 'Fair', 'Good', 'Strong'][Math.max(passwordStrength - 1, 0)]}
                      </p>
                    </div>
                  )}
                </div>

                <PasswordField
                  id="su-confirm"
                  label="Confirm password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  registration={regSignup('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (v) => v === password || 'Passwords do not match',
                  })}
                  error={signupErrors.confirmPassword}
                />

                <div className="flex items-start gap-3">
                  <input id="terms" type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300" {...regSignup('terms')} />
                  <label htmlFor="terms" className="text-sm text-gray-700 dark:text-gray-300">
                    I agree to the{' '}
                    <Link href="/terms" className="underline text-gray-700 dark:text-gray-200">
                      Terms
                    </Link>{' '}
                    and{' '}
                    <Link href="/privacy" className="underline text-gray-700 dark:text-gray-200">
                      Privacy Policy
                    </Link>
                    .
                  </label>
                </div>

                <div className="flex items-start gap-3">
                  <input
                    id="marketing_opt_in"
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                    {...regSignup('marketing_opt_in')}
                  />
                  <label htmlFor="marketing_opt_in" className="text-sm text-gray-700 dark:text-gray-300">
                    Send me occasional tips & updates.
                  </label>
                </div>

                {error && phase === 'signup' && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={signupSubmitting}>
                  {signupSubmitting ? 'Creating account…' : 'Create account'}
                </Button>

                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                  <span className="text-xs uppercase tracking-wider text-gray-500">or</span>
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                </div>
                <div className="grid gap-3">
                  <SocialRow />
                </div>
              </form>
            </div>

            {/* MFA panel */}
            {phase === 'mfa' && mfaToken && (
              <div role="region" aria-label="Multi-factor verification">
                <form onSubmit={submitMfa(onVerifyMfa)} className="space-y-4">
                  <h2 className="text-base font-semibold">Verification code</h2>
                  <AuthInput
                    id="mfa-code"
                    type="text"
                    label="Enter the 6-digit code"
                    placeholder="123456"
                    registration={regMfa('code', {
                      required: 'Code is required',
                      pattern: { value: /^[0-9]{6}$/, message: 'Enter a 6-digit code' },
                    })}
                    error={undefined}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300" {...regMfa('trustedDevice')} defaultChecked />
                    Trust this device for 30 days
                  </label>
                  {error && (
                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
                      {error}
                    </div>
                  )}
                  <Button type="submit" disabled={mfaSubmitting} className="w-full">
                    {mfaSubmitting ? 'Verifying…' : 'Verify'}
                  </Button>
                </form>
              </div>
            )}
          </section>

          <footer className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
            By continuing, you agree to our{' '}
            <Link href="/terms" className="font-medium text-brand-dark hover:text-brand">
              Terms & Conditions
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-medium text-brand-dark hover:text-brand">
              Privacy Policy
            </Link>
            .
            <div className="mt-2">© {new Date().getFullYear()} Booka.co.za — All rights reserved.</div>

            {/* Friendly cross-link */}
            {phase === 'signin' && (
              <p className="mt-4">
                New to Booka?{' '}
                <button
                  onClick={() => setPhase('signup')}
                  className="font-semibold text-brand-dark hover:text-brand"
                >
                  Create an account
                </button>
              </p>
            )}
            {phase === 'signup' && (
              <p className="mt-4">
                Already have an account?{' '}
                <button
                  onClick={() => setPhase('signin')}
                  className="font-semibold text-brand-dark hover:text-brand"
                >
                  Sign in
                </button>
              </p>
            )}
          </footer>
        </div>
      </div>
    </MainLayout>
  );
}

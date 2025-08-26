'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import AuthInput from '@/components/auth/AuthInput';
import { useAuth } from '@/contexts/AuthContext';
import api, {
  getEmailStatus,
  requestMagicLink,
  webauthnGetAuthenticationOptions,
  webauthnVerifyAuthentication,
} from '@/lib/api';

type EmailStatus = { exists: boolean; providers: string[]; locked: boolean };

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';

  const { login, verifyMfa, user, refreshUser } = useAuth();

  // phases: ask email → either existing (inline sign-in) or notfound (offer magic link / sign up)
  const [phase, setPhase] = useState<'email' | 'existing' | 'notfound'>('email');
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [emailValue, setEmailValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [rememberState, setRememberState] = useState(false);
  const liveRef = useRef<HTMLParagraphElement | null>(null);

  // Redirect if already signed in
  useEffect(() => {
    if (user) {
      const target = next || (user.user_type === 'service_provider' ? '/dashboard' : '/');
      router.replace(target);
    }
  }, [user, next, router]);

  // Forms
  const {
    register: registerEmail,
    handleSubmit: handleEmailSubmit,
    formState: { isSubmitting: emailSubmitting, errors: emailErrors },
  } = useForm<{ email: string }>({
    defaultValues: { email: '' },
  });

  const {
    register: registerLogin,
    handleSubmit: handlePasswordSubmit,
    formState: { isSubmitting: pwSubmitting, errors: pwErrors },
  } = useForm<{ email: string; password: string; remember: boolean }>({
    defaultValues: { email: '', remember: false },
  });

  const {
    register: registerMfa,
    handleSubmit: handleMfaSubmit,
    formState: { isSubmitting: mfaSubmitting },
  } = useForm<{ code: string }>();

  // 1) Email gate
  const onContinueWithEmail = async ({ email }: { email: string }) => {
    const normalized = email.trim().toLowerCase();
    setError('');
    setMagicSent(false);
    setChecking(true);
    try {
      const res = await getEmailStatus(normalized);
      const data = res.data as EmailStatus;
      setEmailStatus(data);
      setEmailValue(normalized);
      setPhase(data.exists ? 'existing' : 'notfound');
      announce(data.exists ? 'Account found. Continue below.' : 'No account found. Choose an option below.');
    } catch {
      setError('Could not check email status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  // 2) Password sign-in (existing account)
  const onPasswordSignIn = async ({ email, password, remember }: { email: string; password: string; remember: boolean }) => {
    try {
      setError('');
      const res = await login(email, password, remember);
      if (res?.mfaRequired && res?.token) {
        setMfaToken(res.token);
        setRememberState(remember);
        announce('Verification required. Enter the code sent to you.');
        return;
      }
      // redirect handled by user effect
    } catch (e: any) {
      setError(e?.message || 'Invalid email or password.');
      announce('Sign-in failed.');
    }
  };

  const onVerifyMfa = async ({ code }: { code: string }) => {
    if (!mfaToken) return;
    try {
      setError('');
      await verifyMfa(mfaToken, code, rememberState);
      // redirect handled by user effect
    } catch {
      setError('Invalid verification code.');
      announce('Invalid verification code.');
    }
  };

  // Magic link
  const sendMagic = async () => {
    if (!emailValue) return setError('Enter your email first.');
    try {
      setError('');
      await requestMagicLink(emailValue, next);
      setMagicSent(true);
      announce('Magic link sent. Check your inbox.');
    } catch {
      setError('Unable to send magic link.');
      announce('Unable to send magic link.');
    }
  };

  // Passkey / WebAuthn sign-in
  const signInWithPasskey = async () => {
    try {
      if (!('PublicKeyCredential' in window)) {
        setError('Passkeys are not supported on this device.');
        return;
      }
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

      const { data: opts } = await webauthnGetAuthenticationOptions();
      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: b64ToBuf(opts.challenge),
        allowCredentials: (opts.allowCredentials || []).map((c: any) => ({
          type: 'public-key',
          id: b64ToBuf(c.id),
        })),
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
      });

      try { await refreshUser?.(); } catch {}
      router.replace(next);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Passkey sign-in failed.';
      setError(typeof msg === 'string' ? msg : 'Passkey sign-in failed.');
    }
  };

  const nextPath = useMemo(() => next, [next]);

  const announce = (msg: string) => {
    if (liveRef.current) liveRef.current.textContent = msg;
  };

  return (
    <MainLayout>
      <div className="flex min-h-[calc(100vh-120px)] flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">
              {phase === 'email' && 'Continue with your email'}
              {phase === 'existing' && 'Welcome back'}
              {phase === 'notfound' && 'No account found'}
            </h1>
            <p ref={liveRef} aria-live="polite" className="sr-only" />
          </div>

          {/* Phase: Email entry */}
          {phase === 'email' && (
            <form className="mt-8 space-y-6" onSubmit={handleEmailSubmit(onContinueWithEmail)}>
              <AuthInput
                id="email"
                type="email"
                label="Email address"
                autoComplete="email"
                registration={registerEmail('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                  setValueAs: (v) => String(v || '').trim().toLowerCase(),
                })}
                error={emailErrors.email}
              />
              <Button type="submit" className="w-full" disabled={checking || emailSubmitting}>
                {checking ? 'Checking…' : 'Continue'}
              </Button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
          )}

          {/* Phase: Existing account → inline sign in + options */}
          {phase === 'existing' && (
            <form className="mt-8 space-y-6" onSubmit={handlePasswordSubmit(onPasswordSignIn)}>
              <AuthInput
                id="email"
                type="email"
                label="Email address"
                autoComplete="email"
                defaultValue={emailValue}
                registration={registerLogin('email', { required: true })}
                error={undefined}
              />
              <div>
                <AuthInput
                  id="password"
                  type="password"
                  label="Password"
                  autoComplete="current-password"
                  registration={registerLogin('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'Must be at least 6 characters' },
                  })}
                  error={pwErrors.password}
                />
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300" {...registerLogin('remember')} />
                    Remember me
                  </label>
                  <Link href={`/forgot-password?email=${encodeURIComponent(emailValue)}`} className="text-sm font-medium text-brand-dark hover:text-brand">
                    Forgot password?
                  </Link>
                </div>
              </div>

              {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}

              <Button type="submit" disabled={pwSubmitting} className="w-full">
                {pwSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>

              <div className="space-y-2 pt-1">
                {(emailStatus?.providers || []).includes('google') && (
                  <a
                    href={`${(api.defaults.baseURL || '').replace(/\/+$/, '')}/auth/google/login?next=${encodeURIComponent(nextPath)}`}
                    className="inline-flex w-full items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  >
                    Continue with Google
                  </a>
                )}
                {(emailStatus?.providers || []).includes('apple') && (
                  <a
                    href={`${(api.defaults.baseURL || '').replace(/\/+$/, '')}/auth/apple/login?next=${encodeURIComponent(nextPath)}`}
                    className="inline-flex w-full items-center justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-900"
                  >
                    Continue with Apple
                  </a>
                )}
                <Button type="button" onClick={signInWithPasskey} className="w-full bg-gray-700 hover:bg-gray-800">
                  Continue with Passkey
                </Button>
                <Button type="button" onClick={sendMagic} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  Email me a magic link
                </Button>
                {magicSent && <p className="text-sm text-green-700">We sent you a sign-in link. Check your inbox.</p>}
              </div>

              <div className="text-center text-sm text-gray-600">
                Wrong email?{' '}
                <button type="button" className="text-brand-dark hover:text-brand" onClick={() => setPhase('email')}>
                  Change
                </button>
              </div>
            </form>
          )}

          {/* Phase: No account found */}
          {phase === 'notfound' && (
            <div className="mt-8 space-y-6">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-800">We couldn’t find an account for {emailValue}.</p>
                <p className="mt-1 text-sm text-gray-600">Create a new account or use a magic link.</p>
              </div>
              <Link
                href={`/register?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(emailValue)}`}
                className="inline-flex w-full items-center justify-center rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
              >
                Create an account
              </Link>
              <Button type="button" onClick={sendMagic} className="w-full bg-indigo-600 hover:bg-indigo-700">
                Send magic link
              </Button>
              {magicSent && <p className="text-sm text-green-700">We sent you a sign-in link. Check your inbox.</p>}
              <div className="text-center text-sm text-gray-600">
                Entered the wrong email?{' '}
                <button className="text-brand-dark hover:text-brand" onClick={() => setPhase('email')}>
                  Change
                </button>
              </div>
            </div>
          )}

          {/* MFA step */}
          {mfaToken && (
            <form className="mt-8 space-y-6" onSubmit={handleMfaSubmit(onVerifyMfa)}>
              <AuthInput
                id="mfa-code"
                type="text"
                label="Verification code"
                registration={registerMfa('code', { required: 'Code is required' })}
                error={undefined}
              />
              {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}
              <Button type="submit" disabled={mfaSubmitting} className="w-full">
                {mfaSubmitting ? 'Verifying…' : 'Verify'}
              </Button>
            </form>
          )}

          <p className="mt-10 text-center text-sm text-gray-500">
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

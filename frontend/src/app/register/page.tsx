'use client';

import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import AuthInput from '@/components/auth/AuthInput';
import { useAuth } from '@/contexts/AuthContext';
import api, { getEmailStatus, requestMagicLink } from '@/lib/api';
import toast from 'react-hot-toast';

type EmailStatus = { exists: boolean; providers: string[]; locked: boolean };

type RegisterForm = {
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  user_type: 'service_provider' | 'client' | '';
  password: string;
  confirmPassword: string;
  marketing_opt_in?: boolean;
  terms?: boolean;
};

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const prefillEmail = params.get('email') || '';
  const qRole = (params.get('user_type') || params.get('role') || '').toLowerCase();
  const defaultUserType: RegisterForm['user_type'] | '' = qRole === 'service_provider' ? 'service_provider' : '' as any;

  const { register: registerUser, login } = useAuth();

  const [phase, setPhase] = useState<'email' | 'existing' | 'signup'>('email');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [emailValue, setEmailValue] = useState(prefillEmail.trim().toLowerCase());
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const liveRef = useRef<HTMLParagraphElement | null>(null);

  // Email gate form
  const {
    register: regEmail,
    handleSubmit: handleEmailSubmit,
    formState: { errors: emailErrors, isSubmitting: emailSubmitting },
    setValue: setEmailValueInForm,
  } = useForm<{ email: string }>({ defaultValues: { email: prefillEmail } });

  // Full signup form
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    defaultValues: {
      email: prefillEmail,
      user_type: defaultUserType,
      marketing_opt_in: true,
      terms: false,
    },
  });

  const password = watch('password', '');
  const strength = useMemo(() => {
    let s = 0;
    if (password.length >= 8) s += 1;
    if (/[A-Z]/.test(password)) s += 1;
    if (/[0-9]/.test(password)) s += 1;
    if (/[^A-Za-z0-9]/.test(password)) s += 1;
    return s;
  }, [password]);

  const announce = (msg: string) => {
    if (liveRef.current) liveRef.current.textContent = msg;
  };

  // 1) Email gate
  const onContinueWithEmail = async ({ email }: { email: string }) => {
    const normalized = email.trim().toLowerCase();
    setError('');
    setMagicSent(false);
    setChecking(true);
    try {
      const res = await getEmailStatus(normalized);
      const data = res.data as EmailStatus;
      setStatus(data);
      setEmailValue(normalized);
      setEmailValueInForm('email', normalized);
      setPhase(data.exists ? 'existing' : 'signup');
      announce(data.exists ? 'Account already exists. Sign in below.' : 'Great! Let’s create your account.');
    } catch {
      setError('Could not check email status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  // 2a) Existing → inline sign-in (password or OAuth or magic)
  const onInlineSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const password = (form.elements.namedItem('inline_password') as HTMLInputElement)?.value;
    if (!emailValue || !password) return;
    setError('');
    try {
      await login(emailValue, password, true);
      router.push(next);
    } catch (err: any) {
      setError(err?.message || 'Sign in failed');
      announce('Sign in failed.');
    }
  };

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

  // 2b) New user → full signup
  const onSubmit = async (data: RegisterForm) => {
    const { confirmPassword, terms, ...userData } = data;
    void confirmPassword;
    try {
      if (!terms) {
        setError('Please accept the Terms to continue.');
        return;
      }
      await registerUser({
        ...userData,
        email: userData.email.trim().toLowerCase(),
      } as any);
      if (userData.user_type === 'service_provider') {
        toast.success('Welcome! Your dashboard is ready.');
        router.push('/dashboard');
      } else {
        toast.success('Account created! Please verify your email.');
        router.push('/confirm-email');
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please try again.');
      announce('Registration failed.');
    }
  };

  const nextPath = useMemo(() => next, [next]);

  return (
    <MainLayout>
      <div className="flex min-h-[calc(100vh-120px)] flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">
              {phase === 'email' && 'Continue with your email'}
              {phase === 'existing' && 'Welcome back'}
              {phase === 'signup' && 'Create your account'}
            </h1>
            <p ref={liveRef} aria-live="polite" className="sr-only" />
          </div>

          {/* Phase 1: Email-only */}
          {phase === 'email' && (
            <form className="mt-8 space-y-6" onSubmit={handleEmailSubmit(onContinueWithEmail)}>
              <AuthInput
                id="email"
                type="email"
                label="Email address"
                autoComplete="email"
                defaultValue={prefillEmail}
                registration={regEmail('email', {
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

          {/* Phase 2a: Existing → inline sign-in + OAuth/magic */}
          {phase === 'existing' && status && (
            <div className="mt-8 space-y-6">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-800">
                  An account already exists for <span className="font-semibold">{emailValue}</span>.
                </p>
                {status.locked && <p className="mt-1 text-sm text-red-600">Too many attempts. Try later or use a magic link.</p>}
              </div>

              {status.providers.includes('password') && (
                <form className="space-y-3" onSubmit={onInlineSignIn}>
                  <AuthInput id="inline_password" type="password" label="Password" registration={{ name: 'inline_password' } as any} />
                  <Button type="submit" className="w-full">Sign in</Button>
                </form>
              )}

              {(status.providers.includes('google') || status.providers.includes('apple')) && (
                <div className="space-y-3">
                  {status.providers.includes('google') && (
                    <a
                      href={`${(api.defaults.baseURL || '').replace(/\/+$/, '')}/auth/google/login?next=${encodeURIComponent(nextPath)}`}
                      className="inline-flex w-full items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                    >
                      Continue with Google
                    </a>
                  )}
                  {status.providers.includes('apple') && (
                    <a
                      href={`${(api.defaults.baseURL || '').replace(/\/+$/, '')}/auth/apple/login?next=${encodeURIComponent(nextPath)}`}
                      className="inline-flex w-full items-center justify-center rounded-md bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-900"
                    >
                      Continue with Apple
                    </a>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <Link href={`/forgot-password?email=${encodeURIComponent(emailValue)}`} className="text-brand-dark hover:text-brand">
                  Forgot password
                </Link>
                <button className="text-brand-dark hover:text-brand" onClick={sendMagic}>
                  Send magic link
                </button>
              </div>

              {magicSent && <p className="text-sm text-green-700">We sent you a sign-in link. Check your inbox.</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="text-center text-sm text-gray-600">
                Prefer creating a new account?{' '}
                <button className="text-brand-dark hover:text-brand" onClick={() => setPhase('signup')}>
                  Continue
                </button>
              </div>

              <div className="text-center text-sm text-gray-600">
                Wrong email?{' '}
                <button className="text-brand-dark hover:text-brand" onClick={() => setPhase('email')}>
                  Change
                </button>
              </div>
            </div>
          )}

          {/* Phase 2b: New user — full registration */}
          {phase === 'signup' && (
            <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
              <AuthInput
                id="email"
                type="email"
                label="Email address"
                autoComplete="email"
                defaultValue={emailValue}
                registration={register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                  setValueAs: (v) => String(v || '').trim().toLowerCase(),
                })}
                error={errors.email}
              />

              <AuthInput
                id="first_name"
                type="text"
                label="First name"
                autoComplete="given-name"
                registration={register('first_name', { required: 'First name is required' })}
                error={errors.first_name}
              />

              <AuthInput
                id="last_name"
                type="text"
                label="Last name"
                autoComplete="family-name"
                registration={register('last_name', { required: 'Last name is required' })}
                error={errors.last_name}
              />

              <AuthInput
                id="phone_number"
                type="tel"
                label="Phone number"
                placeholder="+27 82 123 4567"
                autoComplete="tel"
                registration={register('phone_number', {
                  required: 'Phone number is required',
                  pattern: { value: /^\+?[0-9\s-]{10,}$/, message: 'Please enter a valid phone number' },
                  setValueAs: (v) => String(v || '').trim(),
                })}
                error={errors.phone_number}
              />

              <div>
                <label htmlFor="user_type" className="block text-sm font-medium text-gray-900">I am a</label>
                <select
                  id="user_type"
                  className="mt-2 block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-brand-dark sm:text-sm"
                  {...register('user_type', { required: 'Please select your role' })}
                >
                  <option value="">Select role</option>
                  <option value="service_provider">Service Provider</option>
                  <option value="client">Client</option>
                </select>
                {errors.user_type && <p className="mt-2 text-sm text-red-600">{errors.user_type.message}</p>}
              </div>

              <div>
                <AuthInput
                  id="password"
                  type="password"
                  label="Password"
                  autoComplete="new-password"
                  registration={register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Use at least 8 characters' },
                  })}
                  error={errors.password}
                />
                {password && (
                  <>
                    <div className="mt-2 h-2 w-full rounded bg-gray-200">
                      <div
                        className={[
                          'bg-red-500',
                          'bg-yellow-500',
                          'bg-brand',
                          'bg-green-600',
                        ][Math.max(strength - 1, 0)]}
                        style={{ width: `${(strength / 4) * 100}%`, height: '100%', borderRadius: '9999px' }}
                      />
                    </div>
                    <p className="mt-1 text-sm text-gray-700">
                      {['Weak', 'Fair', 'Good', 'Strong'][Math.max(strength - 1, 0)]}
                    </p>
                  </>
                )}
              </div>

              <AuthInput
                id="confirmPassword"
                type="password"
                label="Confirm password"
                autoComplete="new-password"
                registration={register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (v) => v === password || 'Passwords do not match',
                })}
                error={errors.confirmPassword}
              />

              <div className="flex items-start gap-3">
                <input id="terms" type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300" {...register('terms')} />
                <label htmlFor="terms" className="text-sm text-gray-700">
                  I agree to the <Link href="/terms" className="underline text-gray-700">Terms</Link> and <Link href="/privacy" className="underline text-gray-700">Privacy Policy</Link>.
                </label>
              </div>

              <div className="flex items-start gap-3">
                <input id="marketing_opt_in" type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300" {...register('marketing_opt_in')} />
                <label htmlFor="marketing_opt_in" className="text-sm text-gray-700">Send me occasional tips & updates.</label>
              </div>

              {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          )}

          {phase !== 'existing' && (
            <p className="mt-10 text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="font-semibold text-brand-dark hover:text-brand">
                Sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

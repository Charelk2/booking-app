
'use client';

// Login form uses shared auth components and offers optional social login
// MFA verification is supported when the login response indicates it is required


import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import AuthInput from '@/components/auth/AuthInput';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';

interface LoginForm {
  email: string;
  password: string;
  remember: boolean;
}

export default function LoginPage() {
  const { login, verifyMfa, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [error, setError] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [rememberState, setRememberState] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { remember: false } });

  useEffect(() => {
    if (user) {
      const target = next || (user.user_type === 'service_provider' ? '/dashboard' : '/');
      router.replace(target);
    }
  }, [user, next, router]);

  const {
    register: registerMfa,
    handleSubmit: handleSubmitMfa,
    formState: { isSubmitting: mfaSubmitting },
  } = useForm<{ code: string }>();

  const onSubmit = async (data: LoginForm) => {
    try {
      const res = await login(data.email, data.password, data.remember);
      if (res && res.mfaRequired) {
        setError('');
        setMfaToken(res.token);
        setRememberState(data.remember);
        return;
      }
      // Defer redirect to useEffect so we can route by role
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Invalid email or password');
      }
    }
  };

  const onVerify = async ({ code }: { code: string }) => {
    if (!mfaToken) return;
    try {
      setError('');
      await verifyMfa(mfaToken, code, rememberState);
      // Defer redirect to useEffect to route by role
    } catch (err) {
      setError('Invalid verification code');
    }
  };

  return (
    <MainLayout>
      <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
            Sign in to your account
          </h2>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          {!mfaToken && (
            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <AuthInput
              id="email"
              type="email"
              label="Email address"
              autoComplete="email"
              registration={register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address',
                },
              })}
              error={errors.email}
            />

            <div>
              <AuthInput
                id="password"
                type="password"
                autoComplete="current-password"
                label="Password"
                registration={register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  },
                })}
                error={errors.password}
              />
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember"
                    type="checkbox"
                    aria-label="Remember me"
                    {...register('remember')}
                    className="h-4 w-4 rounded border-gray-300 text-brand-dark focus:ring-brand-dark"
                  />
                  <label htmlFor="remember" className="ml-2 block text-sm text-gray-900">
                    Remember me
                  </label>
                </div>
                <div className="text-sm">
                  <Link href="/forgot-password" className="font-semibold text-brand-dark hover:text-brand">
                    Forgot password?
                  </Link>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">{error}</h3>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full"
                analyticsEvent="login_submit"
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </div>

              <div className="pt-2">
                <SocialLoginButtons redirectPath={next || '/dashboard'} />
              </div>
            </form>
          )}
          {mfaToken && (
            <form className="space-y-6" onSubmit={handleSubmitMfa(onVerify)}>
              <AuthInput
                id="mfa-code"
                type="text"
                label="Verification code"
                registration={registerMfa('code', { required: 'Code is required' })}
                error={undefined}
              />
              {error && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">{error}</h3>
                    </div>
                  </div>
                </div>
              )}
              <div>
                <Button
                  type="submit"
                  disabled={mfaSubmitting}
                  className="w-full"
                  analyticsEvent="mfa_verify_submit"
                >
                  {mfaSubmitting ? 'Verifying...' : 'Verify'}
                </Button>
              </div>
            </form>
          )}

          <p className="mt-10 text-center text-sm text-gray-500">
            Not a member?{' '}
            <Link
              href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}
              className="font-semibold leading-6 text-brand-dark hover:text-brand"
            >
              Sign up now
            </Link>
          </p>
        </div>
      </div>
    </MainLayout>
  );
} 

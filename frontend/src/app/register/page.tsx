'use client';

import toast from 'react-hot-toast';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import AuthInput from '@/components/auth/AuthInput';
import { User } from '@/types';

interface RegisterForm extends Omit<User, 'id' | 'is_active' | 'is_verified'> {
  password: string;
  confirmPassword: string;
}

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [error, setError] = useState('');
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RegisterForm>();

  const password = watch('password', '');

  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const onSubmit = async (data: RegisterForm) => {
    try {
      const { confirmPassword, ...userData } = data;
      void confirmPassword;
      await registerUser(userData);
      toast.success('Registration successful! Check your email to verify.');
      router.push('/confirm-email');
    } catch (err: unknown) {
      console.error('Registration error:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Registration failed. Please try again.';
      setError(message);
    }
  };

  return (
    <MainLayout>
      <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
            Create your account
          </h2>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
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

            <AuthInput
              id="first_name"
              type="text"
              autoComplete="given-name"
              label="First name"
              registration={register('first_name', { required: 'First name is required' })}
              error={errors.first_name}
            />

            <AuthInput
              id="last_name"
              type="text"
              autoComplete="family-name"
              label="Last name"
              registration={register('last_name', { required: 'Last name is required' })}
              error={errors.last_name}
            />

            <AuthInput
              id="phone_number"
              type="tel"
              autoComplete="tel"
              placeholder="+27 82 123 4567"
              label="Phone number"
              registration={register('phone_number', {
                required: 'Phone number is required',
                pattern: {
                  value: /^\+?[0-9\s-]{10,}$/,
                  message: 'Please enter a valid phone number',
                },
              })}
              error={errors.phone_number}
            />

            <div>
              <label htmlFor="user_type" className="block text-sm font-medium leading-6 text-gray-900">
                I am a
              </label>
              <div className="mt-2">
                <select
                  id="user_type"
                  {...register('user_type', { required: 'Please select your role' })}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-brand-dark sm:text-sm sm:leading-6"
                >
                  <option value="">Select role</option>
                  <option value="service_provider">Service Provider</option>
                  <option value="client">Client</option>
                </select>
                {errors.user_type && (
                  <p className="mt-2 text-sm text-red-600">{errors.user_type.message}</p>
                )}
              </div>
            </div>

            <div>
              <AuthInput
                id="password"
                type="password"
                autoComplete="new-password"
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
              {password && (
                <>
                  <div className="mt-2 h-2 w-full rounded bg-gray-200">
                    <div
                      className={`h-full rounded ${
                        ['bg-red-500', 'bg-yellow-500', 'bg-brand', 'bg-green-600'][Math.max(getPasswordStrength(password) - 1, 0)]
                      }`}
                      style={{ width: `${(getPasswordStrength(password) / 4) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-sm text-gray-700">
                    {['Weak', 'Fair', 'Good', 'Strong'][Math.max(getPasswordStrength(password) - 1, 0)]}
                  </p>
                </>
              )}
            </div>

            <AuthInput
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              label="Confirm password"
              registration={register('confirmPassword', {
                required: 'Please confirm your password',
                validate: value => value === password || 'Passwords do not match',
              })}
              error={errors.confirmPassword}
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
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Creating account...' : 'Create account'}
              </Button>
            </div>
          </form>

          <p className="mt-10 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link
              href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}
              className="font-semibold leading-6 text-brand-dark hover:text-brand"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </MainLayout>
  );
} 
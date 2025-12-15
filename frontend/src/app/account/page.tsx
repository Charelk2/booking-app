'use client';

import MainLayout from '@/components/layout/MainLayout';
import { Spinner } from '@/components/ui';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Section from '@/components/ui/Section';
import TextInput from '@/components/ui/TextInput';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import PhoneNumberField from '@/components/auth/PhoneNumberField';
import { useAuth } from '@/contexts/AuthContext';
import { forgotPassword, logoutAll, requestEmailChange, updateMyAccount } from '@/lib/api';
import Link from 'next/link';
import {
  ArrowDownTrayIcon,
  TrashIcon,
  PhotoIcon,
  ShieldCheckIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUser, logout } = useAuth();

  const initials = useMemo(() => {
    const f = (user?.first_name || '').trim();
    const l = (user?.last_name || '').trim();
    const i1 = f ? f[0] : '';
    const i2 = l ? l[0] : '';
    return (i1 + i2).toUpperCase() || 'B';
  }, [user?.first_name, user?.last_name]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState<string | undefined>(undefined);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [requestingEmailChange, setRequestingEmailChange] = useState(false);
  const [devConfirmLink, setDevConfirmLink] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setFirstName(String(user.first_name || ''));
    setLastName(String(user.last_name || ''));
    setPhoneNumber(user.phone_number ? String(user.phone_number) : undefined);
    setMarketingOptIn(Boolean(user.marketing_opt_in));
  }, [user]);

  if (authLoading) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="flex items-center gap-3 text-gray-700">
            <Spinner />
            <span>Loading account…</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-2xl px-4 py-10">
          <Section
            title="Account"
            subtitle="Sign in to manage your profile, security, and privacy settings."
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-gray-700">
                You’re not signed in.
              </p>
              <Button
                onClick={() => {
                  const next = encodeURIComponent('/account');
                  router.push(`/auth?intent=login&next=${next}`);
                }}
              >
                Sign in
              </Button>
            </div>
          </Section>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar
              src={user.profile_picture_url}
              initials={initials}
              alt="Profile picture"
              size={56}
              className="ring-2 ring-brand/10"
            />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Account</h1>
              <p className="text-sm text-gray-700">
                Manage your profile, preferences, and security.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push('/account/profile-picture')}
          >
            <span className="inline-flex items-center gap-2">
              <PhotoIcon className="h-4 w-4" />
              Change photo
            </span>
          </Button>
        </div>

        <Section title="Profile" subtitle="Keep your details up to date for bookings and receipts.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
            <TextInput
              label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
            <div className="sm:col-span-2">
              <PhoneNumberField
                label="Phone number"
                value={phoneNumber}
                onChange={(v) => setPhoneNumber(v)}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-gray-600">
              Your email is managed separately.
            </p>
            <Button
              isLoading={savingProfile}
              onClick={async () => {
                setSavingProfile(true);
                try {
                  await updateMyAccount({
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    phone_number: (phoneNumber || '').trim() || null,
                  });
                  await refreshUser?.();
                  toast.success('Profile updated.');
                } catch (e: any) {
                  toast.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || e?.message || 'Update failed.');
                } finally {
                  setSavingProfile(false);
                }
              }}
            >
              Save changes
            </Button>
          </div>
        </Section>

        <Section
          title="Email"
          subtitle="Changing your email requires confirmation via a link sent to the new address."
        >
          <div className="grid gap-4">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Current email</p>
                <p className="mt-1 text-sm text-gray-700">{user.email}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Status</p>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {user.is_verified ? 'Verified' : 'Not verified'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <TextInput
                  label="New email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div className="flex items-end">
                <Button
                  fullWidth
                  isLoading={requestingEmailChange}
                  onClick={async () => {
                    const v = newEmail.trim();
                    if (!v) {
                      toast.error('Enter a new email address.');
                      return;
                    }
                    setRequestingEmailChange(true);
                    setDevConfirmLink(null);
                    try {
                      const res = await requestEmailChange(v);
                      setNewEmail('');
                      setDevConfirmLink(res.data.confirm_link || null);
                      toast.success(res.data.message || 'Confirmation link sent.');
                    } catch (e: any) {
                      toast.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || e?.message || 'Request failed.');
                    } finally {
                      setRequestingEmailChange(false);
                    }
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <EnvelopeIcon className="h-4 w-4" />
                    Send link
                  </span>
                </Button>
              </div>
            </div>

            {devConfirmLink ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Dev mode link</p>
                <a className="break-all underline" href={devConfirmLink}>
                  {devConfirmLink}
                </a>
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Preferences" subtitle="Control what updates you receive from Booka.">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Product updates and launch offers
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Get early access announcements, feature updates, and exclusive offers.
              </p>
            </div>
            <ToggleSwitch
              checked={marketingOptIn}
              onChange={async (next) => {
                if (savingPrefs) return;
                setSavingPrefs(true);
                setMarketingOptIn(next);
                try {
                  await updateMyAccount({ marketing_opt_in: next });
                  await refreshUser?.();
                  toast.success(next ? 'Subscribed.' : 'Unsubscribed.');
                } catch (e: any) {
                  setMarketingOptIn((prev) => !prev);
                  toast.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || e?.message || 'Update failed.');
                } finally {
                  setSavingPrefs(false);
                }
              }}
            />
          </div>
        </Section>

        <Section title="Security" subtitle="Keep your account protected.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/security"
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300"
            >
              <div className="flex items-center gap-3">
                <ShieldCheckIcon className="h-5 w-5 text-gray-700" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Security settings</p>
                  <p className="mt-1 text-xs text-gray-600">2FA and passkeys</p>
                </div>
              </div>
              <span className="text-sm text-gray-600">Manage</span>
            </Link>

            <button
              type="button"
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300"
              onClick={async () => {
                try {
                  await forgotPassword(user.email);
                  toast.success('Password reset email sent (if supported for your account).');
                } catch (e: any) {
                  toast.error(e?.response?.data?.detail || e?.message || 'Request failed.');
                }
              }}
            >
              <div>
                <p className="text-sm font-medium text-gray-900">Change password</p>
                <p className="mt-1 text-xs text-gray-600">Send a password reset email</p>
              </div>
              <span className="text-sm text-gray-600">Send</span>
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-gray-600">
              Logging out all devices will revoke sessions everywhere.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await logoutAll();
                } catch {}
                logout();
              }}
            >
              Log out all devices
            </Button>
          </div>
        </Section>

        <Section title="Data & privacy">
          <div className="grid gap-3 sm:grid-cols-2" data-testid="account-actions">
            <Link
              href="/account/export"
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300"
            >
              <div className="flex items-center gap-3">
                <ArrowDownTrayIcon className="h-5 w-5 text-gray-700" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Export your data</p>
                  <p className="mt-1 text-xs text-gray-600">Download a JSON export</p>
                </div>
              </div>
              <span className="text-sm text-gray-600">Export</span>
            </Link>

            <Link
              href="/account/delete"
              className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-white p-4 hover:border-red-300"
            >
              <div className="flex items-center gap-3">
                <TrashIcon className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Delete account</p>
                  <p className="mt-1 text-xs text-gray-600">Permanently remove your data</p>
                </div>
              </div>
              <span className="text-sm text-gray-600">Delete</span>
            </Link>
          </div>
        </Section>
      </div>
    </MainLayout>
  );
}

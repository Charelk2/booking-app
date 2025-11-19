'use client';

import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { apiUrl } from '@/lib/api';

type ClientProfileResponse = {
  user: {
    id: number;
    first_name: string;
    last_name: string;
    profile_picture_url?: string | null;
    member_since_year?: number | null;
  };
  stats: {
    completed_events: number;
    cancelled_events: number;
    avg_rating: number | null;
    reviews_count: number;
  };
  verifications: {
    email_verified: boolean;
    phone_verified: boolean;
    payment_verified: boolean;
  };
  reviews: Array<{
    id: number;
    rating: number;
    comment: string;
    created_at: string;
    provider?: { id: number; business_name?: string | null; city?: string | null };
  }>;
};

function SimpleClientProfile({ clientId }: { clientId: number }) {
  const [profile, setProfile] = useState<ClientProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl(`/api/v1/users/${clientId}/profile`), {
          credentials: 'include',
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error('You must be signed in to view this client profile.');
          }
          throw new Error('Failed to load client profile.');
        }
        const data = (await res.json()) as ClientProfileResponse;
        if (!cancelled) {
          setProfile(data);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load client profile.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    if (clientId > 0) {
      void fetchProfile();
    } else {
      setLoading(false);
      setProfile(null);
    }
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-gray-600">Loading client profile…</p>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Client profile unavailable</h1>
        <p className="text-sm text-gray-600">{error || 'We couldn’t load this client’s profile right now.'}</p>
      </main>
    );
  }

  const name =
    `${profile.user.first_name || ''} ${profile.user.last_name || ''}`.trim() || 'Client';

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header className="flex items-center gap-4">
        {profile.user.profile_picture_url ? (
          // Keep avatar minimal for now; this can be swapped to SafeImage later.
          <img
            src={profile.user.profile_picture_url}
            alt={name}
            className="h-16 w-16 rounded-full object-cover shadow-sm"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-gray-900 text-white flex items-center justify-center text-xl font-semibold shadow-sm">
            {(name || 'C').charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{name}</h1>
          {profile.user.member_since_year && (
            <p className="text-xs text-gray-500">
              Member since {profile.user.member_since_year}
            </p>
          )}
        </div>
      </header>

      <section className="grid grid-cols-3 gap-3 rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-3 shadow-sm text-center text-sm">
        <div>
          <p className="font-semibold text-gray-900">
            {profile.stats.avg_rating != null
              ? profile.stats.avg_rating.toFixed(1)
              : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {profile.stats.reviews_count} review
            {profile.stats.reviews_count !== 1 ? 's' : ''}
          </p>
        </div>
        <div>
          <p className="font-semibold text-gray-900">
            {profile.stats.completed_events}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">completed events</p>
        </div>
        <div>
          <p className="font-semibold text-gray-900">
            {profile.stats.cancelled_events}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">cancellations</p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <p className="text-xs font-semibold text-gray-900 mb-2">Reviews from providers</p>
        {profile.reviews.length === 0 ? (
          <p className="text-xs text-gray-500">
            No provider reviews yet. Completed bookings will show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {profile.reviews.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-900">
                    {r.provider?.business_name || 'Service provider'}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                {r.comment && (
                  <p className="text-[12px] leading-snug text-gray-700">
                    {r.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function ClientProfilePage({ params }: { params: { id: string } }) {
  const idNum = Number(params.id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return (
      <MainLayout>
        <main className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Client not found</h1>
          <p className="text-sm text-gray-600">
            The client profile you’re looking for does not exist.
          </p>
        </main>
      </MainLayout>
    );
  }
  return (
    <MainLayout>
      <SimpleClientProfile clientId={idNum} />
    </MainLayout>
  );
}

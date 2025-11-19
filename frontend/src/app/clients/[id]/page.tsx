`use client`;

import React, { useEffect, useRef, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { apiUrl } from '@/lib/api';
import { ChevronLeftIcon, ChevronRightIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

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

function ReviewCard({ review }: { review: ClientProfileResponse['reviews'][number] }) {
  const providerName = review.provider?.business_name || 'Service provider';
  const providerLocation = review.provider?.city || '';
  const dateLabel = new Date(review.created_at).toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const initial = providerName.charAt(0).toUpperCase();
  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center space-x-4">
        <div className="h-10 w-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold shadow-sm">
          {initial}
        </div>
        <div>
          <p className="font-semibold text-gray-900">
            {providerName}
          </p>
          {providerLocation && (
            <p className="text-sm text-gray-500">
              {providerLocation}
            </p>
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">
          {dateLabel}
        </p>
        {review.comment && (
          <p className="mt-2 text-gray-700 leading-relaxed">
            {review.comment}
          </p>
        )}
      </div>
    </div>
  );
}

function ReviewsCarousel({
  reviews,
  firstName,
}: {
  reviews: ClientProfileResponse['reviews'];
  firstName: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.offsetWidth / 2;
    const target = dir === 'left' ? el.scrollLeft - amount : el.scrollLeft + amount;
    el.scrollTo({ left: target, behavior: 'smooth' });
  };

  if (!reviews.length) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-900 mb-1">
          Reviews from providers
        </p>
        <p className="text-xs text-gray-500">
          No provider reviews yet. Completed bookings will show up here.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          What providers are saying about {firstName}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="p-1.5 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
            aria-label="Scroll reviews left"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="p-1.5 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-gray-300"
            aria-label="Scroll reviews right"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 -mb-2 scrollbar-hide no-scrollbar snap-x snap-mandatory"
      >
        {reviews.map((r) => (
          <div
            key={r.id}
            className="flex-shrink-0 w-80 md:w-[calc(33.33%-1rem)] snap-start rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <ReviewCard review={r} />
          </div>
        ))}
      </div>
    </section>
  );
}

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
  const firstName = profile.user.first_name || name.split(' ')[0] || 'This client';
  const memberSince = profile.user.member_since_year;
  const nowYear = new Date().getFullYear();
  const yearsOnBooka =
    typeof memberSince === 'number' && memberSince > 2000 && memberSince <= nowYear
      ? nowYear - memberSince
      : null;
  const isVerified =
    profile.verifications.email_verified ||
    profile.verifications.phone_verified ||
    profile.verifications.payment_verified;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      {/* Header card */}
      <section className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-6 md:p-8">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          {/* Left: avatar + identity */}
          <div className="flex flex-col items-center md:items-start md:w-3/5 text-center md:text-left">
            <div className="relative mb-4">
              {profile.user.profile_picture_url ? (
                <img
                  src={profile.user.profile_picture_url}
                  alt={name}
                  className="h-24 w-24 md:h-28 md:w-28 rounded-full object-cover shadow-sm"
                />
              ) : (
                <div className="h-24 w-24 md:h-28 md:w-28 rounded-full bg-gray-900 text-white flex items-center justify-center text-2xl font-semibold shadow-sm">
                  {(name || 'C').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
              {firstName}
            </h1>
            {memberSince && (
              <p className="text-sm text-gray-500 mt-2">
                Member since {memberSince}
              </p>
            )}
            {isVerified && (
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                <ShieldCheckIcon className="h-4 w-4 text-emerald-500" />
                <span className="font-medium">Identity & payments verified</span>
              </div>
            )}
          </div>

          {/* Right: stats */}
          <div className="flex flex-col md:w-2/5 justify-center divide-y divide-gray-200 text-center md:text-left">
            <div className="pb-3">
              <p className="text-2xl font-bold text-gray-900 leading-none">
                {profile.stats.completed_events}
              </p>
              <p className="mt-1.5 text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                Completed events
              </p>
            </div>
            <div className="py-3">
              <p className="text-2xl font-bold text-gray-900 leading-none">
                {profile.stats.reviews_count}
              </p>
              <p className="mt-1.5 text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                Reviews
              </p>
            </div>
            <div className="pt-3">
              <p className="text-2xl font-bold text-gray-900 leading-none">
                {yearsOnBooka != null ? yearsOnBooka : '—'}
              </p>
              <p className="mt-1.5 text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                Years on Booka
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews carousel */}
      <ReviewsCarousel reviews={profile.reviews} firstName={firstName} />
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

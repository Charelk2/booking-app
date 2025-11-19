'use client';

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
    <main className="py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-16">
          {/* Left rail: sticky profile card */}
          <aside className="md:col-span-1">
            <div className="sticky top-28 self-start p-6 border border-gray-200 rounded-xl shadow-lg bg-white">
              <div className="flex gap-6">
                <div className="flex-shrink-0">
                  {profile.user.profile_picture_url ? (
                    <img
                      src={profile.user.profile_picture_url}
                      alt={firstName}
                      className="h-28 w-28 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-28 w-28 rounded-full bg-gray-900 text-white flex items-center justify-center text-3xl font-bold">
                      {(firstName || 'C').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <h1 className="text-3xl font-bold mt-4 text-gray-900">
                    {firstName}
                  </h1>
                  {/* We do not currently store client location, so omit it. */}
                  {memberSince && (
                    <p className="text-gray-500 mt-1">
                      Member since {memberSince}
                    </p>
                  )}
                </div>
                <div className="mt-2 space-y-4">
                  <div>
                    <p className="font-bold text-gray-900 text-lg">
                      {profile.stats.completed_events}
                    </p>
                    <p className="text-sm text-gray-600">
                      Completed events
                    </p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-lg">
                      {profile.stats.reviews_count}
                    </p>
                    <p className="text-sm text-gray-600">
                      Reviews
                    </p>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-lg">
                      {yearsOnBooka != null ? yearsOnBooka : '—'}
                    </p>
                    <p className="text-sm text-gray-600">
                      Years on Booka
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Right rail: about + identity verified */}
          <div className="md:col-span-2 space-y-12">
            <section className="mt-6">
              <h2 className="text-2xl font-semibold text-gray-900">
                About {firstName}
              </h2>
              {isVerified && (
                <div className="mt-4 flex items-center space-x-3">
                  <ShieldCheckIcon className="h-4 w-4 text-gray-800" />
                  <span className="font-medium text-gray-700 underline">
                    Identity &amp; payments verified
                  </span>
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <ReviewsCarousel reviews={profile.reviews} firstName={firstName} />
        </div>
      </div>
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

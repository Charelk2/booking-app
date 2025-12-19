'use client';

import React, { useEffect, useRef, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { apiUrl } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import { formatCityRegion } from '@/lib/shared/mappers/location';
import { ChevronLeft, ChevronRight, ShieldCheck, Star, MapPin } from 'lucide-react';

// --- Types ---
type ClientProfileResponse = {
  user: {
    id: number;
    first_name: string;
    last_name: string;
    profile_picture_url?: string | null;
    organization?: string | null;
    job_title?: string | null;
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
    provider?: {
      id: number;
      business_name?: string | null;
      profile_picture_url?: string | null;
      location?: string | null;
      city?: string | null;
    };
  }>;
};

// --- Sub-components ---

function StatItem({ count, label }: { count: string | number; label: string }) {
  return (
    <div className="flex flex-col border-b border-gray-100 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
      <span className="text-xl font-bold text-gray-900">{count}</span>
      <span className="text-[10px] uppercase tracking-wider font-medium text-gray-500">
        {label}
      </span>
    </div>
  );
}

function ReviewCard({ review }: { review: ClientProfileResponse['reviews'][number] }) {
  const providerName = review.provider?.business_name || 'Service provider';
  const rawLocation =
    review.provider?.location || review.provider?.city || '';
  const providerLocation = rawLocation
    ? formatCityRegion(rawLocation) || rawLocation
    : '';
  const dateLabel = new Date(review.created_at).toLocaleDateString('en', {
    month: 'long',
    year: 'numeric',
  });
  const initial = providerName.charAt(0).toUpperCase();
  const avatarUrl = review.provider?.profile_picture_url
    ? getFullImageUrl(review.provider.profile_picture_url)
    : null;

  return (
    <div className="min-w-[300px] md:min-w-[400px] snap-start bg-white rounded-2xl border border-gray-200 p-6 flex flex-col h-full transition-shadow hover:shadow-md">
      {/* Review Header */}
      <div className="flex items-center mb-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={providerName}
            className="w-12 h-12 rounded-full object-cover mr-4 border border-gray-100"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mr-4 text-sm font-bold">
            {initial}
          </div>
        )}
        <div>
          <h4 className="font-semibold text-gray-900 text-base">{providerName}</h4>
          {providerLocation && (
            <p className="text-sm text-gray-500">{providerLocation}</p>
          )}
        </div>
      </div>

      {/* Review Content */}
      <div className="flex-grow">
        {/* Date moved above stars */}
        <p className="text-xs text-gray-500 font-medium mb-1">{dateLabel}</p>

        <div className="flex items-center mb-3 space-x-1">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={`w-3.5 h-3.5 ${
                i < Math.round(review.rating) ? 'text-black fill-black' : 'text-gray-300'
              }`}
            />
          ))}
        </div>
        
        {review.comment && (
          <p className="text-gray-700 text-[15px] leading-relaxed line-clamp-4">
            &ldquo;{review.comment}&rdquo;
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
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [reviews]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 420; 
    el.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
    setTimeout(checkScroll, 400);
  };

  if (!reviews.length) {
    return (
      <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100 text-center">
        <Star className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-900 font-medium">No reviews yet</p>
        <p className="text-gray-500 text-sm">
          Once {firstName} completes a booking, provider reviews will appear here.
        </p>
      </div>
    );
  }

  return (
    <section className="py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          What providers are saying about {firstName}
        </h2>
        <div className="hidden md:flex space-x-3">
          <button
            type="button"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={`p-2.5 rounded-full border transition-colors duration-200 ${
              !canScrollLeft
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-gray-800 text-gray-800 hover:bg-gray-50'
            }`}
            aria-label="Scroll reviews left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={`p-2.5 rounded-full border transition-colors duration-200 ${
              !canScrollRight
                ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                : 'border-gray-800 text-gray-800 hover:bg-gray-50'
            }`}
            aria-label="Scroll reviews right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex overflow-x-auto snap-x snap-mandatory space-x-5 pb-6 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' as any }}
      >
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} />
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
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
           <div className="h-12 w-12 bg-gray-200 rounded-full mb-4"></div>
           <p className="text-gray-400 font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Profile Unavailable</h1>
        <p className="text-gray-500">{error || 'We couldn’t load this profile right now.'}</p>
      </div>
    );
  }

  const name =
    `${profile.user.first_name || ''} ${profile.user.last_name || ''}`.trim() || 'Client';
  const firstName = profile.user.first_name || name.split(' ')[0] || 'User';
  const clientSubtitle = (() => {
    const organization = String(profile.user.organization || '').trim();
    const jobTitle = String(profile.user.job_title || '').trim();
    const parts = [organization, jobTitle].filter(Boolean);
    return parts.length ? parts.join(' • ') : 'Client';
  })();
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
    <main className="py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* TOP SECTION: Card + About Info */}
        <div className="flex flex-col md:flex-row gap-10 lg:gap-24 mb-12">
          
          {/* 1. The Profile Card (Left) */}
          <div className="w-full md:w-[340px] flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-[0_6px_16px_rgba(0,0,0,0.12)] border border-gray-200 p-6 lg:p-8 overflow-hidden">
              <div className="flex gap-6 items-start">
                
                {/* Avatar Side */}
                <div className="flex flex-col items-center justify-center text-center w-1/2">
                  <div className="relative mb-3">
                    {profile.user.profile_picture_url ? (
                      <img
                        src={profile.user.profile_picture_url}
                        alt={firstName}
                        className="h-28 w-28 rounded-full object-cover shadow-sm"
                      />
                    ) : (
                      <div className="h-28 w-28 rounded-full bg-gray-900 text-white flex items-center justify-center text-4xl font-bold shadow-sm">
                        {firstName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {isVerified && (
                       <div className="absolute bottom-1 right-1 bg-rose-600 text-white p-1.5 rounded-full shadow-sm border-2 border-white">
                         <ShieldCheck size={14} strokeWidth={3} />
                       </div>
                    )}
                  </div>
                  <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-1">
                    {firstName}
                  </h1>
                  <p className="text-sm text-gray-500 font-medium">{clientSubtitle}</p>
                </div>

                {/* Stats Side */}
                <div className="w-1/2 flex flex-col justify-center space-y-2 pl-2">
                   <StatItem count={profile.stats.reviews_count} label="Reviews" />
                   <StatItem count={profile.stats.completed_events} label="Events" />
                   <StatItem count={yearsOnBooka ?? 1} label="Years active" />
                </div>
              </div>
            </div>
          </div>

          {/* 2. The "About" Section (Right) */}
          <div className="flex-grow flex flex-col justify-center">
            <h2 className="text-[32px] md:text-[40px] font-extrabold text-gray-900 mb-6">
              About {firstName}
            </h2>
            
            <div className="space-y-4">
              {isVerified && (
                <div className="flex items-start space-x-4">
                  <ShieldCheck className="w-6 h-6 text-gray-900 mt-0.5" />
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Identity verified</h3>
                    <p className="text-gray-500 text-sm mt-0.5">
                      {firstName} has verified their identity details with Booka.
                    </p>
                  </div>
                </div>
              )}
              
              {/* Location Placeholder */}
               <div className="flex items-start space-x-4">
                  <MapPin className="w-6 h-6 text-gray-900 mt-0.5" />
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Based in South Africa</h3>
                    <p className="text-gray-500 text-sm mt-0.5">
                      {(() => {
                        const firstProvider = profile.reviews[0]?.provider;
                        const raw =
                          firstProvider?.location ||
                          firstProvider?.city ||
                          '';
                        const formatted = raw ? formatCityRegion(raw) || raw : '';
                        return formatted
                          ? `Active in ${formatted}.`
                          : 'Active in major cities.';
                      })()}
                    </p>
                  </div>
                </div>
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION: Full Width Line */}
        <div className="border-t border-gray-200 my-10 w-full"></div>

        {/* BOTTOM SECTION: Full Width Reviews */}
        <div className="w-full">
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
        <main className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Client not found</h1>
          <p className="text-gray-500">
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

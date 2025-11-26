'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/solid';
import ServiceProviderCardCompact from '@/components/service-provider/ServiceProviderCardCompact';
import { getServiceProviders } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import type { ServiceProviderProfile, SearchParams } from '@/types';

interface ArtistsSectionProps {
  title: string;
  query?: Partial<SearchParams>;
  limit?: number;
  hideIfEmpty?: boolean;
  initialData?: ServiceProviderProfile[];
  deferUntilVisible?: boolean; // Reduce first-load API bursts by waiting until in-view
}

function CardSkeleton() {
  return (
    <div className="rounded-xl bg-white overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-gray-200" />
      <div className="p-3 space-y-1">
        <div className="h-3 bg-gray-200 rounded" />
        <div className="h-2.5 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function ArtistsSection({
  title,
  query = {},
  limit = 12,
  hideIfEmpty = false,
  initialData,
  deferUntilVisible = true,
}: ArtistsSectionProps) {
  const [artists, setArtists] = useState<ServiceProviderProfile[]>(initialData || []);
  const [loading, setLoading] = useState(!initialData || (initialData?.length ?? 0) === 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  // Defer fetching until the section becomes visible, unless we already have server-provided data
  const [shouldFetch, setShouldFetch] = useState(() => {
    if (initialData && initialData.length > 0) return false; // no need to fetch immediately
    return deferUntilVisible ? false : true;
  });

  const serializedQuery = useMemo(() => JSON.stringify(query), [query]);

  const updateScrollButton = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
  };

  // Observe visibility to avoid fetching offscreen sections on first load
  useEffect(() => {
    if (!deferUntilVisible) { setShouldFetch(true); return; }
    // If we already decided to fetch (or have data), do nothing
    if (shouldFetch) return;
    const el = sectionRef.current;
    if (!el) { setShouldFetch(true); return; }
    let observer: IntersectionObserver | null = null;
    try {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setShouldFetch(true);
          observer?.disconnect();
        }
      }, { root: null, rootMargin: '0px', threshold: 0.3 });
      observer.observe(el);
    } catch {
      // Older browsers: fetch after a small delay to avoid burst
      const t = setTimeout(() => setShouldFetch(true), 800);
      return () => clearTimeout(t);
    }
    return () => observer?.disconnect();
  }, [deferUntilVisible, shouldFetch]);

  useEffect(() => {
    let isMounted = true;
    // If we already have server-provided data, avoid refetching on hydrate.
    // This prevents duplicate load on first visit and reduces 503s from bursts.
    if ((initialData?.length ?? 0) > 0) {
      setLoading(false);
      return () => { isMounted = false; };
    }
    if (!shouldFetch) {
      return () => { isMounted = false; };
    }
    async function fetchArtists() {
      setLoading(true);
      let hasAnyResults = false;
      try {
        const params = JSON.parse(serializedQuery) as Record<string, unknown>;
        // Phase 1: minimal fields to hit backend fast path
        try {
          const fast = await getServiceProviders({
            ...(params as object),
            limit,
            fields: ['id','business_name','profile_picture_url'],
          });
          if (isMounted) {
            const next = fast.data.filter((a) => a.business_name);
            setArtists(next);
            hasAnyResults = next.length > 0;
            // As soon as we have minimal data, render cards instead of skeletons.
            if (next.length > 0) {
              setLoading(false);
            }
          }
        } catch {}

        // Phase 2: hydrate with full details (best‑effort)
        try {
          const full = await getServiceProviders({
            ...(params as object),
            limit,
            fields: [
              'id',
              'business_name',
              'profile_picture_url',
              'custom_subtitle',
              'hourly_rate',
              'price_visible',
              'rating',
              'rating_count',
              'location',
              'service_categories',
              'user.first_name',
              'user.last_name',
            ],
          });
          if (isMounted) {
            const next = full.data.filter((a) => a.business_name || a.user);
            setArtists(next);
            hasAnyResults = hasAnyResults || next.length > 0;
          }
        } catch {}
      } catch (err) {
        // Swallow noisy network errors to avoid console spam on first load
      } finally {
        if (isMounted) {
          // If we never managed to populate any artists (empty or failed),
          // stop showing skeletons so the "no providers" state can render.
          if (!hasAnyResults) {
            setLoading(false);
          }
        }
      }
    }
    fetchArtists();
    return () => {
      isMounted = false;
    };
  }, [serializedQuery, limit, initialData, shouldFetch]);

  useEffect(() => {
    updateScrollButton();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollButton, { passive: true });
    window.addEventListener('resize', updateScrollButton);
    return () => {
      el.removeEventListener('scroll', updateScrollButton);
      window.removeEventListener('resize', updateScrollButton);
    };
  }, [artists.length]);

  if (!loading && artists.length === 0 && hideIfEmpty) {
    return null;
  }

  const seeAllHref = `/search?${new URLSearchParams(query as Record<string, string>).toString()}`;
  const showSeeAll = artists.length === limit;

  return (
    <section ref={sectionRef as any} className="full-width mx-auto px-4 sm:px-6 lg:px-8 py-5">
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {showSeeAll && (
          <Link href={seeAllHref} className="text-sm text-brand hover:underline">
            See all
          </Link>
        )}
      </div>
      {loading ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="w-40 flex-shrink-0">
              <CardSkeleton />
            </div>
          ))}
        </div>
      ) : artists.length > 0 ? (
        <div className="relative">
          <div
            ref={scrollRef}
            data-testid="artists-scroll"
            className="flex gap-2 overflow-x-auto scroll-smooth pb-2 scrollbar-hide"
          >
            {artists.map((a) => {
              const name = a.business_name || `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`.trim();
              return (
                <ServiceProviderCardCompact
                  key={a.id}
                  serviceProviderId={a.id}
                  name={name}
                  subtitle={a.custom_subtitle || undefined}
                  imageUrl={
                    getFullImageUrl(a.profile_picture_url || a.portfolio_urls?.[0]) || undefined
                  }
                  price={
                    a.hourly_rate && a.price_visible ? Number(a.hourly_rate) : undefined
                  }
                  rating={a.rating ?? undefined}
                  ratingCount={a.rating_count ?? undefined}
                  location={a.location}
                  categories={a.service_categories}
                  href={`/service-providers/${a.id}`}
                  className="w-48 flex-shrink-0"
                />
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Next"
            className="absolute right-0 top-1 z-10 hidden -translate-y-1 rounded-full border bg-white p-2 opacity-50 shadow disabled:opacity-50 sm:block"
            disabled={!canScrollRight}
            onClick={() => scrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
          >
            <ChevronRightIcon className="h-2 w-2" />
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-700">No service providers found.</p>
      )}
    </section>
  );
}

'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, ChevronLeftIcon } from '@heroicons/react/24/solid';
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
    <div className="rounded-xl bg-white overflow-hidden border border-gray-100 shadow-sm">
      <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
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
  const sectionRef = useRef<HTMLElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Defer fetching until the section becomes visible, unless we already have server-provided data
  const [shouldFetch, setShouldFetch] = useState(() => {
    if (initialData && initialData.length > 0) return false;
    return !deferUntilVisible;
  });

  const serializedQuery = useMemo(() => JSON.stringify(query), [query]);

  // --- Scroll logic --------------------------------------------------------

  const checkScrollPosition = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1); // small buffer
  };

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.75; // scroll 75% of viewport
    el.scrollBy({
      left: direction === 'right' ? scrollAmount : -scrollAmount,
      behavior: 'smooth',
    });
  };

  // --- Visibility / defer fetching ----------------------------------------

  useEffect(() => {
    // If we already have server-provided data, never fetch or observe
    if ((initialData?.length ?? 0) > 0) return;

    if (!deferUntilVisible) {
      setShouldFetch(true);
      return;
    }

    if (shouldFetch) return;

    const el = sectionRef.current;
    if (!el) {
      setShouldFetch(true);
      return;
    }

    let observer: IntersectionObserver | null = null;

    try {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry && entry.isIntersecting) {
            setShouldFetch(true);
            observer?.disconnect();
          }
        },
        {
          root: null,
          rootMargin: '200px', // start a bit before entering viewport
          threshold: 0.1,
        },
      );

      observer.observe(el);
    } catch {
      // Fallback for very old browsers
      const t = setTimeout(() => setShouldFetch(true), 800);
      return () => clearTimeout(t);
    }

    return () => observer?.disconnect();
  }, [deferUntilVisible, shouldFetch, initialData?.length]);

  // --- Data fetching (two-phase: fast + full) ------------------------------

  useEffect(() => {
    let isMounted = true;

    // Avoid refetch on hydrate when we already have non-empty server data
    if ((initialData?.length ?? 0) > 0) {
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    if (!shouldFetch) {
      return () => {
        isMounted = false;
      };
    }

    async function fetchArtists() {
      setLoading(true);

      try {
        const params = JSON.parse(serializedQuery) as Record<string, unknown>;

        // Phase 1: fast path (minimal fields)
        try {
          const fast = await getServiceProviders({
            ...(params as object),
            limit,
            fields: ['id', 'business_name', 'profile_picture_url'],
          });

          if (isMounted) {
            const next = fast.data.filter((a) => a.business_name);
            if (next.length > 0) {
              setArtists(next);
            }
          }
        } catch {
          // Ignore fast-path errors, we'll try full-path next
        }

        // Phase 2: full hydration
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
            if (next.length > 0) {
              setArtists(next);
            }
          }
        } catch {
          // Best-effort hydration; fine to fail silently
        }
      } catch {
        // Swallow noisy network errors to avoid console spam on first load
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchArtists();

    return () => {
      isMounted = false;
    };
  }, [serializedQuery, limit, initialData, shouldFetch]);

  // --- Scroll listeners ----------------------------------------------------

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Ensure we start at the leftmost position (helps with snap quirks on mobile)
    el.scrollTo({ left: 0 });
    checkScrollPosition();

    el.addEventListener('scroll', checkScrollPosition, { passive: true });
    window.addEventListener('resize', checkScrollPosition);

    return () => {
      el.removeEventListener('scroll', checkScrollPosition);
      window.removeEventListener('resize', checkScrollPosition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artists.length]);

  // --- Early exit if empty + hideIfEmpty -----------------------------------

  if (!loading && artists.length === 0 && hideIfEmpty) {
    return null;
  }

  // --- See all URL (safe building of search params) ------------------------

  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, String(v)));
    } else {
      searchParams.set(key, String(value));
    }
  });
  const seeAllHref = `/search?${searchParams.toString()}`;
  const showSeeAll = artists.length === limit;

  // --- Render --------------------------------------------------------------

  return (
    <section
      ref={sectionRef as any}
      className="relative w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 group/section"
    >
      {/* Header */}
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h2>
        {showSeeAll && (
          <Link
            href={seeAllHref}
            className="text-sm font-semibold text-brand-dark hover:text-brand hover:underline underline-offset-4 decoration-2"
          >
            See all
          </Link>
        )}
      </div>

      <div className="relative">
        {/* Desktop navigation buttons */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 -ml-4 z-20 hidden lg:flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg border border-gray-100 text-gray-700 hover:text-brand-dark hover:scale-105 transition-all duration-200 focus:outline-none"
            aria-label="Previous providers"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        )}

        {canScrollRight && (
          <button
            type="button"
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 -mr-4 z-20 hidden lg:flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg border border-gray-100 text-gray-700 hover:text-brand-dark hover:scale-105 transition-all duration-200 focus:outline-none"
            aria-label="Next providers"
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
        )}

        {/* Scroll container */}
        <div
          ref={scrollRef}
          data-testid="artists-scroll"
          className="
            flex gap-4 overflow-x-auto pb-4
            snap-x snap-mandatory scrollbar-hide
            scroll-px-4 sm:scroll-px-0
          "
        >
          {loading ? (
            Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
              <div key={i} className="w-48 sm:w-56 flex-shrink-0 snap-start">
                <CardSkeleton />
              </div>
            ))
          ) : artists.length > 0 ? (
            artists.map((a) => {
              const name =
                a.business_name ||
                `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`.trim();

              return (
                <div key={a.id} className="w-48 sm:w-56 flex-shrink-0 snap-start">
                  <ServiceProviderCardCompact
                    serviceProviderId={a.id}
                    name={name}
                    subtitle={a.custom_subtitle || undefined}
                    imageUrl={
                      getFullImageUrl(a.profile_picture_url || a.portfolio_urls?.[0]) ||
                      undefined
                    }
                    price={
                      a.hourly_rate && a.price_visible ? Number(a.hourly_rate) : undefined
                    }
                    rating={a.rating ?? undefined}
                    ratingCount={a.rating_count ?? undefined}
                    location={a.location}
                    categories={a.service_categories}
                    href={`/service-providers/${a.id}`}
                    className="h-full"
                  />
                </div>
              );
            })
          ) : (
            <p className="text-sm text-slate-700">No service providers found.</p>
          )}
        </div>
      </div>
    </section>
  );
}

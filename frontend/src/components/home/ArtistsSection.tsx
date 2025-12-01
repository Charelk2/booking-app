'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ServiceProviderCardCompact from '@/components/service-provider/ServiceProviderCardCompact';
import { getServiceProviders, getCachedServiceProviders, prefetchServiceProviders } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import type { ServiceProviderProfile, SearchParams } from '@/types';

interface ArtistsSectionProps {
  title: string;
  query?: Partial<SearchParams>;
  limit?: number;
  hideIfEmpty?: boolean;
  initialData?: ServiceProviderProfile[];
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
}: ArtistsSectionProps) {
  const pathname = usePathname();
  const [artists, setArtists] = useState<ServiceProviderProfile[]>(initialData || []);
  const [loading, setLoading] = useState(() => !initialData);
  const scrollRef = useRef<HTMLDivElement>(null);

  const serializedQuery = useMemo(() => JSON.stringify(query), [query]);

  // Fetch data: fast minimal fields, then hydrate with full details
  useEffect(() => {
    // Guard against accidental mounts on non-home routes (e.g., prefetch/layout reuse)
    if (typeof window !== 'undefined' && pathname && pathname !== '/') {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // If we already have server-provided data, don't refetch on first render
    if (initialData && initialData.length > 0) {
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    async function fetchArtists() {
      setLoading(true);
      let hadFastResults = false;

      try {
        const params = JSON.parse(serializedQuery) as Record<string, unknown>;

        // Try cached payload first
        const cached = getCachedServiceProviders({ ...(params as object), limit });
        if (cached && cached.data?.length) {
          setArtists(cached.data.filter((a) => a.business_name));
          setLoading(false);
          // Best-effort background refresh to keep cache warm
          void prefetchServiceProviders({ ...(params as object), limit });
          return;
        }

        // Phase 1: fast-path (minimal fields for quick render)
        try {
          const fast = await getServiceProviders({
            ...(params as object),
            limit,
            fields: ['id', 'business_name', 'slug', 'profile_picture_url'],
          });

          if (isMounted) {
            const next = fast.data.filter((a) => a.business_name);
            if (next.length > 0) {
              setArtists(next);
              hadFastResults = true;
              // Hide skeletons as soon as we have something to show
              setLoading(false);
            }
          }
        } catch {
          // ignore fast-path errors; full-path will try next
        }

        // Phase 2: full details
        try {
          const full = await getServiceProviders({
            ...(params as object),
            limit,
            fields: [
              'id',
              'business_name',
              'slug',
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
            // If fast-path never produced anything, stop showing skeletons now
            if (!hadFastResults) {
              setLoading(false);
            }
          }
        } catch {
          if (isMounted && !hadFastResults) {
            setLoading(false);
          }
        }
      } catch {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchArtists();

    return () => {
      isMounted = false;
    };
  }, [serializedQuery, limit, initialData, pathname]);

  if (!loading && artists.length === 0 && hideIfEmpty) {
    return null;
  }

  // Build "See all" link safely
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

  return (
    <section className="relative w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">
          {title}
        </h2>
        {showSeeAll && (
          <Link
            href={seeAllHref}
            className="text-sm font-medium text-brand-dark hover:text-brand hover:underline underline-offset-4"
          >
            See all
          </Link>
        )}
      </div>

      {/* Horizontal scroll list (no arrows, mobile-friendly spacing) */}
      <div
        ref={scrollRef}
        data-testid="artists-scroll"
        className="
          flex gap-3 sm:gap-4 overflow-x-auto pb-3
          snap-x snap-mandatory scrollbar-hide
          px-1 sm:px-0
        "
      >
        {loading ? (
          Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
            <div
              key={i}
              className="
                flex-shrink-0
                w-[55vw] xs:w-56 sm:w-56
                snap-center sm:snap-start
              "
            >
              <CardSkeleton />
            </div>
          ))
        ) : artists.length > 0 ? (
          artists.map((a) => {
            const name =
              a.business_name ||
              `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`.trim();

            return (
              <div
                key={a.id}
                className="
                  flex-shrink-0
                  w-[55vw] xs:w-56 sm:w-56
                  snap-center sm:snap-start
                "
              >
                <ServiceProviderCardCompact
                  serviceProviderId={a.id}
                  name={name}
                  subtitle={a.custom_subtitle || undefined}
                  imageUrl={
                    getFullImageUrl(
                      a.profile_picture_url || a.portfolio_urls?.[0],
                    ) || undefined
                  }
                  price={
                    a.hourly_rate && a.price_visible
                      ? Number(a.hourly_rate)
                      : undefined
                  }
                  rating={a.rating ?? undefined}
                  ratingCount={a.rating_count ?? undefined}
                  location={a.location}
                  categories={a.service_categories}
                  href={`/${a.slug || a.id}`}
                  className="h-full"
                />
              </div>
            );
          })
        ) : (
          <p className="text-sm text-slate-700">No service providers found.</p>
        )}
      </div>
    </section>
  );
}

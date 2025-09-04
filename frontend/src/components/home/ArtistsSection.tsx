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
}: ArtistsSectionProps) {
  const [artists, setArtists] = useState<ServiceProviderProfile[]>(initialData || []);
  const [loading, setLoading] = useState(!initialData);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const serializedQuery = useMemo(() => JSON.stringify(query), [query]);

  const updateScrollButton = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
  };

  useEffect(() => {
    let isMounted = true;
    async function fetchArtists() {
      setLoading(true);
      try {
        const params = JSON.parse(serializedQuery) as Record<string, unknown>;
        const res = await getServiceProviders({ ...(params as object), limit });
        if (isMounted) {
          setArtists(res.data.filter((a) => a.business_name || a.user));
        }
      } catch (err) {
        console.error(err);
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
  }, [serializedQuery, limit]);

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
    <section className="full-width mx-auto px-4 sm:px-6 lg:px-8 py-5">
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
                  unoptimizedImage
                  price={
                    a.hourly_rate && a.price_visible ? Number(a.hourly_rate) : undefined
                  }
                  rating={a.rating ?? undefined}
                  ratingCount={a.rating_count ?? undefined}
                  location={a.location}
                  categories={a.service_categories}
                  href={`/service-providers/${a.id}`}
                  className="w-56 flex-shrink-0"
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
        <p>No service providers found.</p>
      )}
    </section>
  );
}

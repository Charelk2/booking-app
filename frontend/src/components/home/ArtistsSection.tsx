'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ChevronRightIcon, ChevronLeftIcon } from '@heroicons/react/24/solid'; // Added Left Icon
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
  deferUntilVisible?: boolean;
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
  
  // Scroll State
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  const [shouldFetch, setShouldFetch] = useState(() => {
    if (initialData && initialData.length > 0) return false;
    return !deferUntilVisible;
  });

  const serializedQuery = useMemo(() => JSON.stringify(query), [query]);

  // Enhanced Scroll Logic
  const checkScrollPosition = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 0);
    // Allow a small buffer (1px) for calculation errors
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  };

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.75; // Scroll 75% of view
    el.scrollBy({ 
      left: direction === 'right' ? scrollAmount : -scrollAmount, 
      behavior: 'smooth' 
    });
  };

  // Intersection Observer (Your existing logic is great, kept intact)
  useEffect(() => {
    if (!deferUntilVisible) { setShouldFetch(true); return; }
    if (shouldFetch) return;
    
    const el = sectionRef.current;
    if (!el) { setShouldFetch(true); return; }
    
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setShouldFetch(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px', threshold: 0.1 }); // Increased margin to fetch slightly before view
    
    observer.observe(el);
    return () => observer.disconnect();
  }, [deferUntilVisible, shouldFetch]);

  // Data Fetching (Kept your smart two-phase logic)
  useEffect(() => {
    let isMounted = true;
    if ((initialData?.length ?? 0) > 0) {
      setLoading(false);
      return;
    }
    if (!shouldFetch) return;

    async function fetchArtists() {
      setLoading(true);
      try {
        const params = JSON.parse(serializedQuery);
        // Phase 1: Fast Path
        const fast = await getServiceProviders({ ...params, limit, fields: ['id','business_name','profile_picture_url'] });
        if (isMounted && fast.data.length > 0) {
          setArtists(fast.data);
          setLoading(false);
        }

        // Phase 2: Hydration (Silent update)
        const full = await getServiceProviders({ 
            ...params, 
            limit, 
            fields: ['id','business_name','profile_picture_url','custom_subtitle','hourly_rate','price_visible','rating','rating_count','location','service_categories','user.first_name','user.last_name'] 
        });
        
        if (isMounted && full.data.length > 0) {
            setArtists(full.data);
        }
      } catch (err) {
        // Silent fail is fine here
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchArtists();
    return () => { isMounted = false; };
  }, [serializedQuery, limit, initialData, shouldFetch]);

  // Setup Scroll Listeners
  useEffect(() => {
    checkScrollPosition();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScrollPosition, { passive: true });
    window.addEventListener('resize', checkScrollPosition);
    return () => {
      el.removeEventListener('scroll', checkScrollPosition);
      window.removeEventListener('resize', checkScrollPosition);
    };
  }, [artists.length]);

  if (!loading && artists.length === 0 && hideIfEmpty) return null;

  const seeAllHref = `/search?${new URLSearchParams(query as Record<string, string>).toString()}`;

  return (
    <section ref={sectionRef as any} className="relative w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 group/section">
      
      {/* Header */}
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h2>
        {artists.length === limit && (
          <Link href={seeAllHref} className="text-sm font-semibold text-brand-dark hover:text-brand hover:underline underline-offset-4 decoration-2">
            See all
          </Link>
        )}
      </div>

      <div className="relative group">
        
        {/* Navigation Buttons - Only show on desktop, absolutely positioned */}
        {/* LEFT BUTTON */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 -ml-4 z-20 hidden lg:flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg border border-gray-100 text-gray-700 hover:text-brand-dark hover:scale-105 transition-all duration-200 focus:outline-none"
            aria-label="Previous items"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        )}

        {/* RIGHT BUTTON */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 -mr-4 z-20 hidden lg:flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg border border-gray-100 text-gray-700 hover:text-brand-dark hover:scale-105 transition-all duration-200 focus:outline-none"
            aria-label="Next items"
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
        )}

        {/* Scroll Container */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-48 sm:w-56 flex-shrink-0 snap-start">
                <CardSkeleton />
              </div>
            ))
          ) : (
            artists.map((a) => {
              const name = a.business_name || `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`.trim();
              return (
                <div key={a.id} className="w-48 sm:w-56 flex-shrink-0 snap-start">
                    <ServiceProviderCardCompact
                        serviceProviderId={a.id}
                        name={name}
                        subtitle={a.custom_subtitle || undefined}
                        imageUrl={getFullImageUrl(a.profile_picture_url || a.portfolio_urls?.[0]) || undefined}
                        price={a.hourly_rate && a.price_visible ? Number(a.hourly_rate) : undefined}
                        rating={a.rating ?? undefined}
                        ratingCount={a.rating_count ?? undefined}
                        location={a.location}
                        categories={a.service_categories}
                        href={`/service-providers/${a.id}`}
                        // Remove width from compact card itself if it handles its own sizing, 
                        // otherwise let the wrapper div control width.
                        className="h-full" 
                    />
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
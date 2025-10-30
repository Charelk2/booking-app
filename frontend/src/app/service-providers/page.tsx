'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { getServiceProviders, getCachedServiceProviders, prefetchServiceProviders, type PriceBucket } from '@/lib/api';
import useServiceCategories from '@/hooks/useServiceCategories';
import { getFullImageUrl } from '@/lib/utils';
import type { ServiceProviderProfile } from '@/types';
import ServiceProviderCardCompact from '@/components/service-provider/ServiceProviderCardCompact';
import { ServiceProvidersPageHeader } from '@/components/service-provider/ServiceProviderServiceCard';
import { SLIDER_MIN, SLIDER_MAX } from '@/lib/filter-constants';
import { useDebounce } from '@/hooks/useDebounce';
import { updateQueryParams } from '@/lib/urlParams';
import { Spinner } from '@/components/ui';

// ──────────────────────────────────────────────────────────────────────────────
// Pluralization helpers
// ──────────────────────────────────────────────────────────────────────────────
function pluralizeLastWord(label: string): string {
  // Exact-name exceptions first
  const exceptions: Record<string, string> = {
    DJ: 'DJs',
    MC: 'MCs',
    'MC / Host': 'MCs / Hosts',
    'MC/Host': 'MCs/Hosts',
  };
  if (exceptions[label]) return exceptions[label];

  // Split so multi-word labels like "Sound Engineer" → "Sound Engineers"
  const parts = label.split(' ');
  const last = parts.pop()!;
  const w = last;

  const endsWith = (s: string) => w.toLowerCase().endsWith(s);
  let plural = w;

  if (/[sxz]$/i.test(w) || endsWith('ch') || endsWith('sh')) {
    plural = w + 'es'; // e.g., "Coach" → "Coaches"
  } else if (/[^\Waeiou]y$/i.test(w)) {
    plural = w.slice(0, -1) + 'ies'; // consonant + y → ies
  } else {
    plural = w + 's'; // default
  }

  return [...parts, plural].join(' ');
}

function pluralizeServiceLabel(label?: string) {
  return label ? pluralizeLastWord(label) : '';
}

// The category page previously used `react-window` to render each provider as a
// full-width row. This looked inconsistent with the compact cards shown on the
// homepage and resulted in a visually jarring full-screen layout. Since the
// lists are relatively small, a simple flexbox grid is sufficient and lets us
// reuse the same compact card layout for consistency across pages.

export default function ServiceProvidersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [artists, setArtists] = useState<ServiceProviderProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Store the selected category as a UI slug (e.g. "dj") so we can map it
  // to the backend service name whenever querying the API.
  const categories = useServiceCategories();
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState<string | undefined>(undefined);
  const [when, setWhen] = useState<Date | null>(null);
  const [minPrice, setMinPrice] = useState<number>(SLIDER_MIN);
  const [maxPrice, setMaxPrice] = useState<number>(SLIDER_MAX);
  const [priceDistribution, setPriceDistribution] = useState<PriceBucket[]>([]);

  // Avoid fetching artists until all filters (including category from the
  // URL) have been parsed. This prevents an initial unfiltered request that
  // briefly shows providers from other categories.
  const [filtersReady, setFiltersReady] = useState(false);

  const debouncedMinPrice = useDebounce(minPrice, 300);
  const debouncedMaxPrice = useDebounce(maxPrice, 300);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;

  // Derived backend service name for the selected UI category.
  const serviceName = category
    ? categories.find((c) => c.value === category)?.label
    : undefined;

  useEffect(() => {
    // ``category`` may arrive either as a backend service name ("DJ") or
    // as a UI slug ("dj"). Normalize both forms to the UI slug so the rest of
    // the page logic can derive the backend name from the loaded categories.
    if (!categories.length) return;

    let value = searchParams.get('category') || undefined;
    if (!value) {
      const match = pathname.match(/\/(?:service-providers\/category|category)\/([^/?]+)/);
      if (match) {
        value = match[1];
      }
    }

    let uiValue: string | undefined;
    if (value) {
      const bySlug = categories.find((c) => c.value === value);
      if (bySlug) {
        uiValue = bySlug.value;
      } else {
        const byName = categories.find((c) => c.label === value);
        uiValue = byName?.value;
      }
    }

    setCategory(uiValue);
    setLocation(searchParams.get('location') || '');

    const w = searchParams.get('when');
    if (w) {
      try {
        const parsed = parseISO(w);
        const formatted = format(parsed, 'yyyy-MM-dd');
        const normalized = parseISO(formatted);
        setWhen(isValid(normalized) ? normalized : null);
      } catch {
        setWhen(null);
      }
    } else {
      setWhen(null);
    }

    setSort(searchParams.get('sort') || undefined);
    setMinPrice(searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : SLIDER_MIN);
    setMaxPrice(searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : SLIDER_MAX);
    setFiltersReady(true);
  }, [searchParams, pathname, categories]);

  const fetchArtists = useCallback(
    async ({ append = false, pageNumber }: { append?: boolean; pageNumber: number }) => {
      setLoading(true);
      setError(null);
      try {
        // Quick show from cache if present
        const cacheParams = {
          category: serviceName,
          location: location || undefined,
          when: when || undefined,
          sort,
          minPrice: debouncedMinPrice,
          maxPrice: debouncedMaxPrice,
          page: pageNumber,
          limit: LIMIT,
          fields: [
            'id','business_name','custom_subtitle','profile_picture_url','portfolio_urls','hourly_rate','price_visible','rating','rating_count','location','service_categories','service_price','user.first_name','user.last_name'
          ] as string[],
        };

        const cached = getCachedServiceProviders(cacheParams);
        if (cached && !append) {
          const filteredCached = cached.data.filter((a: ServiceProviderProfile) => {
            if (serviceName === 'DJ') {
              const business = a.business_name?.trim().toLowerCase();
              const fullName = `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`
                .trim()
                .toLowerCase();
              return !!business && business !== fullName;
            }
            return !!(a.business_name || a.user);
          });
          setHasMore(filteredCached.length === LIMIT);
          setArtists(filteredCached as any);
          setPriceDistribution(cached.price_distribution || []);
        }

        // Fetch list first (cacheable in backend). Price histogram is fetched lazily below.
        const res = await getServiceProviders({ ...cacheParams });

        // Filter client-side to guard against any backend responses that
        // include artists from other service categories. For the DJ category,
        // only include profiles with a business name so personal artist names
        // never appear.
        const filtered = res.data.filter((a: ServiceProviderProfile) => {
          if (serviceName === 'DJ') {
            const business = a.business_name?.trim().toLowerCase();
            const fullName = `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`
              .trim()
              .toLowerCase();
            return !!business && business !== fullName;
          }
          return !!(a.business_name || a.user);
        });

        setHasMore(filtered.length === LIMIT);
        setArtists((prev) => (append ? [...prev, ...filtered] : filtered));
        setPriceDistribution(res.price_distribution || []);
      } catch (err) {
        console.error(err);
        setError('Failed to load artists.');
      } finally {
        setLoading(false);
      }
    },
    [
      serviceName,
      location,
      when,
      sort,
      debouncedMinPrice,
      debouncedMaxPrice,
    ],
  );

  // Lazily fetch price distribution after the initial list loads to keep the list cacheable.
  useEffect(() => {
    if (!filtersReady) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await getServiceProviders({
          category: serviceName,
          location: location || undefined,
          when: when || undefined,
          sort,
          minPrice: debouncedMinPrice,
          maxPrice: debouncedMaxPrice,
          page: 1,
          limit: LIMIT,
          includePriceDistribution: true,
        });
        setPriceDistribution(res.price_distribution || []);
      } catch {
        // best-effort; histogram is non-blocking
      }
    })();
    return () => controller.abort();
  }, [
    filtersReady,
    serviceName,
    location,
    when,
    sort,
    debouncedMinPrice,
    debouncedMaxPrice,
  ]);

  // Idle prefetch page 2 for current filters to make pagination snappy
  useEffect(() => {
    if (!filtersReady) return;
    const idler = () => prefetchServiceProviders({
      category: serviceName,
      location: location || undefined,
      sort,
      page: 2,
      limit: LIMIT,
      fields: ['id','business_name','profile_picture_url','user.first_name','user.last_name']
    });
    const id = ('requestIdleCallback' in window)
      ? (window as any).requestIdleCallback(idler, { timeout: 1500 })
      : setTimeout(idler, 1000) as any;
    return () => {
      if ('cancelIdleCallback' in window) (window as any).cancelIdleCallback?.(id);
      else clearTimeout(id as any);
    };
  }, [filtersReady, serviceName, location, sort]);

  useEffect(() => {
    if (!filtersReady) return;
    setPage(1);
    fetchArtists({ pageNumber: 1 });
  }, [
    filtersReady,
    serviceName,
    location,
    when,
    sort,
    debouncedMinPrice,
    debouncedMaxPrice,
    fetchArtists,
  ]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchArtists({ append: true, pageNumber: next });
  };

  const hasQuery =
    searchParams.get('category') ||
    searchParams.get('location') ||
    searchParams.get('when');

  const categoryPath = /\/(?:service-providers\/category|category)\//.test(pathname);
  const showFilter = Boolean(hasQuery || categoryPath);

  const filterControl = showFilter ? (
    <ServiceProvidersPageHeader
      iconOnly
      initialSort={sort}
      initialMinPrice={minPrice}
      initialMaxPrice={maxPrice}
      priceDistribution={priceDistribution}
      onFilterApply={({ sort: s, minPrice: min, maxPrice: max }) => {
        setSort(s || undefined);
        setMinPrice(min);
        setMaxPrice(max);
        updateQueryParams(router, pathname, {
          category: serviceName,
          location,
          when,
          sort: s,
          minPrice: min,
          maxPrice: max,
        });
      }}
      onFilterClear={() => {
        setSort(undefined);
        setMinPrice(SLIDER_MIN);
        setMaxPrice(SLIDER_MAX);
        updateQueryParams(router, pathname, {
          category: serviceName,
          location,
          when,
        });
      }}
      onSearchEdit={() => {}}
    />
  ) : null;

  const qs = searchParams.toString();

  return (
    <MainLayout headerFilter={filterControl}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 fade-in">
        {serviceName && (
          <div className="flex items-center space-x-2 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-brand"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              {/* e.g., "Musician" → "Explore Musicians", "DJ" → "Explore DJs" */}
              Explore {pluralizeServiceLabel(serviceName)}
            </h1>
          </div>
        )}

        {/* Artists grid */}
        {loading && <Spinner className="my-4" />}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && artists.length === 0 && <p>No service providers found.</p>}

        {artists.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
            {artists.map((a) => {
              const user = a.user;
              const name =
                serviceName === 'DJ'
                  ? a.business_name!
                  : a.business_name || `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();

              return (
                <ServiceProviderCardCompact
                  key={a.id}
                  serviceProviderId={a.id}
                  name={name}
                  subtitle={a.custom_subtitle || undefined}
                  imageUrl={
                    getFullImageUrl(a.profile_picture_url || a.portfolio_urls?.[0]) ||
                    undefined
                  }
                  price={
                    category && a.service_price != null
                      ? Number(a.service_price)
                      : a.hourly_rate && a.price_visible
                        ? Number(a.hourly_rate)
                        : undefined
                  }
                  rating={a.rating ?? undefined}
                  ratingCount={a.rating_count ?? undefined}
                  location={a.location}
                  categories={a.service_categories}
                  href={qs ? `/service-providers/${a.id}?${qs}` : `/service-providers/${a.id}`}
                  className="w-40"
                />
              );
            })}
          </div>
        )}

        {hasMore && !loading && (
          <div className="flex justify-center mt-4">
            <button
              onClick={loadMore}
              className="px-4 py-2 rounded-md bg-brand text-white hover:bg-brand-dark"
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

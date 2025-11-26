'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import {
  useRouter,
  useSearchParams,
  usePathname,
} from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import {
  getServiceProviders,
  getCachedServiceProviders,
  prefetchServiceProviders,
  logSearchEvent,
  logSearchClick,
  type PriceBucket,
} from '@/lib/api';
import useServiceCategories from '@/hooks/useServiceCategories';
import { getFullImageUrl } from '@/lib/utils';
import type { ServiceProviderProfile } from '@/types';
import ServiceProviderCardCompact from '@/components/service-provider/ServiceProviderCardCompact';
import { ServiceProvidersPageHeader } from '@/components/service-provider/ServiceProviderServiceCard';
import { SLIDER_MIN, SLIDER_MAX } from '@/lib/filter-constants';
import { useDebounce } from '@/hooks/useDebounce';
import { updateQueryParams } from '@/lib/urlParams';
import { Spinner } from '@/components/ui';

function pluralizeLastWord(label: string): string {
  const exceptions: Record<string, string> = {
    DJ: 'DJs',
    MC: 'MCs',
    'MC / Host': 'MCs / Hosts',
    'MC/Host': 'MCs/Hosts',
  };
  if (exceptions[label]) return exceptions[label];

  const parts = label.split(' ');
  const last = parts.pop()!;
  const w = last;

  const endsWith = (s: string) => w.toLowerCase().endsWith(s);
  let plural = w;

  if (/[sxz]$/i.test(w) || endsWith('ch') || endsWith('sh')) {
    plural = w + 'es';
  } else if (/[^\Waeiou]y$/i.test(w)) {
    plural = w.slice(0, -1) + 'ies';
  } else {
    plural = w + 's';
  }

  return [...parts, plural].join(' ');
}

function pluralizeServiceLabel(label?: string) {
  return label ? pluralizeLastWord(label) : '';
}

type RouterLike = Parameters<typeof updateQueryParams>[0];

function SearchRescuePanel({
  serviceName,
  location,
  when,
  router,
  pathname,
}: {
  serviceName?: string;
  location: string;
  when: Date | null;
  router: RouterLike;
  pathname: string;
}) {
  const hasLocation = Boolean(location && location.trim().length > 0);
  const hasDate = Boolean(when);
  const hasCategory = Boolean(serviceName);

  const parts: string[] = [];
  if (hasCategory && serviceName) parts.push(pluralizeServiceLabel(serviceName));
  if (hasLocation) parts.push(location);
  if (hasDate && when) parts.push(format(when, 'd MMM yyyy'));

  const summary =
    parts.length > 0
      ? `No results for ${parts.join(' · ')}`
      : 'No matching service providers.';

  const handleClearDate = () => {
    updateQueryParams(router, pathname, {
      category: serviceName,
      location: location || undefined,
      when: null,
    });
  };

  const handleClearLocation = () => {
    updateQueryParams(router, pathname, {
      category: serviceName,
      location: undefined,
      when,
    });
  };

  const handleClearAllFilters = () => {
    updateQueryParams(router, pathname, {
      category: undefined,
      location: undefined,
      when: null,
    });
  };

  const suggestions: Array<{ label: string; onClick: () => void }> = [];
  if (hasDate) {
    suggestions.push({
      label: 'Search without a date',
      onClick: handleClearDate,
    });
  }
  if (hasLocation) {
    suggestions.push({
      label: 'Search all locations',
      onClick: handleClearLocation,
    });
  }
  if (hasCategory || hasLocation || hasDate) {
    suggestions.push({
      label: 'Clear all filters',
      onClick: handleClearAllFilters,
    });
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-sm font-medium text-slate-900">{summary}</p>
      <p className="mt-1 text-xs text-slate-600">
        Try adjusting your filters to see more service providers.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={s.onClick}
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 active:scale-[0.98] transition"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="w-40">
          <div className="aspect-square rounded-xl bg-gray-200 animate-pulse" />
          <div className="mt-2 h-3 bg-gray-200 rounded w-3/4 animate-pulse" />
          <div className="mt-1 h-2 bg-gray-200 rounded w-1/2 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default function ServiceProvidersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [artists, setArtists] = useState<ServiceProviderProfile[]>([]);
  const [loading, setLoading] = useState(false); // start as false; we flip to true when we actually fetch
  const [error, setError] = useState<string | null>(null);

  const categories = useServiceCategories();
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState<string | undefined>(undefined);
  const [when, setWhen] = useState<Date | null>(null);
  const [minPrice, setMinPrice] = useState<number>(SLIDER_MIN);
  const [maxPrice, setMaxPrice] = useState<number>(SLIDER_MAX);
  const [priceDistribution, setPriceDistribution] = useState<PriceBucket[]>([]);

  const [filtersReady, setFiltersReady] = useState(false);

  const debouncedMinPrice = useDebounce(minPrice, 300);
  const debouncedMaxPrice = useDebounce(maxPrice, 300);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;

  const sid = searchParams.get('sid');
  const sourceParam = searchParams.get('src') || undefined;

  const serviceName = category
    ? categories.find((c) => c.value === category)?.label
    : undefined;

  // ── Parse filters from URL ─────────────────────────────────────────────────
  useEffect(() => {
    if (!categories.length) return;

    let value = searchParams.get('category') || undefined;
    if (!value) {
      const match = pathname.match(
        /\/(?:service-providers\/category|category)\/([^/?]+)/,
      );
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
    setMinPrice(
      searchParams.get('minPrice')
        ? Number(searchParams.get('minPrice'))
        : SLIDER_MIN,
    );
    setMaxPrice(
      searchParams.get('maxPrice')
        ? Number(searchParams.get('maxPrice'))
        : SLIDER_MAX,
    );

    setFiltersReady(true);
  }, [searchParams, pathname, categories]);

  // ── Fetch artists (uses cache first when possible) ────────────────────────
  const fetchArtists = useCallback(
    async ({
      append = false,
      pageNumber,
    }: {
      append?: boolean;
      pageNumber: number;
    }) => {
      setError(null);

      const params = {
        category: serviceName,
        location: location || undefined,
        when: when || undefined,
        sort,
        minPrice: debouncedMinPrice,
        maxPrice: debouncedMaxPrice,
        page: pageNumber,
        limit: LIMIT,
        fields: [
          'id',
          'business_name',
          'custom_subtitle',
          'profile_picture_url',
          'portfolio_urls',
          'hourly_rate',
          'price_visible',
          'rating',
          'rating_count',
          'location',
          'service_categories',
          'service_price',
          'user.first_name',
          'user.last_name',
        ] as string[],
        includePriceDistribution: true,
      };

      // 1️⃣ Try cache for the very first page (instant results on repeat visits)
      if (!append && pageNumber === 1) {
        const cached = getCachedServiceProviders(params);
        if (cached) {
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

          if (filteredCached.length > 0) {
            setArtists(filteredCached as any);
            setHasMore(filteredCached.length === LIMIT);
            setPriceDistribution(cached.price_distribution || []);
          }
        }
      }

      // 2️⃣ Now do the real network fetch (for fresh data)
      setLoading(true);

      try {
        const res = await getServiceProviders(params);

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

        // Log search stats only for the first page
        if (!append && pageNumber === 1 && sid) {
          try {
            const whenStr = when ? format(when, 'yyyy-MM-dd') : undefined;
            void logSearchEvent({
              search_id: sid,
              source: sourceParam || 'artists_page',
              category_value: serviceName,
              location: location || undefined,
              when: whenStr,
              results_count:
                typeof res.total === 'number' ? res.total : filtered.length,
              meta: {
                sort,
                minPrice: debouncedMinPrice,
                maxPrice: debouncedMaxPrice,
              },
            });
          } catch {
            // best-effort logging
          }
        }
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
      sid,
      sourceParam,
    ],
  );

  // ── Initial load + re-run when filters change ─────────────────────────────
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

  // ── Idle prefetch of page 2 (for smoother "Load more") ────────────────────
  useEffect(() => {
    if (!filtersReady) return;
    if (typeof window === 'undefined') return;

    const idler = () =>
      prefetchServiceProviders({
        category: serviceName,
        location: location || undefined,
        sort,
        page: 2,
        limit: LIMIT,
        fields: [
          'id',
          'business_name',
          'profile_picture_url',
          'user.first_name',
          'user.last_name',
        ],
      });

    const id =
      'requestIdleCallback' in window
        ? (window as any).requestIdleCallback(idler, { timeout: 1500 })
        : setTimeout(idler, 1000);

    return () => {
      if (typeof window === 'undefined') return;
      if ('cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback?.(id);
      } else {
        clearTimeout(id as number);
      }
    };
  }, [filtersReady, serviceName, location, sort]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchArtists({ append: true, pageNumber: next });
  };

  const hasQuery =
    searchParams.get('category') ||
    searchParams.get('location') ||
    searchParams.get('when');

  const categoryPath = /\/(?:service-providers\/category|category)\//.test(
    pathname,
  );
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
          <div className="flex items-center space-x-2 mb-2">
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
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Explore {pluralizeServiceLabel(serviceName)}
            </h1>
          </div>
        )}

        {/* Initial skeleton: only when we have NO data yet */}
        {loading && artists.length === 0 && <SkeletonGrid />}
        {/* Top spinner while we append or refetch with data already on screen */}
        {loading && artists.length > 0 && <Spinner className="my-4" />}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && artists.length === 0 && (
          <SearchRescuePanel
            serviceName={serviceName}
            location={location}
            when={when}
            router={router}
            pathname={pathname}
          />
        )}

        {artists.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
            {artists.map((a, index) => {
              const user = a.user;
              const name =
                serviceName === 'DJ'
                  ? a.business_name!
                  : a.business_name ||
                    `${user?.first_name ?? ''} ${
                      user?.last_name ?? ''
                    }`.trim();

              return (
                <ServiceProviderCardCompact
                  key={a.id}
                  serviceProviderId={a.id}
                  name={name}
                  subtitle={a.custom_subtitle || undefined}
                  imageUrl={
                    getFullImageUrl(
                      a.profile_picture_url || a.portfolio_urls?.[0],
                    ) || undefined
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
                  href={
                    qs
                      ? `/service-providers/${a.slug || a.id}?${qs}`
                      : `/service-providers/${a.slug || a.id}`
                  }
                  onClick={() => {
                    if (!sid) return;
                    try {
                      void logSearchClick({
                        search_id: sid,
                        artist_id: a.id,
                        rank: index + 1,
                      });
                    } catch {
                      // best-effort
                    }
                  }}
                  className="w-40"
                />
              );
            })}
          </div>
        )}

        {hasMore && !loading && (
          <div className="flex justify-center mt-4">
            <button
              type="button"
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

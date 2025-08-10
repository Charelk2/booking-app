'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { getServiceProviders, type PriceBucket } from '@/lib/api';
import useServiceCategories from '@/hooks/useServiceCategories';
import { getFullImageUrl } from '@/lib/utils';
import type { ServiceProviderProfile } from '@/types';
import ServiceProviderCardCompact from '@/components/service-provider/ServiceProviderCardCompact';
import { ServiceProvidersPageHeader } from '@/components/service-provider/ServiceProviderServiceCard';
import { SLIDER_MIN, SLIDER_MAX } from '@/lib/filter-constants';
import { useDebounce } from '@/hooks/useDebounce';
import { updateQueryParams } from '@/lib/urlParams';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';

export default function ServiceProvidersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user } = useAuth();

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
  const ITEM_HEIGHT = 280;

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
    async (
      {
        append = false,
        pageNumber,
      }: { append?: boolean; pageNumber: number },
    ) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getServiceProviders({
          category: serviceName,
          location: location || undefined,
          when: when || undefined,
          sort,
          minPrice: debouncedMinPrice,
          maxPrice: debouncedMaxPrice,
          page: pageNumber,
          limit: LIMIT,
          includePriceDistribution: true,
        });
        // Filter client-side to guard against any backend responses that
        // include artists from other service categories. For the DJ category,
        // only include profiles with a business name so personal artist names
        // never appear.
        const filtered = res.data.filter((a) => {
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
      category,
      serviceName,
      location,
      when,
      sort,
      debouncedMinPrice,
      debouncedMaxPrice,
    ],
  );

  useEffect(() => {
    if (!filtersReady) return;
    setPage(1);
    fetchArtists({ pageNumber: 1 });
  }, [
    filtersReady,
    category,
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
  const filterControl = (
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
    />
  );
  const qs = searchParams.toString();

  return (
    <MainLayout headerFilter={filterControl}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Artists grid */}
        {loading && <Spinner className="my-4" />}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && artists.length === 0 && <p>No service providers found.</p>}

        <List
          height={Math.min(ITEM_HEIGHT * artists.length, ITEM_HEIGHT * 10)}
          itemCount={artists.length}
          itemSize={ITEM_HEIGHT}
          width="100%"
        >
          {({ index, style }: ListChildComponentProps) => {
            const a = artists[index];
            const user = a.user;
            const name =
              serviceName === 'DJ'
                ? a.business_name!
                : a.business_name || `${user.first_name} ${user.last_name}`;
            return (
              <div style={style} className="p-1">
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
                />
              </div>
            );
          }}
        </List>

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

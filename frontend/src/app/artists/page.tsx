'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { getArtists, getRecommendedArtists, type PriceBucket } from '@/lib/api';
import { UI_CATEGORY_TO_SERVICE, SERVICE_TO_UI_CATEGORY } from '@/lib/categoryMap';
import { getFullImageUrl } from '@/lib/utils';
import type { ArtistProfile } from '@/types';
import ArtistCardCompact from '@/components/artist/ArtistCardCompact';
import { ArtistsPageHeader } from '@/components/artist/ArtistServiceCard';
import { SLIDER_MIN, SLIDER_MAX } from '@/lib/filter-constants';
import { useDebounce } from '@/hooks/useDebounce';
import { updateQueryParams } from '@/lib/urlParams';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

export default function ArtistsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user } = useAuth();

  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [recommended, setRecommended] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recError, setRecError] = useState<string | null>(null);

  // Store the selected category as a UI slug (e.g. "dj") so we can map it
  // to the backend service name whenever querying the API.
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState<string | undefined>(undefined);
  const [when, setWhen] = useState<Date | null>(null);
  const [minPrice, setMinPrice] = useState<number>(SLIDER_MIN);
  const [maxPrice, setMaxPrice] = useState<number>(SLIDER_MAX);
  const [priceDistribution, setPriceDistribution] = useState<PriceBucket[]>([]);

  const debouncedMinPrice = useDebounce(minPrice, 300);
  const debouncedMaxPrice = useDebounce(maxPrice, 300);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;

  // Derived backend service name for the selected UI category.
  const serviceName = category ? UI_CATEGORY_TO_SERVICE[category] : undefined;

  useEffect(() => {
    // Recommendations are personalized and require authentication.
    // When not logged in, skip the request entirely to avoid 401s and noisy errors.
    if (!user) {
      setRecommended([]);
      setRecError(null);
      return;
    }
    const load = async () => {
      try {
        const recs = await getRecommendedArtists();
        // Only surface recommendations matching the currently selected UI category.
        // The API returns personalized suggestions across all categories, so we
        // derive the backend service name from the UI value and filter on the
        // client to avoid showing musicians when browsing DJs or other services.
        const safeRecs = Array.isArray(recs) ? recs : [];
        let filtered = serviceName
          ? safeRecs.filter((a) => a.service_category?.name === serviceName)
          : safeRecs;
        if (serviceName === 'DJ') {
          filtered = filtered.filter((a) => {
            const business = a.business_name?.trim().toLowerCase();
            const fullName = `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`
              .trim()
              .toLowerCase();
            return business && business !== fullName;
          });
        }
        setRecommended(filtered);
        setRecError(null);
      } catch (err) {
        console.error(err);
        setRecError('Failed to load recommendations.');
      }
    };
    load();
  }, [category, user]);

  useEffect(() => {
    // ``category`` may arrive either as a backend service name ("DJ") or
    // as a UI slug ("dj"). Normalize both forms to the UI value so the rest of
    // the page logic consistently derives the backend name via
    // ``UI_CATEGORY_TO_SERVICE``.
    let value = searchParams.get('category') || undefined;
    if (!value) {
      const match = pathname.match(/\/(?:artists\/category|category)\/([^/?]+)/);
      if (match) {
        value = match[1];
      }
    }
    let uiValue: string | undefined;
    if (value) {
      if (SERVICE_TO_UI_CATEGORY[value]) {
        // Already a backend service name
        uiValue = SERVICE_TO_UI_CATEGORY[value];
      } else if (UI_CATEGORY_TO_SERVICE[value]) {
        // Received a UI slug
        uiValue = value;
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
  }, [searchParams, pathname]);

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
        const res = await getArtists({
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
          const matchesCategory = !serviceName || a.service_category?.name === serviceName;
          if (!matchesCategory) return false;
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
    setPage(1);
    fetchArtists({ pageNumber: 1 });
  }, [category, location, when, sort, debouncedMinPrice, debouncedMaxPrice, fetchArtists]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchArtists({ append: true, pageNumber: next });
  };
  const filterControl = (
    <ArtistsPageHeader
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
        {user && recommended.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recommended for you</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2 md:gap-2">
              {recommended.map((a) => {
                const user = a.user;
                const name =
                  serviceName === 'DJ'
                    ? a.business_name!
                    : a.business_name || `${user.first_name} ${user.last_name}`;
                return (
                  <ArtistCardCompact
                    key={`rec-${a.id}`}
                    artistId={a.id}
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
                    href={qs ? `/artists/${a.id}?${qs}` : `/artists/${a.id}`}
                  />
                );
              })}
            </div>
          </div>
        )}
        {user && recError && <p className="text-red-600">{recError}</p>}

        {/* Artists grid */}
        {loading && <Spinner className="my-4" />}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && artists.length === 0 && <p>No artists found.</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2 md:gap-2">
          {artists.map((a) => {
            const user = a.user;
            const name =
              serviceName === 'DJ'
                ? a.business_name!
                : a.business_name || `${user.first_name} ${user.last_name}`;
            return (
              <ArtistCardCompact
                key={a.id}
                artistId={a.id}
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
                href={qs ? `/artists/${a.id}?${qs}` : `/artists/${a.id}`}
              />
            );
          })}
        </div>

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

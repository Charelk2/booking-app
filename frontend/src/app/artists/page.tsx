'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { getArtists, getRecommendedArtists, type PriceBucket } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import type { ArtistProfile } from '@/types';
import ArtistCardCompact from '@/components/artist/ArtistCardCompact';
import { ArtistsPageHeader } from '@/components/artist/ArtistServiceCard';
import { SLIDER_MIN, SLIDER_MAX } from '@/lib/filter-constants';
import { useDebounce } from '@/hooks/useDebounce';
import { updateQueryParams } from '@/lib/urlParams';
import { Spinner } from '@/components/ui';

export default function ArtistsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [recommended, setRecommended] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recError, setRecError] = useState<string | null>(null);

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

  useEffect(() => {
    const load = async () => {
      try {
        const recs = await getRecommendedArtists();
        setRecommended(recs);
      } catch (err) {
        console.error(err);
        setRecError('Failed to load recommendations.');
      }
    };
    load();
  }, []);

  useEffect(() => {
    const serviceCat = searchParams.get('category') || undefined;
    setCategory(serviceCat);
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
  }, [searchParams]);

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
          category,
          location: location || undefined,
          when: when || undefined,
          sort,
          minPrice: debouncedMinPrice,
          maxPrice: debouncedMaxPrice,
          page: pageNumber,
          limit: LIMIT,
          includePriceDistribution: true,
        });
        const filtered = res.data.filter((a) => a.business_name || a.user);
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
          category,
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
          category,
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
        {recommended.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recommended for you</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2 md:gap-2">
              {recommended.map((a) => {
                const user = a.user;
                const name = a.business_name || `${user.first_name} ${user.last_name}`;
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
        {recError && <p className="text-red-600">{recError}</p>}

        {/* Artists grid */}
        {loading && <Spinner className="my-4" />}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && artists.length === 0 && <p>No artists found.</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2 md:gap-2">
          {artists.map((a) => {
            const user = a.user;
            const name = a.business_name || `${user.first_name} ${user.last_name}`;
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

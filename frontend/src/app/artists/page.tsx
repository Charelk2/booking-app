'use client';

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { getArtists } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import type { ArtistProfile } from '@/types';
import ArtistCard from '@/components/artist/ArtistCard';
import ArtistsPageHeader from '@/components/artist/ArtistsPageHeader';
import SearchBarInline from '@/components/search/SearchBarInline';
import { SLIDER_MIN, SLIDER_MAX } from '@/lib/filter-constants';
import { updateQueryParams } from '@/lib/urlParams';
import {
  UI_CATEGORIES,
  SERVICE_TO_UI_CATEGORY,
  UI_CATEGORY_TO_SERVICE,
} from '@/lib/categoryMap';
import { Spinner } from '@/components/ui';

export default function ArtistsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const serviceCategory = searchParams.get('category') || undefined;
  const uiValue = serviceCategory
    ? SERVICE_TO_UI_CATEGORY[serviceCategory] || serviceCategory
    : undefined;
  const uiLabel = uiValue
    ? UI_CATEGORIES.find((c) => c.value === uiValue)?.label
    : undefined;

  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<string | undefined>(serviceCategory);
  const [location, setLocation] = useState(
    searchParams.get('location') || ''
  );
  const [sort, setSort] = useState<string | undefined>(
    searchParams.get('sort') || undefined
  );
  const [when, setWhen] = useState<Date | null>(() => {
    const w = searchParams.get('when');
    return w ? new Date(w) : null;
  });
  const [minPrice, setMinPrice] = useState<number>(
    searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : SLIDER_MIN
  );
  const [maxPrice, setMaxPrice] = useState<number>(
    searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : SLIDER_MAX
  );

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;


  const fetchArtists = async (
    { append = false, pageOverride }: { append?: boolean; pageOverride?: number } = {},
  ) => {
    setLoading(true);
    try {
      const res = await getArtists({
        category,
        location: location || undefined,
        when: when || undefined,
        sort,
        minPrice,
        maxPrice,
        page: pageOverride ?? page,
        limit: LIMIT,
      });
      const filtered = res.data.filter((a) => a.business_name || a.user);
      setHasMore(filtered.length === LIMIT);
      setArtists((prev) => (append ? [...prev, ...filtered] : filtered));
    } catch (err) {
      console.error(err);
      setError('Failed to load artists.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchArtists({ pageOverride: 1 });
  }, [category, location, when, sort, minPrice, maxPrice]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchArtists({ append: true, pageOverride: next });
  };

  const handleSearchEdit = ({ category: uiCat, location: loc, when: date }: {
    category?: string;
    location?: string;
    when?: Date | null;
  }) => {
    const serviceCat = uiCat ? UI_CATEGORY_TO_SERVICE[uiCat] || uiCat : undefined;
    setCategory(serviceCat);
    setLocation(loc || '');
    setWhen(date || null);
    updateQueryParams(router, pathname, {
      category: serviceCat,
      location: loc,
      when: date || undefined,
      sort,
      minPrice,
      maxPrice,
    });
  };

  const [searchExpanded, setSearchExpanded] = useState(false);

  const header = (
    <div
      className={clsx(
        'relative mx-auto transition-all duration-300 ease-out',
        searchExpanded
          ? 'max-w-full md:max-w-5xl lg:max-w-6xl'
          : 'max-w-2xl'
      )}
    >
      <SearchBarInline
        initialCategory={uiValue}
        initialLocation={location}
        initialWhen={when}
        onSearch={handleSearchEdit}
        onExpandedChange={setSearchExpanded}
      />
      {!searchExpanded && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2">
          <ArtistsPageHeader
            iconOnly
            categoryLabel={uiLabel}
            categoryValue={uiValue}
            location={location}
            when={when}
            onSearchEdit={handleSearchEdit}
            initialSort={sort}
            initialMinPrice={minPrice}
            initialMaxPrice={maxPrice}
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
        </div>
      )}
    </div>
  );

  return (
    <MainLayout headerAddon={header}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Artists grid */}
        {loading && <Spinner className="my-4" />}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && artists.length === 0 && <p>No artists found.</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {artists.map((a, i) => {
            const user = a.user;
            const name = a.business_name || `${user.first_name} ${user.last_name}`;
            return (
              <ArtistCard
                key={a.id}
                id={a.id}
                priority={i === 0}
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
                location={a.location}
                specialties={a.specialties}
                rating={a.rating ?? undefined}
                ratingCount={a.rating_count ?? undefined}
                verified={user?.is_verified}
                isAvailable={a.is_available}
                href={`/artists/${a.id}`}
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

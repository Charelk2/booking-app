'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { getArtists } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import type { ArtistProfile } from '@/types';
import ArtistCard from '@/components/artist/ArtistCard';
import FilterBar, { SLIDER_MIN, SLIDER_MAX } from '@/components/artist/FilterBar';
import { Spinner } from '@/components/ui';

// Raw category strings
const RAW_CATEGORIES = [
  'Live Performance',
  'Virtual Appearance',
  'Personalized Video',
  'Custom Song',
  'Other',
] as const;

// Convert to {value,label}[]
const CATEGORY_OPTIONS = RAW_CATEGORIES.map((v) => ({
  value: v,
  label: v,
}));

export default function ArtistsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<string | undefined>(
    searchParams.get('category') || undefined
  );
  const [location, setLocation] = useState(
    searchParams.get('location') || ''
  );
  const [sort, setSort] = useState<string | undefined>(
    searchParams.get('sort') || undefined
  );
  const [minPrice, setMinPrice] = useState<number>(
    searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : SLIDER_MIN
  );
  const [maxPrice, setMaxPrice] = useState<number>(
    searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : SLIDER_MAX
  );

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;

  const filtersActive =
    Boolean(category) ||
    Boolean(location) ||
    Boolean(sort) ||
    minPrice !== SLIDER_MIN ||
    maxPrice !== SLIDER_MAX;

  const clearFilters = () => {
    setCategory(undefined);
    setLocation('');
    setSort(undefined);
    setMinPrice(SLIDER_MIN);
    setMaxPrice(SLIDER_MAX);
    setPage(1);
    router.push(pathname);
  };


  const applyFilters = ({
    category: cat,
    minPrice: min,
    maxPrice: max,
  }: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
  }) => {
    setCategory(cat);
    setMinPrice(min ?? SLIDER_MIN);
    setMaxPrice(max ?? SLIDER_MAX);
    setPage(1);
    fetchArtists({ pageOverride: 1 });
    const params = new URLSearchParams();
    if (cat) params.set('category', cat);
    if (location) params.set('location', location);
    if (sort) params.set('sort', sort);
    const minVal = min ?? SLIDER_MIN;
    const maxVal = max ?? SLIDER_MAX;
    if (minVal !== SLIDER_MIN) params.set('minPrice', String(minVal));
    if (maxVal !== SLIDER_MAX) params.set('maxPrice', String(maxVal));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const fetchArtists = async (
    { append = false, pageOverride }: { append?: boolean; pageOverride?: number } = {},
  ) => {
    setLoading(true);
    try {
      const res = await getArtists({
        category,
        location: location || undefined,
        sort,
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
  }, [category, location, sort, minPrice, maxPrice]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchArtists({ append: true, pageOverride: next });
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Browse and book talented performers
          </h1>
          <p className="text-sm text-gray-500">
            Compare artists, check ratings, and book instantly.
          </p>
        </header>

        {/* FilterBar is now in normal flow, not sticky */}
        <FilterBar
          categories={CATEGORY_OPTIONS}
          initialCategory={category}
          initialMinPrice={minPrice}
          initialMaxPrice={maxPrice}
          onCategory={setCategory}
          location={location}
          onLocation={setLocation}
          sort={sort}
          onSort={(e) => setSort(e.target.value || undefined)}
          onClear={clearFilters}
          onApply={applyFilters}
          filtersActive={filtersActive}
        />

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
                  a.hourly_rate && a.price_visible
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

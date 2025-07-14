'use client';
import { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { getArtists } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import type { ArtistProfile } from '@/types';
import ArtistCard from '@/components/artist/ArtistCard';
import FilterBar from '@/components/artist/FilterBar';
import { Spinner } from '@/components/ui';

const CATEGORIES = [
  'Live Performance',
  'Virtual Appearance',
  'Personalized Video',
  'Custom Song',
  'Other',
];

export default function ArtistsPage() {
  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | undefined>();
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState<string | undefined>();
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;

  const clearFilters = () => {
    setCategory(undefined);
    setLocation('');
    setSort(undefined);
    setVerifiedOnly(false);
  };

  const filtersActive =
    Boolean(category) || Boolean(location) || Boolean(sort) || verifiedOnly;

  const fetchArtists = async (params: {
    category?: string;
    location?: string;
    sort?: string;
    page: number;
    append?: boolean;
  }) => {
    try {
      const res = await getArtists({
        category: params.category,
        location: params.location,
        sort: params.sort,
        page: params.page,
        limit: LIMIT,
      });
      const filtered = verifiedOnly
        ? res.data.filter((a) => (a as Partial<typeof a>).user?.is_verified)
        : res.data;
      setHasMore(res.data.length === LIMIT);
      if (params.append) {
        setArtists((prev) => [...prev, ...filtered]);
      } else {
        setArtists(filtered);
      }
    } catch (err) {
      console.error('Error fetching artists:', err);
      setError('Failed to load artists.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setPage(1);
    setHasMore(true);
    fetchArtists({
      category,
      location: location || undefined,
      sort,
      page: 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, location, sort, verifiedOnly]);

  const onCategory = (c: string) => {
    setCategory((prev) => (prev === c ? undefined : c));
  };

  const loadMore = () => {
    const next = page + 1;
    setLoading(true);
    setPage(next);
    fetchArtists({
      category,
      location: location || undefined,
      sort,
      page: next,
      append: true,
    });
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="mb-4 text-center">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">
            Browse and book talented performers
          </h1>
          <p className="text-sm text-gray-500">
            Compare artists, check ratings, and book instantly.
          </p>
        </div>
        <FilterBar
          categories={CATEGORIES}
          category={category}
          onCategory={onCategory}
          location={location}
          onLocation={(e) => setLocation(e.target.value)}
          sort={sort}
          onSort={(e) => setSort(e.target.value || undefined)}
          verifiedOnly={verifiedOnly}
          onVerifiedOnly={(e) => setVerifiedOnly(e.target.checked)}
          onClear={clearFilters}
          filtersActive={filtersActive}
        />
        <div>
          {loading && <Spinner className="my-4" />}
          {error && <p className="text-red-600">{error}</p>}
          {!loading && artists.length === 0 && !error && (
            <p>No artists found</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {artists.map((a) => {
              const user = (a as Partial<typeof a>).user as ArtistProfile['user'] | null | undefined;
              const name = a.business_name || (user ? `${user.first_name} ${user.last_name}` : 'Unknown Artist');

            return (
              <ArtistCard
                key={a.id}
                id={a.id}
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
                type="button"
                onClick={loadMore}
                className="px-4 py-2 rounded-md bg-brand text-white hover:bg-brand-dark"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

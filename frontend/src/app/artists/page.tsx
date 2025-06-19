'use client';
import { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { getArtists } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import type { ArtistProfile } from '@/types';
import ArtistCard from '@/components/artist/ArtistCard';
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

  const clearFilters = () => {
    setCategory(undefined);
    setLocation('');
    setSort(undefined);
    setVerifiedOnly(false);
  };

  const filtersActive =
    Boolean(category) || Boolean(location) || Boolean(sort) || verifiedOnly;

  const fetchArtists = async (params?: { category?: string; location?: string; sort?: string }) => {
    try {
      const res = await getArtists(params);
      const filtered = verifiedOnly
        ? res.data.filter((a) => (a as Partial<typeof a>).user?.is_verified)
        : res.data;
      setArtists(filtered);
    } catch (err) {
      console.error('Error fetching artists:', err);
      setError('Failed to load artists.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtists({ category, location: location || undefined, sort });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, location, sort, verifiedOnly]);

  const onCategory = (c: string) => {
    setCategory((prev) => (prev === c ? undefined : c));
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Browse and book talented performers
          </h1>
          <p className="text-sm text-gray-500">
            Compare artists, check ratings, and book instantly.
          </p>
        </div>
        <div className="mt-6 mb-4 px-6 py-4 bg-white rounded-xl shadow-sm flex flex-wrap items-center gap-2">
          <div className="flex gap-2 overflow-x-auto whitespace-nowrap">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCategory(c)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-sky-100 text-sky-800 hover:bg-sky-200 transition${
                  category === c ? ' bg-sky-200 text-sky-900 font-semibold' : ''
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-md border border-gray-300 bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 w-[140px]"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value || undefined)}
            className="text-sm px-3 py-1.5 rounded-md border border-gray-300 bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Sort</option>
            <option value="top_rated">Top Rated</option>
            <option value="most_booked">Most Booked</option>
            <option value="newest">Newest</option>
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
            />
            Verified Only
          </label>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:underline ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
        <div>
          {loading && <Spinner className="my-4" />}
          {error && <p className="text-red-600">{error}</p>}
          {!loading && artists.length === 0 && !error && (
            <p>No artists found</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
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
        </div>
      </div>
    </MainLayout>
  );
}

'use client';
import { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { getArtists } from '@/lib/api';
import { getFullImageUrl, formatCurrency } from '@/lib/utils';
import type { ArtistProfile } from '@/types';
import ArtistCard from '@/components/artist/ArtistCard';

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
        <section className="bg-gray-50 py-12 text-center">
          <h1 className="text-3xl font-bold">Find the Perfect Artist</h1>
          <p className="mt-2 text-gray-600">Browse and book talented performers</p>
        </section>
        <div className="sticky top-0 z-10 bg-white border-b py-3">
          <div className="flex flex-wrap gap-2 items-center justify-between mb-6">
            <div className="flex gap-2 overflow-x-auto whitespace-nowrap">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onCategory(c)}
                  className={
                    category === c
                      ? 'bg-indigo-600 text-white px-3 py-1 rounded-full'
                      : 'bg-gray-100 text-gray-700 px-3 py-1 rounded-full'
                  }
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                placeholder="Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value || undefined)}
                className="border rounded px-2 py-1 text-sm"
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
            </div>
          </div>
        </div>
        <div>
          {loading && <p>Loading...</p>}
          {error && <p className="text-red-600">{error}</p>}
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
                    ? formatCurrency(Number(a.hourly_rate))
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

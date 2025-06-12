'use client';
import { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { getArtists } from '@/lib/api';
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

  const fetchArtists = async (params?: { category?: string; location?: string; sort?: string }) => {
    try {
      const res = await getArtists(params);
      setArtists(res.data);
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
  }, [category, location, sort]);

  const onCategory = (c: string) => {
    setCategory((prev) => (prev === c ? undefined : c));
  };

  return (
    <MainLayout>
      <section className="bg-gray-50 py-12 text-center">
        <h1 className="text-3xl font-bold">Find the Perfect Artist</h1>
        <p className="mt-2 text-gray-600">Browse and book talented performers</p>
      </section>
      <div className="sticky top-0 z-10 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 overflow-x-auto whitespace-nowrap flex gap-2">
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
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading && <p>Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {artists.map((a) => {
            const user = (a as Partial<typeof a>).user as ArtistProfile['user'] | null | undefined;
            const name = a.business_name || (user ? `${user.first_name} ${user.last_name}` : 'Unknown Artist');

            return (
              <ArtistCard
                key={a.id}
                id={a.id}
                name={name}
                subtitle={a.custom_subtitle || undefined}
                imageUrl={a.profile_picture_url || a.portfolio_urls?.[0] || undefined}
                price={a.hourly_rate && a.price_visible ? `$${a.hourly_rate}` : undefined}
                location={a.location}
                specialties={a.specialties}
                verified={user?.is_verified}
                isAvailable={a.is_available}
                href={`/artists/${a.id}`}
              />
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
}

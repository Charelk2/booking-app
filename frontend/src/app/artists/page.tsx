'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { ArtistProfile } from '@/types';
import { getArtists } from '@/lib/api';
import api from '@/lib/api';

export default function ArtistsPage() {
  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchArtists = async () => {
      try {
        const response = await getArtists();
        setArtists(response.data);
      } catch (err) {
        console.error('Error fetching artists:', err);
        setError('Failed to load artists. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchArtists();
  }, []);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold text-gray-900">{error}</h2>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Our Artists</h1>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {artists.map((artist) => {
            // Build the profile‐pic URL (or fallback to first portfolio URL)
            const imageUrl = artist.profile_picture_url
              ? artist.profile_picture_url.startsWith('http')
                ? artist.profile_picture_url
                : `${api.defaults.baseURL}/static/${artist.profile_picture_url.replace(/^\/+/, '')}`
              : artist.portfolio_urls && artist.portfolio_urls.length > 0
              ? artist.portfolio_urls[0].startsWith('http')
                ? artist.portfolio_urls[0]
                : `${api.defaults.baseURL}/static/${artist.portfolio_urls[0].replace(/^\/+/, '')}`
              : null;

            return (
              <div
                key={`artistCard-${artist.id}`}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300"
              >
                <div className="aspect-w-16 aspect-h-9 bg-gray-200 flex items-center justify-center">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={`${artist.user.first_name} ${artist.user.last_name}`}
                      className="object-cover w-full h-48"
                    />
                  ) : (
                    <span className="text-gray-400 text-sm">No Image</span>
                  )}
                </div>
                <div className="p-6">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {artist.user.first_name} {artist.user.last_name}
                  </h2>
                  <p className="mt-2 text-gray-600 truncate">{artist.description || ''}</p>
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-gray-900">Specialties:</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {artist.specialties?.map((specialty) => (
                        <span
                          key={`artist-${artist.id}-spec-${specialty}`}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                        >
                          {specialty}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-6">
                    <Link href={`/artists/${artist.id}`} legacyBehavior passHref>
                      <a className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                        View Profile
                      </a>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
}

'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import ArtistCardCompact from '@/components/artist/ArtistCardCompact';
import { getArtists } from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import type { ArtistProfile, SearchParams } from '@/types';

interface ArtistsSectionProps {
  title: string;
  query?: Partial<SearchParams>;
  limit?: number;
  hideIfEmpty?: boolean;
}

function CardSkeleton() {
  return (
    <div className="rounded-xl bg-white overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-gray-200" />
      <div className="p-3 space-y-1">
        <div className="h-3 bg-gray-200 rounded" />
        <div className="h-2.5 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function ArtistsSection({
  title,
  query = {},
  limit = 12,
  hideIfEmpty = false,
}: ArtistsSectionProps) {
  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const serializedQuery = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    let isMounted = true;
    async function fetchArtists() {
      setLoading(true);
      try {
        const params = JSON.parse(serializedQuery) as Record<string, unknown>;
        const res = await getArtists({ ...(params as object), limit });
        if (isMounted) {
          setArtists(res.data.filter((a) => a.business_name || a.user));
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    fetchArtists();
    return () => {
      isMounted = false;
    };
  }, [serializedQuery, limit]);

  if (!loading && artists.length === 0 && hideIfEmpty) {
    return null;
  }

  const seeAllHref = `/search?${new URLSearchParams(query as Record<string, string>).toString()}`;
  const showSeeAll = artists.length === limit;

  return (
    <section className="full-width mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {showSeeAll && (
          <Link href={seeAllHref} className="text-sm text-brand hover:underline">
            See all
          </Link>
        )}
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2 md:gap-2">
          {Array.from({ length: limit }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : artists.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2 md:gap-2">
          {artists.map((a) => {
            const name = a.business_name || `${a.user.first_name} ${a.user.last_name}`;
            return (
              <ArtistCardCompact
                key={a.id}
                artistId={a.id}
                name={name}
                subtitle={a.custom_subtitle || undefined}
                imageUrl={
                  getFullImageUrl(a.profile_picture_url || a.portfolio_urls?.[0]) || undefined
                }
                price={
                  a.hourly_rate && a.price_visible ? Number(a.hourly_rate) : undefined
                }
                rating={a.rating ?? undefined}
                ratingCount={a.rating_count ?? undefined}
                location={a.location}
                categories={a.service_categories}
                href={`/artists/${a.id}`}
              />
            );
          })}
        </div>
      ) : (
        <p>No artists found.</p>
      )}
    </section>
  );
}

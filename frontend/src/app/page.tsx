export const revalidate = 60;

import MainLayout from '@/components/layout/MainLayout';
import ArtistsSection from '@/components/home/ArtistsSection';
import dynamic from 'next/dynamic';
const GoogleOneTap = dynamic(() => import('@/components/auth/GoogleOneTap'), { ssr: false });
import CategoriesCarousel from '@/components/home/CategoriesCarousel';

async function fetchInitial(category: string, limit = 12) {
  // Use absolute API base on the server to avoid relying on Next.js rewrites
  // during SSR/ISR. Relative fetches are not rewritten on the server.
  const API_BASE =
    process.env.SERVER_API_ORIGIN ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://api.booka.co.za' : 'http://localhost:8000');
  const fields = [
    'id',
    'business_name',
    'slug',
    'profile_picture_url',
    'custom_subtitle',
    'hourly_rate',
    'price_visible',
    'rating',
    'rating_count',
    'location',
    'service_categories',
    // Backend currently ignores dotted fields, but we keep these for backward compatibility.
    'user.first_name',
    'user.last_name',
  ];

  if (category === 'venue' || category === 'wedding_venue') {
    fields.push('venue_service_id');
  }

  const params = new URLSearchParams({
    limit: String(limit),
    category,
    sort: 'most_booked',
    // Full card fields so home strips can hydrate without an extra client fetch.
    fields: fields.join(','),
  });
  const url = `${API_BASE}/api/v1/service-provider-profiles/?${params.toString()}`;
  try {
    const attempt = async (n: number): Promise<Response> => {
      const res = await fetch(url, {
        // Cache on the server for ISR; backend also sets Cache-Control for CDN
        next: { revalidate: 60 },
        headers: { 'Content-Type': 'application/json' },
      });
      if ((res.status === 502 || res.status === 503 || res.status === 504) && n < 2) {
        // Lightweight retry for transient upstream errors
        const backoff = 200 * (n + 1);
        await new Promise((r) => setTimeout(r, backoff));
        return attempt(n + 1);
      }
      return res;
    };
    const res = await attempt(0);
    if (!res.ok) return [] as any[];
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
  } catch {
    // If the API host is unreachable (e.g., using production URL locally), fall back silently
    return [] as any[];
  }
}

export default async function HomePage() {
  // SSR all home strips so they hydrate like the Musicians row.
  const [
    musicians,
    photographers,
    videographers,
    caterers,
    djs,
    speakers,
    soundServices,
    venues,
    bartenders,
    mcHosts,
  ] = await Promise.all([
    fetchInitial('musician'),
    fetchInitial('photographer'),
    fetchInitial('videographer'),
    fetchInitial('caterer'),
    fetchInitial('dj'),
    fetchInitial('speaker'),
    fetchInitial('sound_service'),
    fetchInitial('venue'),
    fetchInitial('bartender'),
    fetchInitial('mc_host'),
  ]);

  return (
    <MainLayout>
      {/* Surface Google One Tap on the homepage for logged-out users */}
      <GoogleOneTap />
      <CategoriesCarousel />
      <ArtistsSection
        title="Musicians"
        query={{ category: 'musician', sort: 'most_booked' }}
        initialData={musicians}
        hideIfEmpty
      />
      <ArtistsSection
        title="Photography"
        query={{ category: 'photographer', sort: 'most_booked' }}
        initialData={photographers}
        hideIfEmpty
      />
      <ArtistsSection
        title="Videographers"
        query={{ category: 'videographer', sort: 'most_booked' }}
        initialData={videographers}
        hideIfEmpty
      />
      <ArtistsSection
        title="Catering"
        query={{ category: 'caterer', sort: 'most_booked' }}
        initialData={caterers}
        hideIfEmpty
      />
      <ArtistsSection
        title="DJs"
        query={{ category: 'dj', sort: 'most_booked' }}
        initialData={djs}
        hideIfEmpty
      />
      <ArtistsSection
        title="Speakers"
        query={{ category: 'speaker', sort: 'most_booked' }}
        initialData={speakers}
        hideIfEmpty
      />
      <ArtistsSection
        title="Sound Services"
        query={{ category: 'sound_service', sort: 'most_booked' }}
        initialData={soundServices}
        hideIfEmpty
      />
      <ArtistsSection
        title="Venues"
        query={{ category: 'venue', sort: 'most_booked' }}
        initialData={venues}
        hideIfEmpty
      />
      <ArtistsSection
        title="Bartending"
        query={{ category: 'bartender', sort: 'most_booked' }}
        initialData={bartenders}
        hideIfEmpty
      />
      <ArtistsSection
        title="MC & Hosts"
        query={{ category: 'mc_host', sort: 'most_booked' }}
        initialData={mcHosts}
        hideIfEmpty
      />
    </MainLayout>
  );
}

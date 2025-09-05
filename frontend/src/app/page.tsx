export const revalidate = 60;

import MainLayout from '@/components/layout/MainLayout'
import ArtistsSection from '@/components/home/ArtistsSection'
import dynamic from 'next/dynamic'
const GoogleOneTap = dynamic(() => import('@/components/auth/GoogleOneTap'), { ssr: false });

const CategoriesCarousel = dynamic(
  () => import('@/components/home/CategoriesCarousel'),
  { ssr: false },
)

async function fetchInitial(category: string, limit = 12) {
  // Use absolute API base on the server to avoid relying on Next.js rewrites
  // during SSR/ISR. Relative fetches are not rewritten on the server.
  const API_BASE =
    process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://api.booka.co.za' : 'http://localhost:8000');
  const params = new URLSearchParams({
    limit: String(limit),
    category,
    sort: 'most_booked',
    // Trim fields for homepage rows (keeps SSR lightweight and fast)
    fields: [
      'id',
      'business_name',
      'profile_picture_url',
      'custom_subtitle',
      'hourly_rate',
      'price_visible',
      'rating',
      'rating_count',
      'location',
      'service_categories',
      'user.first_name',
      'user.last_name',
    ].join(','),
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
  // Prefetch a few sections server-side so the page renders instantly
  const [musicians, photographers, videographers] = await Promise.all([
    fetchInitial('musician'),
    fetchInitial('photographer'),
    fetchInitial('videographer'),
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
        hideIfEmpty
      />
      <ArtistsSection
        title="DJs"
        query={{ category: 'dj', sort: 'most_booked' }}
        hideIfEmpty
      />
      <ArtistsSection
        title="Speakers"
        query={{ category: 'speaker', sort: 'most_booked' }}
        hideIfEmpty
      />
      <ArtistsSection
        title="Sound Services"
        query={{ category: 'sound_service', sort: 'most_booked' }}
        hideIfEmpty
      />
      <ArtistsSection
        title="Wedding Venues"
        query={{ category: 'wedding_venue', sort: 'most_booked' }}
        hideIfEmpty
      />
      <ArtistsSection
        title="Bartending"
        query={{ category: 'bartender', sort: 'most_booked' }}
        hideIfEmpty
      />
      <ArtistsSection
        title="MC & Hosts"
        query={{ category: 'mc_host', sort: 'most_booked' }}
        hideIfEmpty
      />
    </MainLayout>
  )
}

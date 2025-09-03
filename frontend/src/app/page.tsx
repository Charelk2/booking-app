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
  // Use same-origin proxy to avoid CORS/env drift in production
  const params = new URLSearchParams({ limit: String(limit), category, sort: 'newest' });
  try {
    const res = await fetch(`/api/v1/service-provider-profiles/?${params.toString()}`, {
      // Cache on the server for ISR; backend also sets Cache-Control for CDN
      next: { revalidate: 60 },
    });
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

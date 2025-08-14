import MainLayout from '@/components/layout/MainLayout'
import ArtistsSection from '@/components/home/ArtistsSection'
import dynamic from 'next/dynamic'

const CategoriesCarousel = dynamic(
  () => import('@/components/home/CategoriesCarousel'),
  { ssr: false },
)

export default function HomePage() {
  return (
    <MainLayout>
      <CategoriesCarousel />
      <ArtistsSection
        title="Musicians"
        query={{ category: 'musician', sort: 'most_booked' }}
        hideIfEmpty
      />
      <ArtistsSection
        title="Photography"
        query={{ category: 'photographer', sort: 'most_booked' }}
        hideIfEmpty
      />
      <ArtistsSection
        title="Videographers"
        query={{ category: 'videographer', sort: 'most_booked' }}
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

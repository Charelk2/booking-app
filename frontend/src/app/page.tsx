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
        title="Popular Musicians"
        query={{ category: 'musician', sort: 'most_booked' }}
        hideIfEmpty
      />
      <ArtistsSection
        title="Top Rated"
        query={{ sort: 'top_rated' }}
        hideIfEmpty
      />
      <ArtistsSection
        title="New on Booka"
        query={{ sort: 'newest' }}
        limit={100}
      />
    </MainLayout>
  )
}

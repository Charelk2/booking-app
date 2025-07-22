import MainLayout from '@/components/layout/MainLayout'
import Hero from '@/components/layout/Hero'
import ArtistsSection from '@/components/home/ArtistsSection'

export default function HomePage() {
  return (
    <MainLayout>
      <Hero />
      <ArtistsSection title="Popular Musicians" query={{ sort: 'popular' }} />
      <ArtistsSection title="Top Rated" query={{ sort: 'rating_desc' }} />
      <ArtistsSection title="New on Booka" query={{ sort: 'created_desc' }} />
    </MainLayout>
  )
}

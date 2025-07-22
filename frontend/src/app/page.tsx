import MainLayout from '@/components/layout/MainLayout'
import Hero from '@/components/layout/Hero'
import ArtistsSection from '@/components/home/ArtistsSection'

export default function HomePage() {
  return (
    <MainLayout>
      <Hero variant="plain" />
      <ArtistsSection
        title="Popular Musicians"
        query={{ sort: 'popular' }}
        hideIfEmpty
      />
      <ArtistsSection
        title="Top Rated"
        query={{ sort: 'rating_desc' }}
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

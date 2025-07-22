import MainLayout from '@/components/layout/MainLayout'
import MarketingStrip from '@/components/home/MarketingStrip'
import ArtistsSection from '@/components/home/ArtistsSection'

export default function HomePage() {
  return (
    <MainLayout>
      <MarketingStrip text="Book legendary artists across South Africa" />
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

import MainLayout from '@/components/layout/MainLayout'
import ArtistsSection from '@/components/home/ArtistsSection'
import CategoriesCarousel from '@/components/home/CategoriesCarousel'
import { UI_CATEGORY_TO_SERVICE, UI_CATEGORIES } from '@/lib/categoryMap'

interface HomePageProps {
  searchParams?: { category?: string }
}

export default function HomePage({ searchParams }: HomePageProps = {}) {
  const category = searchParams?.category
  const serviceName = category ? UI_CATEGORY_TO_SERVICE[category] : undefined
  const categoryLabel = category
    ? UI_CATEGORIES.find((c) => c.value === category)?.label
    : undefined

  return (
    <MainLayout>
      <CategoriesCarousel />
      {serviceName && categoryLabel && (
        <ArtistsSection
          title={`${categoryLabel} Service Providers`}
          query={{ category: serviceName }}
          hideIfEmpty
        />
      )}
      <ArtistsSection
        title="Popular Musicians"
        query={{ sort: 'most_booked' }}
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

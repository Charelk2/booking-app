import MainLayout from '@/components/layout/MainLayout'
import Link from 'next/link'
import HomeSearchForm from '@/components/landing/HomeSearchForm'
import Hero from '@/components/layout/Hero'

export default function HomePage() {
  return (
    <MainLayout>
      <Hero />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            <span className="block">Find and Book</span>
            <span className="block text-brand-dark">Your Favorite Artists</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Discover talented artists, book services, and manage your appointments all in one place.
          </p>
          <HomeSearchForm />
          <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
            <div className="rounded-md shadow">
              <Link href="/artists" legacyBehavior passHref>
                <a
                  className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-brand-dark hover:bg-brand-dark md:py-4 md:text-lg md:px-10"
                >
                  Browse Artists
                </a>
              </Link>
            </div>
            <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
              <Link href="/register" legacyBehavior passHref>
                <a
                  className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-brand-dark bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10"
                >
                  Sign Up
                </a>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
} 

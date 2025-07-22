import MainLayout from '@/components/layout/MainLayout'
import Link from 'next/link'
import HomeSearchForm from '@/components/landing/HomeSearchForm'

export default function HomePage() {
  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
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

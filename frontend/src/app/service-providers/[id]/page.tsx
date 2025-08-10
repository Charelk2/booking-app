'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Head from 'next/head';
import Image from 'next/image';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  ServiceProviderProfile,
  Service,
  Review as ReviewType,
} from '@/types';
import {
  getArtist,
  getArtistServices,
  getArtistReviews,
  createBookingRequest,
} from '@/lib/api';

import {
  StarIcon,
  MapPinIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import {
  getFullImageUrl,
  normalizeService,
} from '@/lib/utils';
import ServiceProviderServiceCard from '@/components/service-provider/ServiceProviderServiceCard';
import { Toast, Spinner, SkeletonList } from '@/components/ui';
import BookingWizard from '@/components/booking/BookingWizard';
import { BookingProvider } from '@/contexts/BookingContext';

// This profile page now lazy loads services and reviews separately so the main
// artist info appears faster. Images use the
// Next.js `<Image>` component for optimized loading.

export default function ServiceProviderProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const serviceProviderId = Number(params.id);

  const [artist, setArtist] = useState<ServiceProviderProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<ReviewType[]>([]);
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  useEffect(() => {
    if (!serviceProviderId) return;

    const fetchArtist = async () => {
      setLoading(true);
      try {
        const res = await getArtist(serviceProviderId);
        setArtist(res.data);
      } catch (err) {
        console.error('Error fetching artist:', err);
        setError('Failed to load artist profile');
      } finally {
        setLoading(false);
      }
    };

    fetchArtist();
  }, [serviceProviderId]);

  // load services independently so the section can render on demand
  useEffect(() => {
    if (!serviceProviderId) return;
    setServicesLoading(true);
    getArtistServices(serviceProviderId)
      .then((res) => {
        const processed = res.data.map((service: Service) =>
          normalizeService(service)
        );
        setServices(processed);
      })
      .catch((err) => {
        console.error('Error fetching services:', err);
      })
      .finally(() => setServicesLoading(false));
  }, [serviceProviderId]);

  // load reviews separately
  useEffect(() => {
    if (!serviceProviderId) return;
    setReviewsLoading(true);
    getArtistReviews(serviceProviderId)
      .then((res) => setReviews(res.data))
      .catch((err) => {
        console.error('Error fetching reviews:', err);
      })
      .finally(() => setReviewsLoading(false));
  }, [serviceProviderId]);

  const averageRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  const handleBookService = async (service: Service) => {
    if (
      service.service_type === 'Live Performance' ||
      service.service_type === 'Virtual Appearance'
    ) {
      setSelectedService(service);
      setIsBookingOpen(true);
      return;
    }
    try {
      const res = await createBookingRequest({
        artist_id: serviceProviderId,
        service_id: service.id,
      });
      router.push(`/booking-requests/${res.data.id}`);
    } catch (err) {
      console.error('Failed to create request', err);
      Toast.error('Failed to create request');
    }
  };

  const closeBooking = () => {
    setIsBookingOpen(false);
    setSelectedService(null);
  };

  if (loading) {
    return (
      <MainLayout hideFooter>
        <div className="flex justify-center items-center min-h-[80vh]">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    );
  }

  if (error || !artist) {
    return (
      <MainLayout hideFooter>
        <div className="text-center py-20" role="alert">
          <h2 className="text-2xl font-semibold text-gray-700">{error || 'Artist not found'}</h2>
        </div>
      </MainLayout>
    );
  }

  // Build full URLs for cover & profile photos
  const coverPhotoUrl = getFullImageUrl(artist.cover_photo_url);
  const profilePictureUrl = getFullImageUrl(artist.profile_picture_url);

  return (
    <>
      <Head>
        <title>{artist.business_name || `${artist.user.first_name} ${artist.user.last_name}`}</title>
        <meta
          property="og:title"
          content={artist.business_name || `${artist.user.first_name} ${artist.user.last_name}`}
        />
        {artist.description && (
          <meta property="og:description" content={artist.description} />
        )}
        {profilePictureUrl && <meta property="og:image" content={profilePictureUrl} />}
      </Head>
      <MainLayout hideFooter>
        <div className="md:flex bg-white">
          {/* Left Panel: image and host details */}
          <aside
            className="md:w-2/5 md:flex md:flex-col bg-white p-6 md:sticky md:self-start"
            style={{ top: '5.5rem' }}
          >
            <div
              className="relative h-32 md:h-48 overflow-hidden rounded-3xl"
              role="img"
              aria-label="Cover photo"
            >
              {coverPhotoUrl ? (
                <Image
                  src={coverPhotoUrl}
                  alt="Cover photo"
                  fill
                  priority
                  className="object-cover rounded-3xl"
                  sizes="(min-width: 768px) 40vw, 100vw"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  No cover photo
                </div>
              )}
            </div>
            <div className="pt-0 bg-white">
              <div className="flex flex-col items-center text-center">
                <div className="relative -mt-12">
                  {profilePictureUrl ? (
                    <Image
                      src={profilePictureUrl}
                      width={96}
                      height={96}
                      className="h-24 w-24 rounded-full object-cover shadow"
                      alt={artist.business_name || 'Artist'}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/static/default-avatar.svg';
                      }}
                    />
                  ) : (
                    <div className="h-24 w-24 rounded-full bg-gray-300 flex items-center justify-center text-gray-500 shadow">
                      <UserIcon className="h-12 w-12 text-gray-400" />
                    </div>
                  )}
                </div>
                <h1 className="mt-4 text-2xl font-bold text-gray-900">
                  {artist.business_name || `${artist.user.first_name} ${artist.user.last_name}`}
                </h1>
                {(artist.custom_subtitle || (!artist.custom_subtitle && artist.location)) && (
                  <p className="text-md text-gray-600">
                    {artist.custom_subtitle || artist.location}
                  </p>
                )}
                {artist.description && (
                  <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">
                    {artist.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-gray-500">
                  {artist.location && !artist.custom_subtitle && (
                    <span className="flex items-center">
                      <MapPinIcon className="h-4 w-4 mr-1" /> {artist.location}
                    </span>
                  )}
                  {averageRating && (
                    <span className="flex items-center">
                      <StarIcon className="h-4 w-4 mr-1 text-yellow-400" /> {averageRating} ({reviews.length} reviews)
                    </span>
                  )}
                </div>
                {artist.user.email && (
                  <p className="mt-4 text-sm">
                    Contact:{' '}
                    <a
                      href={`mailto:${artist.user.email}`}
                      className="text-brand-dark hover:underline"
                    >
                      {artist.user.email}
                    </a>
                  </p>
                )}
              </div>
            </div>
          </aside>

          {/* Right Panel: scrollable content */}
          <section className="md:w-3/5 p-6 space-y-8">
            {/* Services Section */}
            <section id="services" aria-labelledby="services-heading" role="region">
            
              {servicesLoading ? (
                <SkeletonList className="max-w-md" />
              ) : services.length > 0 ? (
                <ul className="space-y-6" role="list">
                  {services.map((service) => (
                    <li key={`service-${service.id}`}>
                      <ServiceProviderServiceCard
                        service={service}
                        onBook={handleBookService}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-600" role="status">
                  This artist currently has no services listed.
                </p>
              )}
            </section>

            {/* Reviews Section */}
            <section id="reviews" aria-labelledby="reviews-heading" role="region">
              <h2
                id="reviews-heading"
                className="text-2xl font-bold text-gray-800 mb-4"
              >
                Reviews ({reviews.length})
              </h2>
              {reviewsLoading ? (
                <SkeletonList className="max-w-md" />
              ) : reviews.length > 0 ? (
                <ul className="space-y-6" role="list">
                  {reviews.map((review) => (
                    <li
                      key={`review-${review.id}`}
                      className="bg-white p-4 rounded-lg shadow border border-gray-200"
                      role="listitem"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <StarIcon
                              key={`star-${review.id}-${i}`}
                              className={`h-5 w-5 ${
                                i < review.rating ? 'text-yellow-400' : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        {review.client?.first_name && (
                          <p className="text-sm font-medium text-gray-700 ml-3">
                            {review.client.first_name}
                          </p>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        {review.comment}
                      </p>
                      <p className="mt-2 text-xs text-gray-400">
                        Reviewed on: {new Date(review.created_at).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-600" role="status">
                  No reviews yet for this artist.
                </p>
              )}
            </section>
          </section>
        </div>
      </MainLayout>
      <BookingProvider>
        <BookingWizard
          artistId={serviceProviderId}
          serviceId={selectedService?.id}
          isOpen={isBookingOpen}
          onClose={closeBooking}
        />
      </BookingProvider>
    </>
  );
}

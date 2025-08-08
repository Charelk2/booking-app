'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Head from 'next/head';
import Image from 'next/image';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArtistProfile,
  Service,
  Review as ReviewType,
} from '@/types';
import {
  getArtist,
  getArtists,
  getArtistServices,
  getArtistReviews,
  createBookingRequest,
} from '@/lib/api';

import {
  StarIcon,
  MapPinIcon,
  UserIcon,
  GlobeAltIcon,
  ListBulletIcon,
  Squares2X2Icon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import {
  getFullImageUrl,
  normalizeService,
} from '@/lib/utils';
import ArtistServiceCard from '@/components/artist/ArtistServiceCard';
import { Button, Tag, Toast, Spinner, SkeletonList } from '@/components/ui';
import BookingWizard from '@/components/booking/BookingWizard';
import { BookingProvider } from '@/contexts/BookingContext';

// This profile page now lazy loads each section (services, reviews, other
// artists) separately so the main artist info appears faster. Images use the
// Next.js `<Image>` component for optimized loading.

export default function ArtistProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const artistId = Number(params.id);

  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<ReviewType[]>([]);
  const [otherArtists, setOtherArtists] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [othersLoading, setOthersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherView, setOtherView] = useState<'grid' | 'list'>('grid');
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  useEffect(() => {
    if (!artistId) return;

    const fetchArtist = async () => {
      setLoading(true);
      try {
        const res = await getArtist(artistId);
        setArtist(res.data);
      } catch (err) {
        console.error('Error fetching artist:', err);
        setError('Failed to load artist profile');
      } finally {
        setLoading(false);
      }
    };

    fetchArtist();
  }, [artistId]);

  // load services independently so the section can render on demand
  useEffect(() => {
    if (!artistId) return;
    setServicesLoading(true);
    getArtistServices(artistId)
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
  }, [artistId]);

  // load reviews separately
  useEffect(() => {
    if (!artistId) return;
    setReviewsLoading(true);
    getArtistReviews(artistId)
      .then((res) => setReviews(res.data))
      .catch((err) => {
        console.error('Error fetching reviews:', err);
      })
      .finally(() => setReviewsLoading(false));
  }, [artistId]);

  // load other artists separately
  useEffect(() => {
    if (!artistId) return;
    setOthersLoading(true);
    getArtists()
      .then((res) => {
        const filtered = res.data
          .filter((a) => a.user_id && a.user_id !== artistId)
          .slice(0, 3);
        setOtherArtists(filtered);
      })
      .catch((err) => {
        console.error('Error fetching other artists:', err);
      })
      .finally(() => setOthersLoading(false));
  }, [artistId]);

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
        artist_id: artistId,
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
      <MainLayout>
        <div className="flex justify-center items-center min-h-[80vh]">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    );
  }

  if (error || !artist) {
    return (
      <MainLayout>
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
      <MainLayout fullWidthContent>
        <div className="md:flex md:h-[calc(100vh-4rem)] md:overflow-hidden bg-gray-100">
          {/* Left Panel: image and host details */}
          <aside className="md:w-2/5 md:flex md:flex-col bg-gray-200">
            <div className="relative h-64 md:flex-grow" role="img" aria-label="Cover photo">
              {coverPhotoUrl ? (
                <Image
                  src={coverPhotoUrl}
                  alt="Cover photo"
                  fill
                  priority
                  className="object-cover"
                  sizes="(min-width: 768px) 40vw, 100vw"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  No cover photo
                </div>
              )}
            </div>
            <div className="p-6 bg-white">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  {profilePictureUrl ? (
                    <Image
                      src={profilePictureUrl}
                      width={128}
                      height={128}
                      className="h-32 w-32 rounded-full object-cover shadow"
                      alt={artist.business_name || 'Artist'}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/static/default-avatar.svg';
                      }}
                    />
                  ) : (
                    <div className="h-32 w-32 rounded-full bg-gray-300 flex items-center justify-center text-gray-500 shadow">
                      <UserIcon className="h-16 w-16 text-gray-400" />
                    </div>
                  )}
                  {user && user.user_type === 'artist' && artist.user_id === user.id && (
                    <button
                      type="button"
                      className="absolute bottom-0 right-0 p-1 bg-white rounded-full shadow focus:outline-none focus:ring-2 focus:ring-brand-dark"
                      aria-label="Edit profile photo"
                    >
                      <PencilIcon className="h-4 w-4 text-gray-600" />
                    </button>
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
          <section className="md:w-3/5 md:overflow-y-auto p-6 space-y-8">
            {/* About Section */}
            <section>
              <h2 className="text-xl font-semibold text-gray-800 mb-3">About</h2>
              {artist.description ? (
                <p className="text-gray-600 whitespace-pre-line">{artist.description}</p>
              ) : (
                <p className="text-gray-500" role="status">
                  Bio has not been added yet.
                </p>
              )}
            </section>

            {/* Specialties Section */}
            <section aria-labelledby="specialties-heading" role="region">
              <h2
                id="specialties-heading"
                className="text-xl font-semibold text-gray-800 mb-3"
              >
                Specialties
              </h2>
              {artist.specialties && artist.specialties.length > 0 ? (
                <div className="flex flex-wrap gap-2" role="list">
                  {artist.specialties.map((specialty) => (
                    <Tag key={`${artist.id}-spec-${specialty}`}>{specialty}</Tag>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600" role="status">
                  No specialties listed.
                </p>
              )}
            </section>

            {/* Portfolio / Links Section */}
            <section aria-labelledby="links-heading" role="region">
              <h2
                id="links-heading"
                className="text-xl font-semibold text-gray-800 mb-3"
              >
                Links & Portfolio
              </h2>
              {artist.portfolio_urls && artist.portfolio_urls.length > 0 ? (
                <div className="flex flex-wrap gap-x-4 gap-y-3">
                  {artist.portfolio_urls.map((url, idx) => {
                    // Decide label/icon by URL domain
                    let text = 'Website';
                    const IconComponent = GlobeAltIcon;
                    const cleaned = url.toLowerCase();
                    if (cleaned.includes('instagram.com')) text = 'Instagram';
                    else if (cleaned.includes('youtube') || cleaned.includes('youtu.be'))
                      text = 'YouTube';
                    else if (cleaned.includes('spotify.com')) text = 'Spotify';
                    else if (cleaned.includes('facebook.com')) text = 'Facebook';
                    else if (cleaned.includes('twitter.com') || cleaned.includes('x.com'))
                      text = 'Twitter / X';
                    else if (cleaned.includes('linkedin.com')) text = 'LinkedIn';
                    else if (cleaned.includes('behance.net')) text = 'Behance';
                    else if (cleaned.includes('dribbble.com')) text = 'Dribbble';
                    else if (cleaned.includes('soundcloud.com')) text = 'SoundCloud';
                    else {
                      try {
                        const hostname = new URL(
                          url.startsWith('http') ? url : `http://${url}`
                        ).hostname;
                        text = hostname.replace('www.', '');
                      } catch {
                        text = 'Link';
                      }
                    }

                    return (
                      <a
                        key={`${artist.id}-link-${idx}`}
                        href={url.startsWith('http') ? url : `http://${url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm text-brand-dark hover:text-brand-dark hover:underline bg-brand-light hover:bg-brand-light px-3 py-1.5 rounded-md transition-colors duration-150 shadow-sm border border-brand-light"
                      >
                        <IconComponent className="h-4 w-4 mr-2 text-brand" />
                        {text}
                      </a>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-600" role="status">
                  No links added yet.
                </p>
              )}
            </section>

            {/* Services Section */}
            <section id="services" aria-labelledby="services-heading" role="region">
              <h2
                id="services-heading"
                className="text-2xl font-bold text-gray-800 mb-6"
              >
                Services Offered
              </h2>
              {servicesLoading ? (
                <SkeletonList className="max-w-md" />
              ) : services.length > 0 ? (
                <ul className="space-y-6" role="list">
                  {services.map((service) => (
                    <li key={`service-${service.id}`}>
                      <ArtistServiceCard
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

            {/* Explore Other Artists Section */}
            {othersLoading ? (
              <SkeletonList className="mt-16 max-w-md mx-auto" />
            ) : otherArtists.length > 0 ? (
              <section
                className="mt-16 pt-8 border-t border-gray-200"
                aria-labelledby="other-artists-heading"
                role="region"
              >
                <h2
                  id="other-artists-heading"
                  className="text-2xl font-bold text-gray-800 mb-8 text-center"
                >
                  Explore Other Artists
                </h2>
                <div className="flex justify-end mb-4">
                  <Button
                    type="button"
                    onClick={() => setOtherView('grid')}
                    variant={otherView === 'grid' ? 'primary' : 'secondary'}
                    className="mr-2 p-2"
                    aria-label="Grid view"
                  >
                    <Squares2X2Icon className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setOtherView('list')}
                    variant={otherView === 'list' ? 'primary' : 'secondary'}
                    className="p-2"
                    aria-label="List view"
                  >
                    <ListBulletIcon className="h-5 w-5" />
                  </Button>
                </div>
                <div
                  className={
                    otherView === 'grid'
                      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8'
                      : 'space-y-4'
                  }
                >
                  {otherArtists.map((otherArtist) => {
                    const otherProfilePicUrl = getFullImageUrl(
                      otherArtist.profile_picture_url
                    );
                    return (
                      <Link
                        href={`/artists/${otherArtist.user_id}`}
                        key={`otherArtist-${otherArtist.user_id}`}
                        className="block group"
                      >
                        <div className="bg-white rounded-lg shadow-lg overflow-hidden transform transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl">
                          <div className="h-48 bg-gray-200 flex items-center justify-center overflow-hidden">
                            {otherProfilePicUrl ? (
                              <Image
                                src={otherProfilePicUrl}
                                alt={
                                  otherArtist.business_name ||
                                  `${otherArtist.user.first_name} ${otherArtist.user.last_name}`
                                }
                                width={300}
                                height={300}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                              />
                            ) : (
                              <UserIcon className="h-16 w-16 text-gray-400" />
                            )}
                          </div>
                          <div className="p-4">
                            <h3 className="text-lg font-semibold text-gray-800 truncate group-hover:text-brand-dark">
                              {otherArtist.business_name ||
                                `${otherArtist.user.first_name} ${otherArtist.user.last_name}`}
                            </h3>
                            {otherArtist.location && (
                              <p className="text-sm text-gray-500 flex items-center mt-1">
                                <MapPinIcon className="h-4 w-4 mr-1.5 text-gray-400" />{' '}
                                {otherArtist.location}
                              </p>
                            )}
                            {otherArtist.specialties &&
                              otherArtist.specialties.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {otherArtist.specialties
                                    .slice(0, 2)
                                    .map((spec) => (
                                      <Tag
                                        key={`other-${otherArtist.user_id}-spec-${spec}`}
                                        className="px-2 py-0.5 text-xs"
                                      >
                                        {spec}
                                      </Tag>
                                    ))}
                                  {otherArtist.specialties.length > 2 && (
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 font-medium">
                                      + {otherArtist.specialties.length - 2} more
                                    </span>
                                  )}
                                </div>
                              )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : (
              <p className="mt-16 text-center text-gray-600" role="status">
                No other artists to explore at the moment.
              </p>
            )}
          </section>
        </div>
      </MainLayout>
      <BookingProvider>
        <BookingWizard
          artistId={artistId}
          serviceId={selectedService?.id}
          isOpen={isBookingOpen}
          onClose={closeBooking}
        />
      </BookingProvider>
    </>
  );
}

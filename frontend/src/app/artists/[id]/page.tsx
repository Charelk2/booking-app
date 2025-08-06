'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import ArtistCardCompact from '@/components/artist/ArtistCardCompact';
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
        <meta property="og:title" content={artist.business_name || `${artist.user.first_name} ${artist.user.last_name}`} />
        {artist.description && <meta property="og:description" content={artist.description} />}
        {profilePictureUrl && <meta property="og:image" content={profilePictureUrl} />}
      </Head>
      <MainLayout>
      <div className="bg-gray-100">
        {/* ── Cover Photo Banner ─────────────────────────────────────────────────────── */}
        <div className="relative h-64 md:h-96 bg-gray-300" role="img" aria-label="Cover photo">
          {coverPhotoUrl ? (
            <Image
              src={coverPhotoUrl}
              alt="Cover photo"
              fill
              priority
              className="object-cover"
              sizes="(min-width: 768px) 100vw, 100vw"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              No cover photo
            </div>
          )}
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          {/* ── Profile Header ────────────────────────────────────────────────────────── */}
          <div className="relative pt-16 pb-8">
            <div className="flex flex-col md:flex-row md:flex-nowrap items-center md:items-end space-y-4 md:space-y-0 md:space-x-5">
              <div className="relative flex-shrink-0 -mt-16 md:-mt-20">
                {profilePictureUrl ? (
                  <Image
                    src={profilePictureUrl}
                    width={160}
                    height={160}
                    className="h-32 w-32 md:h-40 md:w-40 rounded-full ring-4 ring-white object-cover shadow-lg"
                    alt={artist.business_name || 'Artist'}
                    priority
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/static/default-avatar.svg';
                    }}
                  />
                ) : (
                  <div className="h-32 w-32 md:h-40 md:w-40 rounded-full ring-4 ring-white bg-gray-300 flex items-center justify-center text-gray-500 shadow-lg">
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
              <div className="pt-3 md:pt-10 text-center md:text-left flex-1 min-w-0">
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900 truncate md:break-words">
                  {artist.business_name || `${artist.user.first_name} ${artist.user.last_name}`}
                </h1>
                {(artist.custom_subtitle || (!artist.custom_subtitle && artist.location)) && (
                  <p className="text-md text-gray-600">
                    {artist.custom_subtitle || artist.location}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1 text-sm text-gray-500">
                  {artist.location && !artist.custom_subtitle && (
                    <span className="flex items-center">
                      <MapPinIcon className="h-4 w-4 mr-1" /> {artist.location}
                    </span>
                  )}
                  {averageRating && (
                    <span className="flex items-center">
                      <StarIcon className="h-4 w-4 mr-1 text-yellow-400" /> {averageRating} ({reviews.length}{' '}
                      reviews)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>


          <div className="space-y-8">
              {/* “About” Section */}
              <section>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">About</h2>
                {artist.description ? (
                  <p className="text-gray-600 whitespace-pre-line">{artist.description}</p>
                ) : (
                  <p className="text-gray-500" role="status">Bio has not been added yet.</p>
                )}
              </section>

              {/* “Specialties” Section */}
              <section aria-labelledby="specialties-heading" role="region">
                <h2 id="specialties-heading" className="text-xl font-semibold text-gray-800 mb-3">Specialties</h2>
                {artist.specialties && artist.specialties.length > 0 ? (
                  <div className="flex flex-wrap gap-2" role="list">
                    {artist.specialties.map((specialty) => (
                      <Tag key={`${artist.id}-spec-${specialty}`}>{specialty}</Tag>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600" role="status">No specialties listed.</p>
                )}
              </section>

              {/* “Portfolio / Links” Section */}
              <section aria-labelledby="links-heading" role="region">
                <h2 id="links-heading" className="text-xl font-semibold text-gray-800 mb-3">Links & Portfolio</h2>
                {artist.portfolio_urls && artist.portfolio_urls.length > 0 ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-3">
                    {artist.portfolio_urls.map((url, idx) => {
                      // Decide label/icon by URL domain
                      let text = 'Website';
                      const IconComponent = GlobeAltIcon;
                      const cleaned = url.toLowerCase();
                      if (cleaned.includes('instagram.com')) text = 'Instagram';
                      else if (cleaned.includes('youtube') || cleaned.includes('youtu.be')) text = 'YouTube';
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
                          const hostname = new URL(url.startsWith('http') ? url : `http://${url}`).hostname;
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
                  <p className="text-gray-600" role="status">No links added yet.</p>
                )}
              </section>

              {/* “Services” Section */}
              <section id="services" aria-labelledby="services-heading" role="region">
                <h2 id="services-heading" className="text-2xl font-bold text-gray-800 mb-6">Services Offered</h2>
                {servicesLoading ? (
                  <SkeletonList className="max-w-md" />
                ) : services.length > 0 ? (
                  <ul className="space-y-6" role="list">
                    {services.map((service) => (
                      <li key={`service-${service.id}`}>
                        <ArtistServiceCard service={service} onBook={handleBookService} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-600" role="status">This artist currently has no services listed.</p>
                )}
              </section>

              {/* “Reviews” Section */}
              <section id="reviews" aria-labelledby="reviews-heading" role="region">
                <h2 id="reviews-heading" className="text-2xl font-bold text-gray-800 mb-4">Reviews ({reviews.length})</h2>
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
                        <p className="text-gray-600 text-sm leading-relaxed">{review.comment}</p>
                        <p className="mt-2 text-xs text-gray-400">
                          Reviewed on: {new Date(review.created_at).toLocaleDateString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-600" role="status">No reviews yet for this artist.</p>
                )}
              </section>
            </div>


          {/* ── “Explore Other Artists” Section ─────────────────────────────────────────── */}
          {othersLoading ? (
            <SkeletonList className="mt-16 max-w-md mx-auto" />
          ) : otherArtists.length > 0 ? (
            <section className="mt-16 pt-8 border-t border-gray-200" aria-labelledby="other-artists-heading" role="region">
              <h2 id="other-artists-heading" className="text-2xl font-bold text-gray-800 mb-8 text-center">
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
                    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'
                    : 'space-y-4'
                }
              >
                {otherArtists.map((otherArtist) => {
                  const name =
                    otherArtist.business_name ||
                    `${otherArtist.user.first_name} ${otherArtist.user.last_name}`;
                  return (
                    <ArtistCardCompact
                      key={`otherArtist-${otherArtist.id}`}
                      artistId={otherArtist.id}
                      name={name}
                      subtitle={otherArtist.custom_subtitle || undefined}
                      imageUrl={
                        getFullImageUrl(
                          otherArtist.profile_picture_url ||
                            otherArtist.portfolio_urls?.[0]
                        ) || undefined
                      }
                      price={
                        otherArtist.hourly_rate && otherArtist.price_visible
                          ? Number(otherArtist.hourly_rate)
                          : undefined
                      }
                      rating={otherArtist.rating ?? undefined}
                      ratingCount={otherArtist.rating_count ?? undefined}
                      location={otherArtist.location}
                      href={`/artists/${otherArtist.id}`}
                      className={otherView === 'grid' ? undefined : 'w-full'}
                    />
                  );
                })}
              </div>
            </section>
          ) : (
            <p className="mt-16 text-center text-gray-600" role="status">
              No other artists to explore at the moment.
            </p>
          )}
        </div>
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

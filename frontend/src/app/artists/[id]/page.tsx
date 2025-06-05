'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
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
  getArtistAvailability,
  createBookingRequest,
} from '@/lib/api';

import {
  StarIcon,
  MapPinIcon,
  BriefcaseIcon,
  EnvelopeIcon,
  UserIcon,
  PhoneIcon,
  GlobeAltIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import {
  getFullImageUrl,
  normalizeService,
  getNextAvailableDates,
} from '@/lib/utils';

export default function ArtistProfilePage() {
  const params = useParams();
  const router = useRouter();
  const artistId = Number(params.id);

  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<ReviewType[]>([]);
  const [otherArtists, setOtherArtists] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nextAvailableDates, setNextAvailableDates] = useState<Date[]>([]);

  useEffect(() => {
    if (!artistId) return;

    const fetchPageData = async () => {
      setLoading(true);
      try {
        const [
          artistRes,
          servicesRes,
          reviewsRes,
          allArtistsRes,
          availabilityRes,
        ] = await Promise.all([
          getArtist(artistId),
          getArtistServices(artistId),
          getArtistReviews(artistId),
          getArtists(),
          getArtistAvailability(artistId),
        ]);
        setArtist(artistRes.data);
        const processedServices = servicesRes.data.map((service: Service) =>
          normalizeService(service)
        );
        setServices(processedServices);
        setReviews(reviewsRes.data);

        const nextDates = getNextAvailableDates(
          availabilityRes.data.unavailable_dates,
          5,
        );
        setNextAvailableDates(nextDates);

        // pick up to 3 other artists (excluding this one)
        const filtered = allArtistsRes.data
          .filter((a) => a.user_id && a.user_id !== artistId)
          .slice(0, 3);
        setOtherArtists(filtered);
      } catch (err) {
        console.error('Error fetching page data:', err);
        setError('Failed to load artist profile or related data');
      } finally {
        setLoading(false);
      }
    };

    fetchPageData();
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
      router.push(`/booking?artist_id=${artistId}&service_id=${service.id}`);
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
      alert('Failed to create request');
    }
  };



  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[80vh]">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600" />
        </div>
      </MainLayout>
    );
  }

  if (error || !artist) {
    return (
      <MainLayout>
        <div className="text-center py-20">
          <h2 className="text-2xl font-semibold text-gray-700">{error || 'Artist not found'}</h2>
        </div>
      </MainLayout>
    );
  }

  // Build full URLs for cover & profile photos
  const coverPhotoUrl = getFullImageUrl(artist.cover_photo_url);
  const profilePictureUrl = getFullImageUrl(artist.profile_picture_url);

  return (
    <MainLayout>
      <div className="bg-gray-100">
        {/* ── Cover Photo Banner ─────────────────────────────────────────────────────── */}
        <div
          className={`h-64 md:h-96 bg-gray-300 ${coverPhotoUrl ? 'bg-cover bg-center' : ''}`}
          style={{ backgroundImage: coverPhotoUrl ? `url(${coverPhotoUrl})` : 'none' }}
        >
          {!coverPhotoUrl && (
            <div className="h-full flex items-center justify-center text-gray-500">
              No cover photo
            </div>
          )}
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          {/* ── Profile Header ────────────────────────────────────────────────────────── */}
          <div className="-mt-12 sm:-mt-16 md:-mt-20 lg:-mt-24 pb-8">
            <div className="flex flex-col md:flex-row items-center md:items-end space-y-4 md:space-y-0 md:space-x-5">
              {profilePictureUrl ? (
                <img
                  className="h-32 w-32 md:h-40 md:w-40 rounded-full ring-4 ring-white object-cover shadow-lg"
                  src={profilePictureUrl}
                  alt={artist.business_name || 'Artist'}
                />
              ) : (
                <div className="h-32 w-32 md:h-40 md:w-40 rounded-full ring-4 ring-white bg-gray-300 flex items-center justify-center text-gray-500 shadow-lg">
                  <UserIcon className="h-16 w-16 text-gray-400" />
                </div>
              )}
              <div className="pt-3 md:pt-10 text-center md:text-left">
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                  {artist.business_name || `${artist.user.first_name} ${artist.user.last_name}`}
                </h1>
                {artist.business_name && (
                  <p className="text-md text-gray-600">
                    {artist.user.first_name} {artist.user.last_name}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1 text-sm text-gray-500">
                  {artist.location && (
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

          <section id="contact" className="mb-8 space-y-6 p-6 bg-white rounded-2xl shadow-md border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 border-b pb-3">Contact</h3>
            {averageRating ? (
              <div className="flex items-center text-sm text-gray-700">
                <StarIcon className="h-5 w-5 text-yellow-400 mr-1" />
                {averageRating} ({reviews.length})
              </div>
            ) : (
              <div className="h-5" />
            )}

            <p className="text-gray-600 text-sm flex items-center">
              <EnvelopeIcon className="h-5 w-5 mr-2 text-gray-500" /> Email: {artist.user.email}
            </p>
            {artist.user.phone_number && (
              <p className="text-gray-600 text-sm flex items-center">
                <PhoneIcon className="h-5 w-5 mr-2 text-gray-500" /> Phone: {artist.user.phone_number}
              </p>
            )}

            {nextAvailableDates.length > 0 && (
              <p className="text-sm text-gray-500 flex items-center mt-4">
                <CalendarDaysIcon className="h-5 w-5 mr-2 text-gray-500" />
                Next available: {format(nextAvailableDates[0], 'MMM d')}
              </p>
            )}
          </section>

          <div className="space-y-8">
              {/* “About” Section */}
              {artist.description && (
                <section>
                  <h2 className="text-xl font-semibold text-gray-800 mb-3">
                    About {artist.user.first_name}
                  </h2>
                  <p className="text-gray-600 whitespace-pre-line">{artist.description}</p>
                </section>
              )}

              {/* “Specialties” Section */}
              {artist.specialties && artist.specialties.length > 0 && (
                <section>
                  <h2 className="text-xl font-semibold text-gray-800 mb-3">Specialties</h2>
                  <div className="flex flex-wrap gap-2">
                    {artist.specialties.map((specialty) => (
                      <span
                        key={`${artist.id}-spec-${specialty}`}
                        className="px-3 py-1 text-sm rounded-full bg-indigo-100 text-indigo-700 font-medium"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* “Portfolio / Links” Section */}
              {artist.portfolio_urls && artist.portfolio_urls.length > 0 && (
                <section>
                  <h2 className="text-xl font-semibold text-gray-800 mb-3">Links & Portfolio</h2>
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
                          className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors duration-150 shadow-sm border border-indigo-200"
                        >
                          <IconComponent className="h-4 w-4 mr-2 text-indigo-500" />
                          {text}
                        </a>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* “Services” Section */}
              <section id="services">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Services Offered</h2>
                {services.length > 0 ? (
                  <div className="space-y-6">
                    {services.map((service) => (
                      <div
                        key={`service-${service.id}`}
                        className="bg-white p-6 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow"
                      >
                        <h3 className="text-xl font-semibold text-gray-900">{service.title}</h3>
                        {service.description && (
                          <p className="mt-2 text-gray-600 text-sm">{service.description}</p>
                        )}
                        <p className="mt-1 text-sm text-gray-500">Type: {service.service_type}</p>
                        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-2xl font-bold text-gray-800">${Number(service.price).toFixed(2)}</p>
                          <p className="text-sm text-gray-500">
                            <BriefcaseIcon className="h-4 w-4 inline mr-1" /> {service.duration_minutes} minutes
                          </p>
                        </div>
                        <button
                          onClick={() => handleBookService(service)}
                          className="mt-6 w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                        >
                          Book Now
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">This artist currently has no services listed.</p>
                )}
              </section>

              {/* “Reviews” Section */}
              <section id="reviews">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Reviews ({reviews.length})</h2>
                {reviews.length > 0 ? (
                  <div className="space-y-6">
                    {reviews.map((review) => (
                      <div
                        key={`review-${review.id}`}
                        className="bg-white p-4 rounded-lg shadow border border-gray-200"
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
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">No reviews yet for this artist.</p>
                )}
              </section>
            </div>


          {/* ── “Explore Other Artists” Section ─────────────────────────────────────────── */}
          {otherArtists.length > 0 && (
            <section className="mt-16 pt-8 border-t border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 mb-8 text-center">
                Explore Other Artists
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {otherArtists.map((otherArtist) => {
                  const otherProfilePicUrl = getFullImageUrl(otherArtist.profile_picture_url);
                  return (
                    <Link
                      href={`/artists/${otherArtist.user_id}`}
                      key={`otherArtist-${otherArtist.user_id}`}
                      className="block group"
                    >
                      <div className="bg-white rounded-lg shadow-lg overflow-hidden transform transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl">
                        <div className="h-48 bg-gray-200 flex items-center justify-center overflow-hidden">
                          {otherProfilePicUrl ? (
                            <img
                              src={otherProfilePicUrl}
                              alt={
                                otherArtist.business_name ||
                                otherArtist.user.first_name
                              }
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <UserIcon className="h-16 w-16 text-gray-400" />
                          )}
                        </div>
                        <div className="p-4">
                          <h3 className="text-lg font-semibold text-gray-800 truncate group-hover:text-indigo-600">
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
                                {otherArtist.specialties.slice(0, 2).map((spec) => (
                                  <span
                                    key={`other-${otherArtist.user_id}-spec-${spec}`}
                                    className="px-2 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-600 font-medium"
                                  >
                                    {spec}
                                  </span>
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
          )}
        </div>
      </div>
    </MainLayout>
  );
}

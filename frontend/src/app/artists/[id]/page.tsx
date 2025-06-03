'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import {
  ArtistProfile,
  Service,
  Review as ReviewType,
  BookingRequestCreate,
} from '@/types';
import {
  getArtist,
  getArtists,
  getArtistServices,
  getArtistReviews,
  createBookingRequest,
} from '@/lib/api';
import { extractErrorMessage } from '@/lib/utils';
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
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import '@/styles/custom-calendar.css';
import { getFullImageUrl } from '@/lib/utils';

export default function ArtistProfilePage() {
  const params = useParams();
  const artistId = Number(params.id);

  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<ReviewType[]>([]);
  const [otherArtists, setOtherArtists] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── “Request to Book” form state ─────────────────────────
  const [isRequesting, setIsRequesting] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | ''>('');
  const [proposedDateTime, setProposedDateTime] = useState<string>(''); // e.g. "2025-06-10T14:30"
  const [requestMessage, setRequestMessage] = useState<string>('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  // TODO: replace with your actual Auth logic to get current client’s ID
  const currentUserId =  123;

  const [calendarDate, setCalendarDate] = useState<Date | null>(new Date());
  const bookingSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!artistId) return;

    const fetchPageData = async () => {
      setLoading(true);
      try {
        const [artistRes, servicesRes, reviewsRes, allArtistsRes] = await Promise.all([
          getArtist(artistId),
          getArtistServices(artistId),
          getArtistReviews(artistId),
          getArtists(),
        ]);
        setArtist(artistRes.data);
        const processedServices = servicesRes.data.map((service: Service) => ({
          ...service,
          price:
            typeof service.price === 'string'
              ? parseFloat(service.price)
              : service.price,
          duration_minutes:
            typeof service.duration_minutes === 'string'
              ? parseInt(service.duration_minutes as unknown as string, 10)
              : service.duration_minutes,
        }));
        setServices(processedServices);
        setReviews(reviewsRes.data);

        // pick up to 3 other artists (excluding this one)
        const filtered = allArtistsRes.data
          .filter((a) => a.user_id !== artistId)
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

  const handleScrollToBooking = () => {
    bookingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const onOpenRequestForm = () => {
    setRequestError(null);
    setRequestSuccess(null);
    setSelectedServiceId('');
    setProposedDateTime('');
    setRequestMessage('');
    setIsRequesting(true);
  };

  const onSubmitBookingRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError(null);
    setRequestSuccess(null);

    if (!artist) {
      setRequestError('Artist data not loaded.');
      return;
    }
    if (selectedServiceId === '') {
      setRequestError('Please select a service to request.');
      return;
    }
    setRequestLoading(true);

    try {
      const payload: BookingRequestCreate = {
        artist_id: artist.user_id,
        service_id: Number(selectedServiceId),
      };
      if (requestMessage.trim() !== '') {
        payload.message = requestMessage.trim();
      }
      if (proposedDateTime) {
        payload.proposed_datetime_1 = new Date(proposedDateTime).toISOString();
      }

      await createBookingRequest(payload);
      setRequestSuccess('Your booking request has been sent!');

      setTimeout(() => {
        setIsRequesting(false);
        setRequestSuccess(null);
      }, 2000);
    } catch (err: any) {
      console.error('Error creating booking request:', err);
      if (err.response?.data?.detail) {
        setRequestError(extractErrorMessage(err.response.data.detail));
      } else {
        const msg = err.message || 'Failed to send booking request. Please try again.';
        setRequestError(msg);
      }
    } finally {
      setRequestLoading(false);
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

          <div className="lg:grid lg:grid-cols-3 lg:gap-8">
            {/* ── Left Two-Thirds: About / Services / Reviews ────────────────────────── */}
            <div className="lg:col-span-2 space-y-8">
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
                      let IconComponent = GlobeAltIcon;
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
                        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-2xl font-bold text-gray-800">${Number(service.price).toFixed(2)}</p>
                          <p className="text-sm text-gray-500">
                            <BriefcaseIcon className="h-4 w-4 inline mr-1" /> {service.duration_minutes} minutes
                          </p>
                        </div>
                        <button
                          onClick={handleScrollToBooking}
                          className="mt-6 w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                        >
                          Book {service.title}
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

            {/* ── Right-third: Contact & Booking Form ───────────────────────────────────── */}
            <aside
              ref={bookingSectionRef}
              id="booking-contact-sidebar"
              className="lg:col-span-1 mt-12 lg:mt-0"
            >
              <div className="sticky top-24 space-y-6 p-6 bg-white rounded-lg shadow-lg border border-gray-200">
                <h3 className="text-xl font-semibold text-gray-800 border-b pb-3">Contact & Booking</h3>

                <p className="text-gray-600 text-sm flex items-center">
                  <EnvelopeIcon className="h-5 w-5 mr-2 text-gray-500" /> Email: {artist.user.email}
                </p>
                {artist.user.phone_number && (
                  <p className="text-gray-600 text-sm flex items-center">
                    <PhoneIcon className="h-5 w-5 mr-2 text-gray-500" /> Phone: {artist.user.phone_number}
                  </p>
                )}

                <div className="mt-6">
                  <h4 className="text-md font-medium text-gray-700 mb-3 flex items-center">
                    <CalendarDaysIcon className="h-5 w-5 mr-2 text-gray-500" /> Availability
                  </h4>
                  <Calendar
                    onChange={(value) => setCalendarDate(value as Date | null)}
                    value={calendarDate}
                    className="rounded-md border border-gray-300 shadow-sm w-full"
                    tileClassName="text-sm p-1 md:p-2"
                    view="month"
                  />
                  <p className="mt-3 text-xs text-gray-500 text-center">
                    (Select a date/time below to request booking)
                  </p>
                </div>

                {isRequesting ? (
                  <form onSubmit={onSubmitBookingRequest} className="space-y-3">
                    {/* 1) Service dropdown */}
                    <label className="block text-sm font-medium text-gray-700">
                      Choose Service *
                    </label>
                    <select
                      value={selectedServiceId}
                      onChange={(e) =>
                        setSelectedServiceId(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      className="block w-full border border-gray-300 bg-white rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    >
                      <option value="">— Select a Service —</option>
                      {services.map((srv) => (
                        <option key={`srvOption-${srv.id}`} value={srv.id}>
                          {srv.title} (${Number(srv.price).toFixed(2)})
                        </option>
                      ))}
                    </select>

                    {/* 2) Proposed date & time */}
                    <label className="block text-sm font-medium text-gray-700">
                      Proposed Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={proposedDateTime}
                      onChange={(e) => setProposedDateTime(e.target.value)}
                      className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />

                    {/* 3) Optional message */}
                    <label className="block text-sm font-medium text-gray-700">
                      Message (optional)
                    </label>
                    <textarea
                      value={requestMessage}
                      onChange={(e) => setRequestMessage(e.target.value)}
                      placeholder="Say something to the artist…"
                      className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      rows={3}
                    />

                    {requestError && <p className="text-sm text-red-600">{requestError}</p>}
                    {requestSuccess && <p className="text-sm text-green-600">{requestSuccess}</p>}

                    <button
                      type="submit"
                      disabled={requestLoading}
                      className={`w-full ${
                        requestLoading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'
                      } text-white py-2 px-4 rounded-md font-medium transition-colors`}
                    >
                      {requestLoading ? 'Sending…' : 'Send Booking Request'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRequesting(false)}
                      className="w-full mt-1 text-center text-gray-700 text-sm underline hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={onOpenRequestForm}
                    className="w-full bg-rose-500 text-white py-3 px-4 rounded-lg hover:bg-rose-600 font-semibold text-lg transition-colors"
                  >
                    Request to Book Artist
                  </button>
                )}
              </div>
            </aside>
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

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  getServiceProvider,
  getServiceProviderServices,
  getServiceProviderReviews,
  createBookingRequest,
} from '@/lib/api';

import {
  StarIcon,
  MapPinIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

import { getFullImageUrl, normalizeService } from '@/lib/utils';
import { Toast, Spinner, SkeletonList } from '@/components/ui';
import BookingWizard from '@/components/booking/BookingWizard';
import { BookingProvider } from '@/contexts/BookingContext';

export default function ServiceProviderProfilePage() {
  const params = useParams();
  const router = useRouter();
  useAuth(); // reserved for future user-specific UI
  const serviceProviderId = Number(params.id);

  const [serviceProvider, setServiceProvider] = useState<ServiceProviderProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<ReviewType[]>([]);
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Booking/flow state
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  // Mobile-only: service picker sheet
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);

  // Shared: service details modal (now for both mobile and desktop)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailedService, setDetailedService] = useState<Service | null>(null);

  const servicesRef = useRef<HTMLDivElement | null>(null);

  // Helpers
  const formatZAR = (val?: number | string | null) => {
    let num = typeof val === 'string' ? parseFloat(val) : val;
    if (typeof num !== 'number' || isNaN(num)) {
      return 'Price not available'; // Fallback text
    }
    return Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(num);
  };

  const getServicePrice = (s: Service) => {
    return (s as any).base_price || (s as any).price || (s as any).cost || null; // Customize keys as needed
  };

  const getServiceImage = (s: Service, sp: ServiceProviderProfile) => {
    // try common normalized keys; fall back to provider images
    const candidate =
      (s as any).image_url ||
      (s as any).cover_image_url ||
      (s as any).photo_url ||
      (s as any).image ||
      sp.cover_photo_url ||
      sp.profile_picture_url ||
      null;
    return candidate ? getFullImageUrl(candidate) : null;
  };

  // — Fetch profile
  useEffect(() => {
    if (!serviceProviderId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await getServiceProvider(serviceProviderId);
        setServiceProvider(res.data);
      } catch (err) {
        console.error('Error fetching service provider:', err);
        setError('Failed to load service provider profile');
      } finally {
        setLoading(false);
      }
    })();
  }, [serviceProviderId]);

  // — Fetch services
  useEffect(() => {
    if (!serviceProviderId) return;
    setServicesLoading(true);
    getServiceProviderServices(serviceProviderId)
      .then((res) => {
        const normalized = res.data.map((s: Service) => normalizeService(s));
        console.log('Normalized services:', normalized); // For debugging
        setServices(normalized);
      })
      .catch((err) => console.error('Error fetching services:', err))
      .finally(() => setServicesLoading(false));
  }, [serviceProviderId]);

  // — Fetch reviews
  useEffect(() => {
    if (!serviceProviderId) return;
    setReviewsLoading(true);
    getServiceProviderReviews(serviceProviderId)
      .then((res) => setReviews(res.data))
      .catch((err) => console.error('Error fetching reviews:', err))
      .finally(() => setReviewsLoading(false));
  }, [serviceProviderId]);

  // Demo fallback: if this is Spoegwolf and no reviews returned, show 6 sample reviews (5×4★, 1×1★)
  const displayReviews = useMemo(() => {
    const name = (serviceProvider?.business_name || '').toLowerCase();
    if (name.includes('spoegwolf') && reviews.length === 0) {
      const samples: ReviewType[] = Array.from({ length: 6 }).map((_, i) => ({
        id: 10000 + i,
        booking_id: 0,
        rating: i === 0 ? 1 : 4,
        comment: i === 0 ? 'Had some issues on the day, but overall okay.' : 'Great experience! Professional and on time.',
        created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
        updated_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      } as any));
      return samples;
    }
    return reviews;
  }, [serviceProvider?.business_name, reviews]);

  const averageRating = useMemo(() => {
    if (!reviews.length) return null;
    return (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
  }, [reviews]);

  const handleBookService = async (service: Service) => {
    if (service.service_type === 'Live Performance' || service.service_type === 'Virtual Appearance') {
      setSelectedService(service);
      setIsBookingOpen(true);
      return;
    }
    try {
      const res = await createBookingRequest({
        artist_id: serviceProviderId,
        service_id: service.id,
        service_provider_id: 0
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

  const openDetails = (service: Service) => {
    setDetailedService(service);
    setIsDetailsOpen(true);
  };

  const openMobileServicePicker = (prefillId?: number) => {
    if (!services.length) return;
    setSelectedServiceId(prefillId ?? null);
    setIsServicePickerOpen(true);
  };

  const confirmMobileServiceChoice = () => {
    if (!selectedServiceId) return;
    const svc = services.find((s) => s.id === selectedServiceId);
    if (svc) handleBookService(svc);
    setIsServicePickerOpen(false);
  };

  if (loading) {
    return (
      <MainLayout hideFooter>
        <div className="flex justify-center items-center min-h-[70vh] px-4">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    );
  }

  if (error || !serviceProvider) {
    return (
      <MainLayout hideFooter>
        <div className="text-center py-16 px-6" role="alert">
          <h2 className="text-xl font-semibold text-gray-800">{error || 'Service Provider not found'}</h2>
        </div>
      </MainLayout>
    );
  }

  const coverPhotoUrl = getFullImageUrl(serviceProvider.cover_photo_url);
  const profilePictureUrl = getFullImageUrl(serviceProvider.profile_picture_url);
  const displayName =
    serviceProvider.business_name ||
    `${serviceProvider.user.first_name} ${serviceProvider.user.last_name}`;

  // Not a hook → safe even with early returns
  const selectedServiceObj = services.find((s) => s.id === selectedServiceId) ?? null;


  return (
    <>
      <Head>
        <title>{displayName}</title>
        <meta property="og:title" content={displayName} />
        {serviceProvider.description && <meta property="og:description" content={serviceProvider.description} />}
        {profilePictureUrl && <meta property="og:image" content={profilePictureUrl} />}
      </Head>

      <MainLayout hideFooter>
        <div className="bg-white">
          {/* ========== MOBILE (md:hidden) — hero + service list with thumbnails ========== */}
          <section className="md:hidden">
            {/* HERO */}
            <div className="relative h-44 w-full overflow-hidden">
              {coverPhotoUrl ? (
                <Image src={coverPhotoUrl} alt="Cover photo" fill priority className="object-cover" sizes="100vw" />
              ) : (
                <div className="h-full w-full bg-gray-100" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
            </div>

            <div className="-mt-10 px-4">
              <div className="relative bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-4">
                  <div className="relative -mt-10 h-20 w-20 shrink-0 rounded-full ring-4 ring-white overflow-hidden bg-gray-200">
                    {profilePictureUrl ? (
                      <Image src={profilePictureUrl} alt={displayName} fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <UserIcon className="h-10 w-10 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold text-gray-900 truncate">{displayName}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                      {serviceProvider.location && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 border border-gray-200">
                          <MapPinIcon className="h-4 w-4" />
                          {serviceProvider.location}
                        </span>
                      )}
                      {averageRating && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 border border-amber-100 text-amber-700">
                          <StarIcon className="h-4 w-4" />
                          {averageRating} ({reviews.length})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {serviceProvider.custom_subtitle && (
                  <p className="mt-3 text-sm text-gray-700">{serviceProvider.custom_subtitle}</p>
                )}
                {serviceProvider.description && (
                  <p className="mt-3 text-sm text-gray-700 whitespace-pre-line">{serviceProvider.description}</p>
                )}
                {serviceProvider.user.email && (
                  <p className="mt-4 text-sm">
                    <span className="text-gray-600">Contact: </span>
                    <a href={`mailto:${serviceProvider.user.email}`} className="text-brand-dark hover:underline">
                      {serviceProvider.user.email}
                    </a>
                  </p>
                )}
              </div>
            </div>

            {/* CONTENT */}
            <div className="mx-auto max-w-5xl px-4 mt-6 space-y-8">
              {/* Services (thumbnails + name/price, fully clickable) */}
              <section ref={servicesRef} id="services" aria-labelledby="services-heading" role="region">
                <h2 id="services-heading" className="text-lg font-bold text-gray-900">
                  Services
                </h2>

                <div className="mt-4">
                  {servicesLoading ? (
                    <SkeletonList className="max-w-md" />
                  ) : services.length > 0 ? (
                    <ul className="space-y-3" role="list">
                      {services.map((s) => {
                        const img = getServiceImage(s, serviceProvider);
                        return (
                          <li key={`svc-mobile-${s.id}`} role="listitem">
                            <button
                              onClick={() => openDetails(s)}
                              className="group w-full rounded-xl border border-gray-100 p-3 shadow-sm hover:border-gray-200 active:scale-[0.99] transition"
                              aria-label={`View ${s.title || s.service_type}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative h-16 w-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                                  {img ? (
                                    <Image src={img} alt="" fill className="object-cover" sizes="64px" />
                                  ) : (
                                    <div className="h-full w-full bg-gray-100" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-base font-semibold text-left text-gray-900 truncate">
                                    {s.title || s.service_type}
                                  </p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                                    {s.service_type && (
                                      <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 border border-gray-200">
                                        {s.service_type}
                                      </span>
                                    )}
                                    {(s as any).duration || (s as any).duration_minutes ? (
                                      <span>
                                        {(s as any).duration ??
                                          `${(s as any).duration_minutes} min`}
                                      </span>
                                    ) : null}
                                  </div>
                                  {s.description && (
                                    <p className="mt-1 text-sm text-left text-gray-600 line-clamp-2">
                                      {s.description}
                                    </p>
                                  )}
                                </div>
                                <div className="ml-2 shrink-0 text-sm font-semibold text-gray-900">
                                  {formatZAR(getServicePrice(s))}
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-gray-600" role="status">
                      This service provider currently has no services listed.
                    </p>
                  )}
                </div>
              </section>

              {/* Reviews */}
              <section id="reviews" aria-labelledby="reviews-heading" role="region">
                <h2 id="reviews-heading" className="text-lg font-bold text-gray-900">
                  Reviews ({reviews.length})
                </h2>

                <div className="mt-4">
                  {reviewsLoading ? (
                    <SkeletonList className="max-w-md" />
                  ) : reviews.length > 0 ? (
                    <ul className="space-y-4" role="list">
                      {reviews.map((review) => (
                        <li
                          key={`review-mobile-${review.id}`}
                          className="bg-white p-4 rounded-xl shadow-sm border border-gray-100"
                          role="listitem"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center">
                              {[...Array(5)].map((_, i) => (
                                <StarIcon
                                  key={`star-${review.id}-${i}`}
                                  className={`h-5 w-5 ${i < review.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                                />
                              ))}
                            </div>
                            {review.client?.first_name && (
                              <p className="text-sm font-medium text-gray-700 shrink-0">{review.client.first_name}</p>
                            )}
                          </div>
                          {review.comment && (
                            <p className="mt-2 text-gray-700 text-sm leading-relaxed">{review.comment}</p>
                          )}
                          <p className="mt-2 text-xs text-gray-400">
                            Reviewed on: {new Date(review.created_at).toLocaleDateString()}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-600" role="status">
                      No reviews yet for this service provider.
                    </p>
                  )}
                </div>
              </section>
            </div>

            {/* Sticky mobile action bar */}
            {services.length > 0 && (
              <div className="md:hidden sticky bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/80 supports-[backdrop-filter]:bg-white/60 backdrop-blur px-4 py-3">
                <div className="mx-auto max-w-5xl">
                  <button
                    onClick={() => openMobileServicePicker()}
                    className="w-full inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-semibold bg-gray-900 text-white shadow-sm active:scale-[0.99] transition disabled:opacity-50"
                    disabled={!services.length}
                    aria-label="Request booking"
                  >
                    Request booking
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ========== DESKTOP (hidden on mobile) — optimized two-column layout with clickable service cards ========== */}
          <section className="hidden md:block">
            <div className="md:flex px-6 bg-white">
              {/* Left Panel: image and host details (enhanced with better spacing and shadows) */}
              <aside
                className="md:w-2/5 md:flex md:flex-col bg-white p-6 md:sticky md:self-start md:border-r md:border-gray-100"
                style={{ top: '5.5rem' }}
              >
                <div className="relative h-48 overflow-hidden rounded-3xl shadow-sm" role="img" aria-label="Cover photo">
                  {coverPhotoUrl ? (
                    <Image
                      src={coverPhotoUrl}
                      alt="Cover photo"
                      fill
                      priority
                      className="object-cover rounded-3xl"
                      sizes="40vw"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500">No cover photo</div>
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
                          className="h-24 w-24 rounded-full object-cover shadow-md ring-4 ring-white"
                          alt={displayName}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/static/default-avatar.svg';
                          }}
                        />
                      ) : (
                        <div className="h-24 w-24 rounded-full bg-gray-300 flex items-center justify-center text-gray-500 shadow-md ring-4 ring-white">
                          <UserIcon className="h-12 w-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <h1 className="mt-4 text-2xl font-bold text-gray-900">{displayName}</h1>
                    {(serviceProvider.custom_subtitle || (!serviceProvider.custom_subtitle && serviceProvider.location)) && (
                      <p className="text-md text-gray-600">
                        {serviceProvider.custom_subtitle || serviceProvider.location}
                      </p>
                    )}
                    {serviceProvider.description && (
                      <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">
                        {serviceProvider.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-gray-500">
                      {serviceProvider.location && !serviceProvider.custom_subtitle && (
                        <span className="flex items-center">
                          <MapPinIcon className="h-4 w-4 mr-1" /> {serviceProvider.location}
                        </span>
                      )}
                      {averageRating && (
                        <span className="flex items-center">
                          <StarIcon className="h-4 w-4 mr-1 text-yellow-400" /> {averageRating} ({reviews.length} reviews)
                        </span>
                      )}
                    </div>
                    {serviceProvider.user.email && (
                      <p className="mt-4 text-sm">
                        Contact:{' '}
                        <a href={`mailto:${serviceProvider.user.email}`} className="text-brand-dark hover:underline">
                          {serviceProvider.user.email}
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              </aside>

              {/* Right Panel: scrollable content (optimized with clickable cards, hover effects, transitions) */}
              <section className="md:w-3/5 p-6 space-y-12">
                {/* Services Section */}
                <section id="services-desktop" aria-labelledby="services-heading-desktop" role="region">
                  
                  {servicesLoading ? (
                    <SkeletonList className="max-w-md" />
                  ) : services.length > 0 ? (
                    <ul className="space-y-6" role="list">
                      {services.map((service) => {
                        const img = getServiceImage(service, serviceProvider);
                        const duration = (service as any).duration || `${(service as any).duration_minutes} min` || null;
                        return (
                          <li key={`service-desktop-${service.id}`}>
                            <div
                              className="group cursor-pointer rounded-xl border-gray-200 bg-white p-4  hover:shadow-md hover:border-gray-300 transition-all duration-200 ease-in-out min-h-[180px]"
                              onClick={() => openDetails(service)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter') openDetails(service); }}
                              aria-label={`View details for ${service.title || service.service_type}`}
                            >
                              <div className="flex gap-4 h-full">
                                <div className="relative h-32 w-32 rounded-lg overflow-hidden bg-gray-100 shrink-0 group-hover:scale-105 transition-transform duration-200">
                                  {img ? (
                                    <Image src={img} alt={service.title || service.service_type} fill className="object-cover" sizes="128px" />
                                  ) : (
                                    <div className="h-full w-full bg-gray-100 flex items-center justify-center text-gray-400">
                                      No image
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 flex flex-col justify-between">
                                  <div>
                                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-brand-dark transition-colors">
                                      {service.title || service.service_type}
                                    </h3>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                                      {service.service_type && (
                                        <span className="inline-flex items-center rounded-full bg-gray-50 px-3 py-1 border border-gray-200">
                                          {service.service_type}
                                        </span>
                                      )}
                                      {duration && <span>{duration}</span>}
                                    </div>
                                    {service.description && (
                                      <p className="mt-2 text-sm text-gray-700 line-clamp-3">
                                        {service.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col justify-between items-end">
                                  <p className="text-lg font-bold text-gray-900">
                                    {formatZAR(getServicePrice(service))}
                                  </p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleBookService(service);
                                    }}
                                    className="mt-4 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-gray-900 text-white shadow-sm hover:bg-gray-800 active:scale-[0.98] transition duration-150"
                                    aria-label={`Book ${service.title || service.service_type}`}
                                  >
                                    Book now
                                  </button>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-gray-600" role="status">
                      This service provider currently has no services listed.
                    </p>
                  )}
                </section>

                {/* Reviews Section (enhanced with better shadows and typography) */}
                <section id="reviews-desktop" aria-labelledby="reviews-heading-desktop" role="region">
                  <h2 id="reviews-heading-desktop" className="text-2xl font-bold text-gray-800 mb-6">
                    Reviews ({reviews.length})
                  </h2>
                  {reviewsLoading ? (
                    <SkeletonList className="max-w-md" />
                  ) : reviews.length > 0 ? (
                    <ul className="space-y-6" role="list">
                      {reviews.map((review) => (
                        <li
                          key={`review-desktop-${review.id}`}
                          className="bg-white p-5 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200"
                          role="listitem"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center">
                              {[...Array(5)].map((_, i) => (
                                <StarIcon
                                  key={`star-${review.id}-${i}`}
                                  className={`h-5 w-5 ${i < review.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                                />
                              ))}
                            </div>
                            {review.client?.first_name && (
                              <p className="text-sm font-medium text-gray-700 ml-3">{review.client.first_name}</p>
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
                    <p className="text-gray-600" role="status">
                      No reviews yet for this service provider.
                    </p>
                  )}
                </section>
              </section>
            </div>
          </section>
        </div>
      </MainLayout>

      {/* Booking modal (shared) */}
      <BookingProvider>
        <BookingWizard
          artistId={serviceProviderId}
          serviceId={selectedService?.id ?? undefined}
          isOpen={isBookingOpen}
          onClose={closeBooking}
        />
      </BookingProvider>

      {/* ===== Mobile Service Picker Sheet with images + rich summary ===== */}
      {isServicePickerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Choose a service to book">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsServicePickerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl">
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
              <div className="mx-auto max-w-5xl flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Select a service</h3>
                <button
                  onClick={() => setIsServicePickerOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-50"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="px-4 py-3">
              {/* Selected Service Summary */}
              {selectedServiceObj && (
                <div className="mb-4 overflow-hidden rounded-xl border border-gray-100">
                  <div className="relative h-40 w-full bg-gray-100">
                    {(() => {
                      const img = getServiceImage(selectedServiceObj, serviceProvider);
                      return img ? (
                        <Image src={img} alt="" fill className="object-cover" sizes="100vw" />
                      ) : (
                        <div className="h-full w-full bg-gray-100" />
                      );
                    })()}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {selectedServiceObj.title || selectedServiceObj.service_type}
                          </p>
                          <p className="text-white/80 text-xs">
                            {selectedServiceObj.service_type}
                            {(selectedServiceObj as any).duration || (selectedServiceObj as any).duration_minutes
                              ? ` • ${
                                  (selectedServiceObj as any).duration ??
                                  `${(selectedServiceObj as any).duration_minutes} min`
                                }`
                              : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-white text-sm font-semibold">
                          {formatZAR(getServicePrice(selectedServiceObj))}
                        </div>
                      </div>
                    </div>
                  </div>
                  {selectedServiceObj.description && (
                    <div className="p-3 text-sm text-gray-700">
                      {selectedServiceObj.description}
                    </div>
                  )}
                </div>
              )}

              {/* List of services (with thumbnails) */}
              {services.length ? (
                <ul className="space-y-3">
                  {services.map((s) => {
                    const img = getServiceImage(s, serviceProvider);
                    const checked = selectedServiceId === s.id;
                    return (
                      <li key={`picker-${s.id}`}>
                        <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:border-gray-300 cursor-pointer">
                          <input
                            type="radio"
                            name="service-picker"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={() => setSelectedServiceId(s.id)}
                            aria-label={`Select ${s.title || s.service_type}`}
                          />
                          <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                            {img ? (
                              <Image src={img} alt="" fill className="object-cover" sizes="56px" />
                            ) : (
                              <div className="h-full w-full bg-gray-100" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {s.title || s.service_type}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                              {s.service_type && (
                                <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 border border-gray-200">
                                  {s.service_type}
                                </span>
                              )}
                              {(s as any).duration || (s as any).duration_minutes ? (
                                <span>
                                  {(s as any).duration ??
                                    `${(s as any).duration_minutes} min`}
                                </span>
                              ) : null}
                            </div>
                            {s.description && (
                              <p className="mt-1 text-[13px] text-gray-600 line-clamp-2">
                                {s.description}
                              </p>
                            )}
                          </div>
                          <div className="ml-2 shrink-0 text-sm font-semibold text-gray-900">
                            {formatZAR(getServicePrice(s))}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-gray-600">No services available.</p>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setIsServicePickerOpen(false)}
                  className="w-1/2 inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmMobileServiceChoice}
                  disabled={!selectedServiceId}
                  className="w-1/2 inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Shared Service Details Modal (bottom sheet on mobile, centered on desktop) ===== */}
      {isDetailsOpen && detailedService && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Service details">
          <div
            className="absolute inset-0 bg-black/40 transition-opacity duration-200"
            onClick={() => setIsDetailsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl md:fixed md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:inset-auto md:max-w-lg md:max-h-[90vh] md:rounded-2xl transition-all duration-200 md:min-h-[400px]">
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3 md:py-4">
              <div className="mx-auto max-w-5xl flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900 md:text-lg truncate">
                  {detailedService.title || detailedService.service_type}
                </h3>
                <button
                  onClick={() => setIsDetailsOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-50"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="px-4 py-3 md:px-6 md:py-4 flex flex-col h-full">
              {/* Service Details Card */}
              <div className="mb-4 overflow-hidden rounded-xl border border-gray-100 shadow-sm flex-grow min-h-[200px]">
                <div className="relative h-40 w-full bg-gray-100 md:h-48">
                  {(() => {
                    const img = getServiceImage(detailedService, serviceProvider);
                    return img ? (
                      <Image src={img} alt="" fill className="object-cover" sizes="100vw" />
                    ) : (
                      <div className="h-full w-full bg-gray-100 flex items-center justify-center text-gray-400">
                        No image available
                      </div>
                    );
                  })()}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate md:text-base">
                          {detailedService.title || detailedService.service_type}
                        </p>
                        <p className="text-white/80 text-xs md:text-sm">
                          {detailedService.service_type}
                          {(detailedService as any).duration || (detailedService as any).duration_minutes
                            ? ` • ${
                                (detailedService as any).duration ??
                                `${(detailedService as any).duration_minutes} min`
                              }`
                            : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-white text-sm font-semibold md:text-base">
                        {formatZAR(getServicePrice(detailedService))}
                      </div>
                    </div>
                  </div>
                </div>
                {detailedService.description && (
                  <div className="p-3 text-sm text-gray-700 whitespace-pre-line md:p-4 md:text-base max-h-40 overflow-y-auto">
                    {detailedService.description}
                  </div>
                )}
              </div>

              <div className="mt-auto flex gap-3 pt-2">
                <button
                  onClick={() => setIsDetailsOpen(false)}
                  className="w-1/2 inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleBookService(detailedService);
                    setIsDetailsOpen(false);
                  }}
                  className="w-1/2 inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition"
                >
                  Book this service
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

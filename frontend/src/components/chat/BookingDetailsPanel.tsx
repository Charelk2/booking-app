'use client';

import React from 'react';

import { format, parseISO, isValid } from 'date-fns';
import { Booking, BookingRequest, Review, QuoteV2 } from '@/types';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import BookingSummaryCard from '@/components/chat/BookingSummaryCard';
import { getEventPrep, getMyServices } from '@/lib/api';
import { AddServiceCategorySelector } from '@/components/dashboard';
import { useRouter } from 'next/navigation';

interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string;
  location?: string;
  guests?: string;
  venueType?: string;
  soundNeeded?: string;
  notes?: string;
}

interface BookingDetailsPanelProps {
  bookingRequest: BookingRequest;
  parsedBookingDetails: ParsedBookingDetails | null;
  bookingConfirmed: boolean;
  confirmedBookingDetails: Booking | null;
  setShowReviewModal: (show: boolean) => void;
  paymentModal: React.ReactNode;
  quotes: Record<number, QuoteV2>;
  openPaymentModal: (args: { bookingRequestId: number; amount: number }) => void;
}

export default function BookingDetailsPanel({
  bookingRequest,
  parsedBookingDetails,
  bookingConfirmed,
  confirmedBookingDetails,
  setShowReviewModal,
  paymentModal,
  quotes,
  openPaymentModal,
}: BookingDetailsPanelProps) {
  const { user } = useAuth();
  const [eventType, setEventType] = React.useState<string | null>(null);
  const [guestsCount, setGuestsCount] = React.useState<number | null>(null);
  const [services, setServices] = React.useState<any[] | null>(null);
  const [loadingServices, setLoadingServices] = React.useState(false);
  const [showAddService, setShowAddService] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const bid = (confirmedBookingDetails as any)?.id;
    if (!bid) return;
    // If parsed booking details or local state already provide quick info, skip eager fetch
    const alreadyHave = Boolean(eventType) || Boolean(parsedBookingDetails?.eventType) || (guestsCount != null) || Boolean(parsedBookingDetails?.guests);
    if (alreadyHave) return;
    let cancelled = false;
    let handle: number | null = null;
    const schedule = (fn: () => void) => {
      try {
        const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout?: number }) => number);
        if (typeof ric === 'function') {
          handle = ric(fn, { timeout: 2000 });
          return;
        }
      } catch {}
      handle = window.setTimeout(fn, 1200);
    };
    schedule(() => {
      if (cancelled) return;
      getEventPrep(bid)
        .then((ep) => {
          if (cancelled) return;
          const et = (ep as any)?.event_type || null;
          const gc = (ep as any)?.guests_count;
          setEventType(et ? String(et) : null);
          setGuestsCount(typeof gc === 'number' ? gc : (gc != null ? Number(gc) : null));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      try {
        const cic = (window as any).cancelIdleCallback as undefined | ((h: number) => void);
        if (handle != null) {
          if (typeof cic === 'function') cic(handle);
          else clearTimeout(handle);
        }
      } catch {}
    };
  }, [confirmedBookingDetails?.id, parsedBookingDetails?.eventType, parsedBookingDetails?.guests, eventType, guestsCount]);

  // Detect Booka moderation thread (system-only updates)
  const isBookaThread = React.useMemo(() => {
    try {
      const synthetic = Boolean((bookingRequest as any)?.is_booka_synthetic);
      const txt = String((bookingRequest as any)?.last_message_content || '')
        .trim()
        .toLowerCase();
      return (
        synthetic ||
        txt === 'booka update' ||
        /^listing\s+(approved|rejected)\s*:/.test(String((bookingRequest as any)?.last_message_content || ''))
      );
    } catch {
      return false;
    }
  }, [bookingRequest]);

  // Load my services for Booka panel (useful links + quick overview)
  React.useEffect(() => {
    if (!isBookaThread || user?.user_type !== 'service_provider') return;
    let cancelled = false;
    setLoadingServices(true);
    getMyServices()
      .then((res) => {
        if (cancelled) return;
        setServices(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingServices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBookaThread, user?.user_type]);

  // Determine service type once for conditional UI
  const serviceTypeText = String(
    bookingRequest.service?.service_type ||
    bookingRequest.service?.service_category?.name ||
    ''
  ).toLowerCase();
  const isPersonalized = serviceTypeText.includes('personalized video');

  // Render a rich, action‑oriented panel for Booka updates
  if (isBookaThread) {
    const currentArtistId =
      (bookingRequest as any).service_provider_id ||
      (bookingRequest as any).artist_id ||
      (bookingRequest as any).artist?.id ||
      (bookingRequest as any).artist_profile?.user_id ||
      (bookingRequest as any).service?.service_provider_id ||
      (bookingRequest as any).service?.artist_id ||
      (bookingRequest as any).service?.artist?.user_id ||
      0;

    return (
      <div className="w-full flex flex-col h-full">
        <h4 className="mb-3 text-base font-semibold text-gray-900">Booka Updates</h4>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700 leading-6">
            We use this thread to send important updates about your listings and account.
            You’ll see approvals, rejections, and tips to improve your profile here.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <a
              href="/dashboard/artist"
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">Go to Dashboard</div>
              <div className="text-sm text-gray-700">Overview of your account and activity</div>
            </a>
            <a
              href="/dashboard/artist?tab=services"
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">Manage Services</div>
              <div className="text-sm text-gray-700">Create, update, or reorder your listings</div>
            </a>
            <a
              href="/dashboard/profile/edit"
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">Edit Profile</div>
              <div className="text-sm text-gray-700">Update photos, bio, genres, and pricing</div>
            </a>
            <a
              href={`/service-providers/${currentArtistId || ''}`}
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">View Public Profile</div>
              <div className="text-sm text-gray-700">Preview how clients see your page</div>
            </a>
            <a
              href="/dashboard/artist?tab=calendar"
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">Connect Google Calendar</div>
              <div className="text-sm text-gray-700">Keep availability up to date automatically</div>
            </a>
            <a
              href="/support"
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">Get Help</div>
              <div className="text-sm text-gray-700">Chat with support or read FAQs</div>
            </a>
          </div>

          <div className="mt-5">
            <div className="font-semibold mb-2">Your Services</div>
            {loadingServices ? (
              <div className="text-sm text-gray-600">Loading services…</div>
            ) : (services && services.length > 0) ? (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50">
                {services.slice(0, 6).map((s) => (
                  <li key={s.id} className="p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{s.title}</div>
                      <div className="text-xs text-gray-600 truncate">
                        {(s.service_category?.name || s.service_type || 'Service')}
                        {s.price ? ` • ZAR ${Number(s.price).toLocaleString()}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={
                        'inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold ' +
                        (String(s.status).toLowerCase() === 'approved'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : String(s.status).toLowerCase() === 'rejected'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200')
                      }>
                        {(String(s.status || 'pending_review').replace('_', ' ')).toUpperCase()}
                      </span>
                      <a
                        href={`/dashboard/artist?tab=services&serviceId=${s.id}`}
                        className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 no-underline hover:no-underline"
                      >
                        Edit
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-600">
                No services yet. <a href="/dashboard/artist?tab=services" className="text-indigo-700 font-semibold hover:text-indigo-800 no-underline hover:no-underline">Add your first service</a> to get listed.
              </div>
            )}
          </div>

          {/* Full-width action buttons below services */}
          <div className="mt-6 space-y-2">
            <button
              type="button"
              className="w-full block rounded-lg bg-black text-white px-4 py-2.5 text-sm font-semibold hover:bg-gray-900"
              onClick={() => setShowAddService(true)}
            >
              Create new service
            </button>
            <a
              href="/help/moderation"
              className="w-full block text-center rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 no-underline hover:no-underline"
            >
              Learn how moderation works
            </a>
            <a
              href="/support"
              className="w-full block text-center rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 no-underline hover:no-underline"
            >
              Contact support
            </a>
          </div>
        </div>

        {/* Inline category selector modal → routes to dashboard wizard */}
        <AddServiceCategorySelector
          isOpen={showAddService}
          onClose={() => setShowAddService(false)}
          onSelect={(catId) => {
            setShowAddService(false);
            try {
              router.push(`/dashboard/artist?tab=services&addCategory=${encodeURIComponent(catId)}`);
            } catch {}
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full">
      <h4 className="mb-3 text-base font-semibold text-gray-900">Booking Details</h4>

      {/* Removed the compact event glance to avoid duplication with the scrollable details */}
      {(() => {
        // Derive a robust artist/provider id for links and context
        const currentArtistId =
          // Canonical request-level id
          (bookingRequest as any).service_provider_id ||
          // Legacy alias
          (bookingRequest as any).artist_id ||
          // Expanded relations
          (bookingRequest as any).service_provider?.id ||
          (bookingRequest as any).artist?.id ||
          (bookingRequest as any).service_provider_profile?.user_id ||
          (bookingRequest as any).artist_profile?.user_id ||
          // From the linked service (canonical + deprecated + nested)
          (bookingRequest as any).service?.service_provider_id ||
          (bookingRequest as any).service?.artist_id ||
          (bookingRequest as any).service?.artist?.user_id ||
          0;

        // Prefer canonical provider image fields so next/image optimizes a real photo
        const imageUrl =
          // Service media (hero) if present
          (bookingRequest?.service?.media_url as any) ||
          // Explicit counterparty/avatar URL provided by thread preview/normalizer
          (bookingRequest as any)?.counterparty_avatar_url ||
          // Canonical profile fields
          (bookingRequest as any)?.service_provider_profile?.cover_photo_url ||
          (bookingRequest as any)?.service_provider_profile?.profile_picture_url ||
          (bookingRequest as any)?.service_provider?.profile_picture_url ||
          // Legacy aliases (back-compat)
          (bookingRequest as any)?.artist_profile?.cover_photo_url ||
          (bookingRequest as any)?.artist_profile?.profile_picture_url ||
          null;

        // Display name preference
        const artistName =
          (bookingRequest as any)?.service_provider_profile?.business_name ||
          (bookingRequest as any)?.service_provider?.business_name ||
          (bookingRequest as any)?.artist_profile?.business_name ||
          (bookingRequest as any)?.artist?.first_name ||
          undefined;

        const cancellationPolicy =
          (bookingRequest as any)?.service_provider_profile?.cancellation_policy ??
          (bookingRequest as any)?.artist_profile?.cancellation_policy ??
          null;

        return (
          <BookingSummaryCard
            parsedBookingDetails={parsedBookingDetails ?? undefined}
            imageUrl={imageUrl}
            serviceName={bookingRequest.service?.title}
            artistName={artistName}
            bookingConfirmed={bookingConfirmed}
            paymentInfo={{ status: null, amount: null, receiptUrl: null }}
            bookingDetails={confirmedBookingDetails}
            quotes={quotes}
            allowInstantBooking={false}
            openPaymentModal={openPaymentModal}
            bookingRequestId={bookingRequest.id}
            baseFee={Number(bookingRequest.service?.price || 0)}
            travelFee={Number(bookingRequest.travel_cost || 0)}
            initialSound={String(parsedBookingDetails?.soundNeeded || '').trim().toLowerCase() === 'yes'}
            artistCancellationPolicy={cancellationPolicy}
            currentArtistId={Number(currentArtistId) || 0}
            // Adapt panel for service type
            showTravel={!isPersonalized}
            showSound={!isPersonalized}
            showPolicy={!isPersonalized}
            showEventDetails={!isPersonalized}
            showReceiptBelowTotal={isPersonalized}
          />
        );
      })()}
      {bookingConfirmed &&
        confirmedBookingDetails?.status === 'completed' &&
        !(confirmedBookingDetails as Booking & { review?: Review }).review && (
          <div className="mt-4 text-center">
            <Button
              type="button"
              onClick={() => setShowReviewModal(true)}
              className="text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
            >
              Leave Review
            </Button>
          </div>
        )}
      {paymentModal}
    </div>
  );
}
// moved to chat folder

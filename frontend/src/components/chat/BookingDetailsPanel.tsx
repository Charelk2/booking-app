'use client';

import React from 'react';

import { format, parseISO, isValid } from 'date-fns';
import { Booking, BookingRequest, Review, QuoteV2 } from '@/types';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import BookingSummaryCard from '@/components/chat/BookingSummaryCard';
import { getEventPrep, getMyServices, getBookingRequestById } from '@/lib/api';
import { AddServiceCategorySelector } from '@/components/dashboard';
import { useRouter } from 'next/navigation';
import { parseBookingDetailsFromMessage } from '@/lib/chat/bookingDetails';

const providerIdentityCache = new Map<number, { name: string | null; avatar: string | null }>();

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

const DETAIL_KEYS: (keyof ParsedBookingDetails)[] = [
  'eventType',
  'description',
  'date',
  'location',
  'guests',
  'venueType',
  'soundNeeded',
  'notes',
];

interface BookingDetailsPanelProps {
  bookingRequest: BookingRequest;
  parsedBookingDetails: ParsedBookingDetails | null;
  bookingConfirmed: boolean;
  confirmedBookingDetails: Booking | null;
  setShowReviewModal: (show: boolean) => void;
  paymentModal: React.ReactNode;
  quotes: Record<number, QuoteV2>;
  quotesLoading: boolean;
  openPaymentModal: (args: { bookingRequestId: number; amount: number }) => void;
  onBookingDetailsParsed?: (details: ParsedBookingDetails | null) => void;
  onBookingDetailsHydrated?: (details: ParsedBookingDetails) => void;
  onHydratedBookingRequest?: (request: BookingRequest) => void;
}

export default function BookingDetailsPanel({
  bookingRequest,
  parsedBookingDetails,
  bookingConfirmed,
  confirmedBookingDetails,
  setShowReviewModal,
  paymentModal,
  quotes,
  quotesLoading,
  openPaymentModal,
  onBookingDetailsParsed,
  onBookingDetailsHydrated,
  onHydratedBookingRequest,
}: BookingDetailsPanelProps) {
  const { user } = useAuth();
  const [eventType, setEventType] = React.useState<string | null>(null);
  const [guestsCount, setGuestsCount] = React.useState<number | null>(null);
  const [services, setServices] = React.useState<any[] | null>(null);
  const [loadingServices, setLoadingServices] = React.useState(false);
  const [showAddService, setShowAddService] = React.useState(false);
  const router = useRouter();
  const requestId = React.useMemo(() => Number(bookingRequest?.id || 0), [bookingRequest?.id]);
  const providerProfile = React.useMemo(() => {
    return (
      (bookingRequest as any)?.service_provider_profile ||
      (bookingRequest as any)?.artist_profile ||
      null
    );
  }, [bookingRequest]);

  const viewerIsProvider = React.useMemo(() => {
    return Boolean(user && user.user_type === 'service_provider');
  }, [user]);

  const derivedProviderIdentity = React.useMemo(() => {
    const identity: { name: string | null; avatar: string | null } = { name: null, avatar: null };
    const normalize = (value: unknown): string | null => {
      if (value == null) return null;
      const str = String(value).trim();
      return str.length ? str : null;
    };

    const nameCandidates = [
      providerProfile?.business_name,
      (bookingRequest as any)?.service_provider?.business_name,
      (bookingRequest as any)?.service?.service_provider?.business_name,
      (bookingRequest as any)?.service?.artist?.business_name,
    ];
    for (const candidate of nameCandidates) {
      const next = normalize(candidate);
      if (next) {
        identity.name = next;
        break;
      }
    }

    const avatarCandidates = [
      providerProfile?.profile_picture_url,
      (bookingRequest as any)?.service_provider?.profile_picture_url,
      (bookingRequest as any)?.service?.service_provider?.profile_picture_url,
      (bookingRequest as any)?.service?.artist?.profile_picture_url,
    ];
    for (const candidate of avatarCandidates) {
      const next = normalize(candidate);
      if (next) {
        identity.avatar = next;
        break;
      }
    }

    if (viewerIsProvider) {
      if (!identity.name) {
        const profileUser =
          providerProfile?.user ||
          (bookingRequest as any)?.service_provider?.user ||
          (bookingRequest as any)?.service?.service_provider?.user ||
          (bookingRequest as any)?.service?.artist?.user ||
          null;
        const nameParts = [
          profileUser?.first_name,
          profileUser?.last_name,
        ]
          .map((part) => (typeof part === 'string' ? part.trim() : ''))
          .filter(Boolean);
        const authNameParts = [
          user?.first_name,
          user?.last_name,
        ]
          .map((part) => (typeof part === 'string' ? part.trim() : ''))
          .filter(Boolean);
        identity.name =
          (nameParts.length ? nameParts.join(' ') : null) ||
          (authNameParts.length ? authNameParts.join(' ') : null) ||
          identity.name;
      }
      if (!identity.avatar) {
        identity.avatar = normalize(user?.profile_picture_url) ?? identity.avatar;
      }
    } else {
      if (!identity.name) {
        identity.name = normalize((bookingRequest as any)?.counterparty_label) ?? identity.name;
      }
      if (!identity.avatar) {
        identity.avatar = normalize((bookingRequest as any)?.counterparty_avatar_url) ?? identity.avatar;
      }
    }

    return identity;
  }, [
    viewerIsProvider,
    providerProfile,
    bookingRequest,
    user?.first_name,
    user?.last_name,
    user?.profile_picture_url,
  ]);

  const derivedProviderName = derivedProviderIdentity.name;
  const derivedProviderAvatar = derivedProviderIdentity.avatar;

  const cachedIdentity = React.useMemo(() => {
    if (!requestId) return null;
    return providerIdentityCache.get(requestId) ?? null;
  }, [requestId]);

  const initialProviderName = React.useMemo(() => {
    return cachedIdentity?.name ?? derivedProviderName ?? null;
  }, [cachedIdentity?.name, derivedProviderName]);

  const initialProviderAvatar = React.useMemo(() => {
    return cachedIdentity?.avatar ?? derivedProviderAvatar ?? null;
  }, [cachedIdentity?.avatar, derivedProviderAvatar]);

  const [providerName, setProviderName] = React.useState<string | null>(initialProviderName);
  const [providerAvatarUrl, setProviderAvatarUrl] = React.useState<string | null>(initialProviderAvatar);
  const canonicalFetchedRef = React.useRef(false);
  const hasParsedDetails = React.useMemo(() => {
    return DETAIL_KEYS.some((key) => {
      const value = parsedBookingDetails?.[key];
      return value != null && String(value).trim().length > 0;
    });
  }, [parsedBookingDetails]);

  React.useEffect(() => {
    canonicalFetchedRef.current = false;
  }, [requestId]);

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
          const fallback: ParsedBookingDetails = {};
          if (et) fallback.eventType = String(et);
          if (typeof gc === 'number') fallback.guests = String(gc);
          if ((ep as any)?.notes) fallback.notes = String((ep as any)?.notes);
          const venueAddress =
            (ep as any)?.venue_address ||
            (ep as any)?.venue_name ||
            (ep as any)?.venue_description ||
            null;
          if (venueAddress) fallback.location = String(venueAddress);
          const fallbackDate =
            (confirmedBookingDetails as any)?.start_time ||
            (bookingRequest as any)?.proposed_datetime_1 ||
            (bookingRequest as any)?.proposed_datetime_2 ||
            (bookingRequest as any)?.event_date ||
            null;
          if (fallbackDate) fallback.date = String(fallbackDate);
          const soundContext = (bookingRequest as any)?.sound_context;
          const soundRequired =
            (bookingRequest as any)?.sound_required ??
            (bookingRequest as any)?.sound_needed ??
            (soundContext ? soundContext.sound_required : undefined);
          if (typeof soundRequired === 'boolean') {
            fallback.soundNeeded = soundRequired ? 'Yes' : 'No';
          } else if (typeof soundRequired === 'string' && soundRequired.trim().length) {
            fallback.soundNeeded = soundRequired.trim();
          } else if (soundContext?.mode && soundContext.mode !== 'none') {
            fallback.soundNeeded = 'Yes';
          }
          if (Object.keys(fallback).length) {
            try { onBookingDetailsHydrated?.(fallback); } catch {}
          }
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
  }, [
    confirmedBookingDetails?.id,
    confirmedBookingDetails?.start_time,
    parsedBookingDetails?.eventType,
    parsedBookingDetails?.guests,
    eventType,
    guestsCount,
    bookingRequest,
    onBookingDetailsHydrated,
  ]);

  // Reset provider identity whenever we switch threads or the payload updates
  React.useLayoutEffect(() => {
    if (providerName !== initialProviderName) {
      setProviderName(initialProviderName);
    }
    if (providerAvatarUrl !== initialProviderAvatar) {
      setProviderAvatarUrl(initialProviderAvatar);
    }
  }, [initialProviderName, initialProviderAvatar, providerName, providerAvatarUrl]);

  React.useEffect(() => {
    if (!requestId) return;
    const nextName = providerName ?? null;
    const nextAvatar = providerAvatarUrl ?? null;
    if (nextName == null && nextAvatar == null) return;
    const existing = providerIdentityCache.get(requestId);
    if (existing && existing.name === nextName && existing.avatar === nextAvatar) return;
    providerIdentityCache.set(requestId, { name: nextName, avatar: nextAvatar });
  }, [requestId, providerName, providerAvatarUrl]);

  // Load canonical provider identity if missing (ensures both roles see the same info)
  React.useEffect(() => {
    const profileHasName = Boolean(providerProfile?.business_name);
    const profileHasAvatar = Boolean(providerProfile?.profile_picture_url);
    const needIdentity = !(profileHasName && profileHasAvatar);
    const needDetails = !hasParsedDetails;
    const needCanonical = needIdentity || needDetails;
    if (canonicalFetchedRef.current) return;
    if (!needCanonical) return;
    if (!Number.isFinite(requestId) || requestId <= 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getBookingRequestById(requestId);
        if (cancelled) return;
        canonicalFetchedRef.current = true;
        const profile =
          (res?.data as any)?.service_provider_profile ||
          (res?.data as any)?.artist_profile ||
          null;
        const canonicalName = profile?.business_name
          ? String(profile.business_name)
          : derivedProviderName ?? providerName ?? null;
        const canonicalAvatar = profile?.profile_picture_url
          ? String(profile.profile_picture_url)
          : derivedProviderAvatar ?? providerAvatarUrl ?? null;
        if (canonicalName !== providerName) setProviderName(canonicalName);
        if (canonicalAvatar !== providerAvatarUrl) setProviderAvatarUrl(canonicalAvatar);
        if (canonicalName || canonicalAvatar) {
          providerIdentityCache.set(requestId, {
            name: canonicalName ?? null,
            avatar: canonicalAvatar ?? null,
          });
        }
        const detailsMessage = (res?.data as any)?.booking_details_message;
        if (detailsMessage) {
          try {
            const parsed = parseBookingDetailsFromMessage(detailsMessage);
            if (Object.keys(parsed).length) onBookingDetailsHydrated?.(parsed);
            onBookingDetailsParsed?.(parsed);
          } catch {}
        }
        try { onHydratedBookingRequest?.(res.data as BookingRequest); } catch {}
      } catch {
        // leave placeholders; upstream data must be fixed
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    requestId,
    providerName,
    providerAvatarUrl,
    providerProfile?.business_name,
    providerProfile?.profile_picture_url,
    derivedProviderName,
    derivedProviderAvatar,
    hasParsedDetails,
    onHydratedBookingRequest,
    bookingRequest,
  ]);

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

        const resolvedAvatar = providerAvatarUrl ?? derivedProviderAvatar ?? null;
        const resolvedName = providerName ?? derivedProviderName ?? null;

        const imageUrl = resolvedAvatar ? String(resolvedAvatar) : null;
        const artistName = resolvedName ?? undefined;

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
            quotesLoading={quotesLoading}
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

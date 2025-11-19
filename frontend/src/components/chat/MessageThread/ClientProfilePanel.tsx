"use client";

import * as React from "react";
import { XMarkIcon, ShieldCheckIcon, StarIcon, UserIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Spinner } from "@/components/ui";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type ProviderReview = {
  id: number;
  rating: number;
  comment: string;
  created_at: string;
  provider?: { id: number; business_name?: string | null; city?: string | null };
  booking?: { id: number; event_date?: string | null; service_title?: string | null };
};

type ClientProfile = {
  user: {
    id: number;
    first_name: string;
    last_name: string;
    profile_picture_url?: string | null;
    member_since_year?: number | null;
  };
  stats: {
    completed_events: number;
    cancelled_events: number;
    avg_rating: number | null;
    reviews_count: number;
  };
  verifications: {
    email_verified: boolean;
    phone_verified: boolean;
    payment_verified: boolean;
  };
  reviews: ProviderReview[];
};

type Props = {
  clientId: number;
  clientName?: string;
  clientAvatarUrl?: string | null;
  providerName?: string | null;
  bookingRequestId: number;
  canReview?: boolean;
  isOpen: boolean;
  autoOpenReview?: boolean;
  onClose: () => void;
};

type ReviewForm = {
  rating: number;
  comment: string;
};

export default function ClientProfilePanel({
  clientId,
  clientName,
  clientAvatarUrl,
  providerName,
  bookingRequestId,
  canReview,
  isOpen,
  autoOpenReview,
  onClose,
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<ClientProfile | null>(null);
  const [showAllReviews, setShowAllReviews] = React.useState(false);
  const [isReviewOpen, setIsReviewOpen] = React.useState(false);
  const [reviewForm, setReviewForm] = React.useState<ReviewForm>({ rating: 5, comment: "" });
  const [submittingReview, setSubmittingReview] = React.useState(false);
  const [hasExistingReviewForBooking, setHasExistingReviewForBooking] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen || !clientId) return;
    let cancelled = false;
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl(`/api/v1/users/${clientId}/profile`), {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`Failed to load profile (${res.status})`);
        }
        const data = (await res.json()) as ClientProfile;
        if (!cancelled) setProfile(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [isOpen, clientId]);

  React.useEffect(() => {
    if (!isOpen || !autoOpenReview) return;
    setIsReviewOpen(true);
    setReviewForm({ rating: 5, comment: "" });
  }, [isOpen, autoOpenReview]);

  const displayName =
    clientName ||
    (profile ? `${profile.user.first_name || ""} ${profile.user.last_name || ""}`.trim() : "Client");

  const visibleReviews = React.useMemo(() => {
    const all = profile?.reviews || [];
    if (showAllReviews) return all;
    return all.slice(0, 4);
  }, [profile?.reviews, showAllReviews]);

  // Detect if the current provider has already reviewed this client for the
  // booking linked to this thread. If so, hide the CTA.
  React.useEffect(() => {
    if (!isOpen) {
      setHasExistingReviewForBooking(false);
      return;
    }
    const providerId = user?.id ? Number(user.id) : 0;
    if (!providerId || !profile || !Array.isArray(profile.reviews) || !profile.reviews.length) {
      setHasExistingReviewForBooking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resResolve = await fetch(
          apiUrl(`/api/v1/booking-requests/${bookingRequestId}/booking-id`),
          { credentials: "include" },
        );
        if (!resResolve.ok) return;
        const resolved = await resResolve.json();
        const bookingId = Number(resolved?.booking_id || 0);
        if (!Number.isFinite(bookingId) || bookingId <= 0) return;
        const already = profile.reviews.some((r) => {
          const pid = Number(r.provider?.id || 0);
          const bid = Number(r.booking?.id || 0);
          return Number.isFinite(pid) && Number.isFinite(bid) && pid === providerId && bid === bookingId;
        });
        if (!cancelled) setHasExistingReviewForBooking(already);
      } catch {
        if (!cancelled) setHasExistingReviewForBooking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, bookingRequestId, profile, user?.id]);

  const handleOpenReview = () => {
    setIsReviewOpen(true);
    setReviewForm({ rating: 5, comment: "" });
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSubmittingReview(true);
    setError(null);
    try {
      const resResolve = await fetch(apiUrl(`/api/v1/booking-requests/${bookingRequestId}/booking-id`), {
        credentials: "include",
      });
      const resolved = await resResolve.json();
      const bookingId = resolved?.booking_id;
      if (!bookingId) {
        throw new Error("Could not resolve booking for this thread.");
      }
      const res = await fetch(apiUrl(`/api/v1/reviews/client/bookings/${bookingId}/reviews`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: reviewForm.rating,
          comment: reviewForm.comment || null,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody?.detail || "Failed to submit review.";
        throw new Error(detail);
      }
      const created = (await res.json()) as any;
      // Optimistically update local profile stats
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, reviews: [...prev.reviews] };
        const createdAt = created?.created_at || new Date().toISOString();
        next.reviews.unshift({
          id: created.id,
          rating: created.rating,
          comment: created.comment || "",
          created_at: createdAt,
          provider: providerName
            ? {
                id: Number(created?.provider_id || 0) || 0,
                business_name: providerName,
                city: undefined,
              }
            : undefined,
          booking: undefined,
        });
        const ratings = next.reviews.map((r) => Number(r.rating) || 0);
        const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
        next.stats = {
          ...next.stats,
          avg_rating: avg,
          reviews_count: ratings.length,
        };
        return next;
      });
      setHasExistingReviewForBooking(true);
      setIsReviewOpen(false);
    } catch (err: any) {
      setError(err?.message || "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = () => {
    try {
      onClose();
    } catch {
      // no-op
    }
  };

  const handlePanelClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-end bg-black/20 backdrop-blur-sm top-14 sm:top-16"
      onClick={handleBackdropClick}
    >
      <div
        className="relative h-full w-full max-w-md bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-200 ease-out translate-x-0"
        aria-modal="true"
        role="dialog"
        onClick={handlePanelClick}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-gray-600 shadow hover:bg-gray-100"
          aria-label="Close client profile"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
        <div className="h-full overflow-y-auto px-4 pt-10 pb-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            {clientAvatarUrl ? (
              <img
                src={clientAvatarUrl}
                alt={displayName}
                className="h-16 w-16 rounded-full object-cover shadow-sm"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-gray-900 text-white flex items-center justify-center text-xl font-semibold shadow-sm">
                {(displayName || "C").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{displayName || "Client"}</h2>
              </div>
              {profile?.user.member_since_year && (
                <p className="text-xs text-gray-500">
                  Member since {profile.user.member_since_year}
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-3 shadow-sm">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-sm font-semibold text-gray-900">
                <StarSolidIcon className="h-4 w-4 text-yellow-400" />
                <span>
                  {profile?.stats.avg_rating != null
                    ? profile.stats.avg_rating.toFixed(1)
                    : "—"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {profile?.stats.reviews_count || 0} review
                {profile && profile.stats.reviews_count !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">
                {profile?.stats.completed_events ?? "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-500">completed events</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">
                {profile?.stats.cancelled_events ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-500">cancellations</p>
            </div>
          </div>

          {/* Verifications */}
          <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheckIcon className="h-4 w-4 text-emerald-500" />
              <p className="text-xs font-semibold text-gray-900">Verifications</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge
                active={profile?.verifications.email_verified}
                label="Email verified"
              />
              <Badge
                active={profile?.verifications.phone_verified}
                label="Phone verified"
              />
              <Badge
                active={profile?.verifications.payment_verified}
                label="Payment verified"
              />
            </div>
          </div>

          {/* Reviews list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-900">Reviews from providers</p>
              {profile && profile.reviews.length > 4 && (
                <button
                  type="button"
                  className="text-[11px] text-gray-600 hover:text-gray-900"
                  onClick={() => setShowAllReviews((v) => !v)}
                >
                  {showAllReviews ? "Show less" : "See all"}
                </button>
              )}
            </div>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Spinner size="sm" />
              </div>
            )}
            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}
            {!loading && !error && (!profile || profile.reviews.length === 0) && (
              <p className="text-xs text-gray-500">
                No provider reviews yet. Completed bookings will show up here.
              </p>
            )}
            {!loading &&
              !error &&
              visibleReviews.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-gray-900">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <StarSolidIcon
                          key={i}
                          className={`h-3 w-3 ${
                            i < (Number(r.rating) || 0) ? "text-yellow-400" : "text-gray-200"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {r.comment && (
                    <p className="mt-1 text-[12px] leading-snug text-gray-700">{r.comment}</p>
                  )}
                  <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                    <span>
                      {r.provider?.business_name || "Service provider"}
                      {r.booking?.service_title ? ` · ${r.booking.service_title}` : ""}
                    </span>
                    {r.booking?.event_date && (
                      <span>
                        {new Date(r.booking.event_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>

          {/* Review CTA (only when allowed for this booking/status) */}
          {canReview !== false && !hasExistingReviewForBooking && (
            <div className="pt-1">
              <button
                type="button"
                className="inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-800"
                onClick={handleOpenReview}
              >
                <StarIcon className="h-4 w-4 mr-1.5" />
                Review this client
              </button>
            </div>
          )}
        </div>

        {/* Review modal overlay inside panel */}
        {isReviewOpen && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-gray-600" />
                  <p className="text-sm font-semibold text-gray-900">
                    Review {displayName || "client"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReviewOpen(false)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                  aria-label="Close review form"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </div>
              <form onSubmit={handleSubmitReview} className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1">Rating</p>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const v = i + 1;
                      const active = v <= reviewForm.rating;
                      return (
                        <button
                          key={v}
                          type="button"
                          className="p-0.5"
                          onClick={() => setReviewForm((f) => ({ ...f, rating: v }))}
                        >
                          <StarSolidIcon
                            className={`h-4 w-4 ${
                              active ? "text-yellow-400" : "text-gray-200"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Comment (optional)
                  </label>
                  <textarea
                    className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-0"
                    rows={3}
                    value={reviewForm.comment}
                    onChange={(e) =>
                      setReviewForm((f) => ({ ...f, comment: e.target.value }))
                    }
                  />
                </div>
                {error && (
                  <p className="text-xs text-red-600">{error}</p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    onClick={() => setIsReviewOpen(false)}
                    disabled={submittingReview}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                    disabled={submittingReview}
                  >
                    {submittingReview ? "Submitting…" : "Submit review"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ active, label }: { active?: boolean; label: string }) {
  if (!active) {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] text-emerald-700">
      {label}
    </span>
  );
}

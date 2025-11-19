"use client";

import * as React from "react";
import { XMarkIcon, ShieldCheckIcon, StarIcon, UserIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Spinner, Button, Avatar } from "@/components/ui";
import { apiUrl } from "@/lib/api";
import { getFullImageUrl } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type ProviderProfile = {
  id: number;
  business_name?: string | null;
  description?: string | null;
  location?: string | null;
  profile_picture_url?: string | null;
  rating?: number | null;
  rating_count: number;
  service_categories: string[];
  specialties?: string[] | null;
  cancellation_policy?: string | null;
  user?: {
    first_name?: string | null;
    last_name?: string | null;
  } | null;
};

type ProviderReview = {
  id: number;
  booking_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
  client_display_name?: string | null;
  client_id?: number | null;
  client_first_name?: string | null;
  client_last_name?: string | null;
  client?: {
    id: number;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    profile_picture_url?: string | null;
  } | null;
};

type Props = {
  providerId: number;
  providerName?: string | null;
  providerAvatarUrl?: string | null;
  bookingId?: number | null;
  canReview?: boolean;
  isOpen: boolean;
  autoOpenReview?: boolean;
  onClose: () => void;
};

type ReviewForm = {
  rating: number;
  comment: string;
};

export default function ProviderProfilePanel({
  providerId,
  providerName,
  providerAvatarUrl,
  bookingId,
  canReview,
  isOpen,
  autoOpenReview,
  onClose,
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<ProviderProfile | null>(null);
  const [reviews, setReviews] = React.useState<ProviderReview[]>([]);
  const [isReviewOpen, setIsReviewOpen] = React.useState(false);
  const [reviewForm, setReviewForm] = React.useState<ReviewForm>({ rating: 5, comment: "" });
  const [submittingReview, setSubmittingReview] = React.useState(false);
  const [hasExistingReviewForBooking, setHasExistingReviewForBooking] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen || !providerId) return;
    let cancelled = false;
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl(`/api/v1/service-provider-profiles/${providerId}`), {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Failed to load provider profile (${res.status})`);
        const data = (await res.json()) as ProviderProfile;
        if (!cancelled) setProfile(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load provider profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [isOpen, providerId]);

  React.useEffect(() => {
    if (!isOpen || !autoOpenReview) return;
    setIsReviewOpen(true);
    setReviewForm({ rating: 5, comment: "" });
  }, [isOpen, autoOpenReview]);

  // Load existing reviews for this provider
  React.useEffect(() => {
    if (!isOpen || !providerId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/v1/reviews/service-provider-profiles/${providerId}/reviews`), {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as ProviderReview[];
        if (!cancelled && Array.isArray(data)) {
          setReviews(data);
        }
      } catch {
        if (!cancelled) setReviews([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, providerId]);

  const displayName =
    providerName ||
    profile?.business_name ||
    (profile?.user
      ? `${profile.user.first_name || ""} ${profile.user.last_name || ""}`.trim()
      : "Service provider");

  // Check if client already reviewed this provider for this booking
  React.useEffect(() => {
    if (!isOpen || !bookingId || !user || user.user_type !== "client") {
      setHasExistingReviewForBooking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/v1/reviews/${bookingId}`), {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.status === 404) {
          setHasExistingReviewForBooking(false);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        // Any review on this booking counts as completed
        setHasExistingReviewForBooking(Boolean(data && data.booking_id));
      } catch {
        if (!cancelled) setHasExistingReviewForBooking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, bookingId, user]);

  const handleOpenReview = () => {
    setIsReviewOpen(true);
    setReviewForm({ rating: 5, comment: "" });
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingId) return;
    if (!user || user.user_type !== "client") return;
    setSubmittingReview(true);
    setError(null);
      try {
        const res = await fetch(apiUrl(`/api/v1/reviews/bookings/${bookingId}/reviews`), {
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
      setHasExistingReviewForBooking(true);
      try {
        setReviews((prev) => {
          const nameFromUser = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
          const display = nameFromUser || user?.email || null;
          const next: ProviderReview[] = [
            {
              id: Date.now(),
              booking_id: bookingId,
              rating: reviewForm.rating,
              comment: reviewForm.comment || null,
              created_at: new Date().toISOString(),
              client_display_name: display,
              client_id: user?.id ?? null,
              client_first_name: user?.first_name || null,
              client_last_name: user?.last_name || null,
              client: {
                id: user?.id ?? 0,
                first_name: user?.first_name || null,
                last_name: user?.last_name || null,
                email: user?.email || null,
                profile_picture_url: user?.profile_picture_url ?? null,
              },
            },
            ...prev,
          ];
          return next;
        });
        if (providerId) {
          try {
            const profileRes = await fetch(apiUrl(`/api/v1/service-provider-profiles/${providerId}`), {
              credentials: "include",
            });
            if (profileRes.ok) {
              const updated = (await profileRes.json()) as ProviderProfile;
              setProfile(updated);
            }
          } catch {
          }
        }
      } catch {}
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
          aria-label="Close provider profile"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
        <div className="h-full overflow-y-auto px-4 pt-10 pb-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            {(() => {
              const src = getFullImageUrl(profile?.profile_picture_url || providerAvatarUrl || null);
              if (src) {
                return (
                  <img
                    src={src}
                    alt={displayName || "Service provider"}
                    className="h-16 w-16 rounded-full object-cover shadow-sm"
                  />
                );
              }
              return (
                <div className="h-16 w-16 rounded-full bg-gray-900 text-white flex items-center justify-center text-xl font-semibold shadow-sm">
                  {(displayName || "P").charAt(0).toUpperCase()}
                </div>
              );
            })()}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">
                  {displayName || "Service provider"}
                </h2>
              </div>
              {profile?.location && (
                <p className="text-xs text-gray-500">
                  {profile.location}
                </p>
              )}
            </div>
          </div>

          {/* Stats + verifications */}
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-3 shadow-sm">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-sm font-semibold text-gray-900">
                <StarSolidIcon className="h-4 w-4 text-yellow-400" />
                <span>
                  {profile?.rating != null
                    ? profile.rating.toFixed(1)
                    : "—"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {profile?.rating_count || 0} review
                {profile && profile.rating_count !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">
                {profile?.completed_events ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-500">completed events</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">
                {profile?.profile_complete ? "Yes" : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-500">profile complete</p>
            </div>
          </div>

          {/* Services offered */}
          {profile?.service_categories?.length ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheckIcon className="h-4 w-4 text-indigo-500" />
                <p className="text-xs font-semibold text-gray-900">Services offered</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profile.service_categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-800"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Description / bio */}
          {profile?.description && (
            <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-gray-900 mb-1">About</p>
              <p className="text-[12px] leading-snug text-gray-700 whitespace-pre-line">
                {profile.description}
              </p>
            </div>
          )}

          {/* Reviews list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-900">Reviews from clients</p>
            </div>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Spinner size="sm" />
              </div>
            )}
            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}
            {!loading && !error && (!reviews || reviews.length === 0) && (
              <p className="text-xs text-gray-500">
                No client reviews yet. Completed bookings will show up here.
              </p>
            )}
            {!loading &&
              !error &&
              reviews.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const nameFromClient = `${r.client?.first_name || r.client_first_name || ""} ${
                          r.client?.last_name || r.client_last_name || ""
                        }`.trim();
                        const clientName =
                          r.client_display_name ||
                          nameFromClient ||
                          r.client?.email ||
                          "Client";
                        const initials =
                          r.client?.first_name?.[0] ||
                          clientName.trim().charAt(0) ||
                          "•";
                        const avatarSrc = r.client?.profile_picture_url || null;
                        return (
                          <>
                            <Avatar
                              src={avatarSrc || undefined}
                              initials={initials}
                              size={28}
                            />
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1 text-xs text-gray-900">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <StarSolidIcon
                                    key={i}
                                    className={`h-3 w-3 ${
                                      i < (Number(r.rating) || 0)
                                        ? "text-yellow-400"
                                        : "text-gray-200"
                                    }`}
                                  />
                                ))}
                              </div>
                              <p className="text-[11px] text-gray-600">
                                by {clientName}
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {r.comment && (
                    <p className="mt-1 text-[12px] leading-snug text-gray-700">{r.comment}</p>
                  )}
                </div>
              ))}
          </div>

          {/* Review CTA (client reviewing provider) */}
          {user?.user_type === "client" && canReview !== false && !hasExistingReviewForBooking && bookingId && (
            <div className="pt-1">
              <Button
                type="button"
                className="w-full inline-flex items-center justify-center rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-800"
                onClick={handleOpenReview}
              >
                <StarIcon className="h-4 w-4 mr-1.5" />
                Leave a review
              </Button>
            </div>
          )}
        </div>

        {/* Review modal overlay inside panel (client -> provider) */}
        {isReviewOpen && bookingId && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-gray-600" />
                  <p className="text-sm font-semibold text-gray-900">
                    Review {displayName || "provider"}
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

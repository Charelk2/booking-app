"use client";

import { useMemo } from "react";
import Link from "next/link";

import SafeImage from "@/components/ui/SafeImage";
import Button from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import type { Review, Service } from "@/types";
import { useVenueBookingEngine } from "@/features/booking/venue/engine/engine";
import {
  getVenueAmenityLabel,
  normalizeVenueAmenities,
} from "@/features/venues/amenities";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    const s = String(v || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function resolveProviderInfo(service: Service) {
  const any = service as any;
  const profile =
    any.service_provider_profile ||
    any.service_provider ||
    any.artist_profile ||
    any.artist ||
    null;
  const providerId = Number(
    any.service_provider_id || any.artist_id || profile?.id || 0,
  );
  const providerSlug = profile?.slug || null;
  const providerName =
    profile?.business_name ||
    profile?.trading_name ||
    profile?.legal_name ||
    null;
  const cancellationPolicy =
    profile?.cancellation_policy ||
    (profile?.artist_profile?.cancellation_policy as any) ||
    null;
  const providerHref = providerSlug
    ? `/${providerSlug}`
    : providerId
      ? `/${providerId}`
      : null;

  return {
    profile,
    providerId,
    providerHref,
    providerName,
    cancellationPolicy,
  };
}

function VenueBookingCard({
  service,
  providerId,
}: {
  service: Service;
  providerId: number;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const engine = useVenueBookingEngine({
    serviceProviderId: providerId,
    serviceId: service.id,
  });

  const details = (service as any)?.details || {};
  const capacity = Number(details?.capacity || 0);
  const cleaningFee = Number(details?.cleaning_fee || 0);
  const securityDeposit = Number(details?.security_deposit || 0);
  const overtimeRate = Number(details?.overtime_rate || 0);

  const onSubmit = async () => {
    if (authLoading) return;
    if (!user) {
      router.push(
        `/auth?intent=login&next=${encodeURIComponent(`/services/${service.id}`)}`,
      );
      return;
    }
    await engine.actions.submit();
  };

  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold text-gray-900">
          {formatCurrency(Number(service.price || 0))}
        </div>
        <div className="text-sm text-gray-600">per day</div>
      </div>

      {capacity > 0 ? (
        <div className="mt-1 text-sm text-gray-600">Up to {capacity} guests</div>
      ) : null}

      <div className="mt-4 space-y-3">
        <TextInput
          label="Date"
          type="date"
          value={engine.state.form.date}
          onChange={(e) => engine.actions.setDate(e.target.value)}
        />
        <TextInput
          label="Estimated guests"
          type="number"
          value={engine.state.form.guests}
          onChange={(e) => engine.actions.setGuests(e.target.value)}
        />
        <TextArea
          label="Notes (optional)"
          rows={4}
          value={engine.state.form.notes}
          onChange={(e) => engine.actions.setNotes(e.target.value)}
          placeholder="Tell the venue about your event (timing, setup, special requirements)…"
        />

        {engine.state.booking.error ? (
          <p className="text-sm text-red-600" role="alert">
            {engine.state.booking.error}
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <Button
          className="w-full"
          onClick={() => void onSubmit()}
          isLoading={engine.state.booking.status === "submitting"}
        >
          Request to book
        </Button>
        <p className="mt-2 text-xs text-gray-600">
          You won’t be charged yet. The venue will send a quote for approval.
        </p>
      </div>

      {(Number.isFinite(cleaningFee) && cleaningFee > 0) ||
      (Number.isFinite(securityDeposit) && securityDeposit > 0) ||
      (Number.isFinite(overtimeRate) && overtimeRate > 0) ? (
        <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
          <div className="font-semibold text-gray-900">Common fees</div>
          <div className="mt-2 space-y-1">
            {Number.isFinite(cleaningFee) && cleaningFee > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span>Cleaning fee</span>
                <span className="font-medium">
                  {formatCurrency(cleaningFee)}
                </span>
              </div>
            ) : null}
            {Number.isFinite(securityDeposit) && securityDeposit > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span>Security deposit (refundable)</span>
                <span className="font-medium">
                  {formatCurrency(securityDeposit)}
                </span>
              </div>
            ) : null}
            {Number.isFinite(overtimeRate) && overtimeRate > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span>Overtime (per hour)</span>
                <span className="font-medium">
                  {formatCurrency(overtimeRate)}
                </span>
              </div>
            ) : null}
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Final pricing is confirmed in the quote.
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function VenuePhotoGrid({ images }: { images: string[] }) {
  const primary = images[0] || null;
  const rest = images.slice(1, 5);

  return (
    <section aria-label="Venue photos" className="overflow-hidden rounded-2xl">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4 md:grid-rows-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gray-100 md:col-span-2 md:row-span-2">
          {primary ? (
            <SafeImage
              src={primary}
              alt="Venue cover photo"
              fill
              sizes="(max-width: 768px) 100vw, 60vw"
              className="object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-sm text-gray-500">
              No photos yet
            </div>
          )}
        </div>
        {rest.map((src, i) => (
          <div
            key={`${src}:${i}`}
            className="relative hidden aspect-[4/3] overflow-hidden rounded-2xl bg-gray-100 md:block"
          >
            <SafeImage
              src={src}
              alt={`Venue photo ${i + 2}`}
              fill
              sizes="20vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function VenueListingPage({
  service,
  reviews,
}: {
  service: Service;
  reviews: Review[];
}) {
  const details = (service as any)?.details || {};
  const { providerId, providerHref, providerName, cancellationPolicy } =
    resolveProviderInfo(service);

  const images = useMemo(() => {
    const raw = [
      (service as any)?.media_url,
      ...(normalizeStringList(details?.gallery_urls) || []),
    ];
    return normalizeStringList(raw);
  }, [service, details]);

  const amenityValues = useMemo(
    () => normalizeVenueAmenities(details?.amenities),
    [details?.amenities],
  );

  const average =
    reviews.length > 0
      ? (
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        ).toFixed(1)
      : null;

  const venueType = isNonEmptyString(details?.venue_type)
    ? details.venue_type.trim()
    : null;
  const address = isNonEmptyString(details?.address) ? details.address.trim() : null;
  const houseRules = isNonEmptyString(details?.house_rules)
    ? details.house_rules.trim()
    : null;
  const policyOverride = isNonEmptyString(details?.cancellation_policy)
    ? details.cancellation_policy.trim()
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-gray-900">
              {service.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
              {average ? (
                <span className="font-medium text-gray-900">
                  {average} / 5
                </span>
              ) : null}
              {reviews.length ? (
                <span>({reviews.length} reviews)</span>
              ) : null}
              {venueType ? <span>· {venueType}</span> : null}
              {address ? <span className="truncate">· {address}</span> : null}
            </div>
          </div>

          {providerHref ? (
            <Link
              href={providerHref}
              className="shrink-0 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 no-underline hover:bg-gray-50 hover:no-underline"
            >
              {providerName ? `Hosted by ${providerName}` : "View host"}
            </Link>
          ) : null}
        </div>
      </header>

      <VenuePhotoGrid images={images} />

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
        <main className="space-y-10">
          <section aria-label="About this venue">
            <h2 className="text-xl font-bold text-gray-900">About</h2>
            <p className="mt-2 whitespace-pre-line text-gray-700">
              {service.description || "—"}
            </p>
          </section>

          {amenityValues.length ? (
            <section aria-label="Amenities">
              <h2 className="text-xl font-bold text-gray-900">Amenities</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {amenityValues.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800"
                  >
                    {getVenueAmenityLabel(a)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {houseRules ? (
            <section aria-label="House rules">
              <h2 className="text-xl font-bold text-gray-900">House rules</h2>
              <p className="mt-2 whitespace-pre-line text-gray-700">
                {houseRules}
              </p>
            </section>
          ) : null}

          <section aria-label="Cancellation policy">
            <h2 className="text-xl font-bold text-gray-900">
              Cancellation policy
            </h2>
            <p className="mt-2 whitespace-pre-line text-gray-700">
              {policyOverride ||
                cancellationPolicy ||
                "Policies vary by venue. Review the quote for final cancellation and refund terms."}
            </p>
          </section>

          <section aria-label="Reviews">
            <h2 className="text-xl font-bold text-gray-900">
              Reviews ({reviews.length})
            </h2>
            {reviews.length === 0 ? (
              <p className="mt-2 text-gray-600">No reviews yet.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {reviews.slice(0, 8).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-2xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">
                        {r.client?.first_name || "Client"}
                      </div>
                      <div className="text-sm font-medium text-gray-900">
                        {r.rating} / 5
                      </div>
                    </div>
                    {r.comment ? (
                      <p className="mt-2 whitespace-pre-line text-sm text-gray-700">
                        {r.comment}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <VenueBookingCard service={service} providerId={providerId} />
        </div>
      </div>
    </div>
  );
}


"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import SafeImage from "@/components/ui/SafeImage";
import Button from "@/components/ui/Button";
import { ImagePreviewModal, TextArea, TextInput, Toast } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { formatCurrency, getTownProvinceFromAddress } from "@/lib/utils";
import type { Review, Service } from "@/types";
import { useVenueBookingEngine } from "@/features/booking/venue/engine/engine";
import {
  VENUE_AMENITY_CATEGORIES,
  VENUE_NOT_INCLUDED_HIGHLIGHTS,
  getVenueAmenityLabel,
  normalizeVenueAmenities,
} from "@/features/venues/amenities";
import { getVenueRuleLabel, normalizeVenueRules } from "@/features/venues/rules";
import { CheckIcon } from "@heroicons/react/24/solid";
import {
  ArrowUpOnSquareIcon,
  HeartIcon as HeartOutlineIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";

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
  const [step, setStep] = useState<0 | 1>(0);
  const [customEventType, setCustomEventType] = useState("");

  const details = (service as any)?.details || {};
  const capacity = Number(details?.capacity || 0);
  const cleaningFee = Number(details?.cleaning_fee || 0);
  const overtimeRate = Number(details?.overtime_rate || 0);

  const EVENT_TYPES = [
    "Wedding",
    "Corporate",
    "Birthday",
    "Conference",
    "Photoshoot",
    "Other",
  ] as const;

  const eventTypeIsOther = (engine.state.form.eventType || "").trim() === "Other";
  const effectiveEventType = eventTypeIsOther
    ? (customEventType || "").trim()
    : (engine.state.form.eventType || "").trim();

  const notesPlaceholder = (() => {
    const t = effectiveEventType.toLowerCase();
    if (t.includes("wedding")) {
      return "Ceremony + reception timing, decor/catering, music, setup notes…";
    }
    if (t.includes("corporate")) {
      return "Agenda, seating style, A/V needs, catering, setup notes…";
    }
    if (t.includes("conference")) {
      return "Agenda, seating/breakout rooms, A/V needs, registration flow…";
    }
    if (t.includes("photoshoot")) {
      return "Crew size, gear/power needs, access times, setup notes…";
    }
    if (t.includes("birthday")) {
      return "Music, catering, kids/activities, setup notes…";
    }
    return "Tell the venue about your event (timing, setup, special requirements)…";
  })();

  const canReview = (() => {
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test((engine.state.form.date || "").trim());
    const guestsOk = Number(engine.state.form.guests || 0) > 0;
    const typeOk = Boolean((engine.state.form.eventType || "").trim()) && !eventTypeIsOther
      ? true
      : Boolean(customEventType.trim());
    return dateOk && guestsOk && typeOk;
  })();

  const onSubmit = async () => {
    if (authLoading) return;
    if (!user) {
      router.push(
        `/auth?intent=login&next=${encodeURIComponent(`/services/${service.id}`)}`,
      );
      return;
    }
    if (eventTypeIsOther && customEventType.trim()) {
      engine.actions.setEventType(customEventType.trim());
    }
    await engine.actions.submit();
  };

  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold text-gray-900">
          {formatCurrency(Number(service.price || 0))}
        </div>
        <div className="text-sm text-gray-600">per day</div>
      </div>

      {capacity > 0 ? (
        <div className="mt-1 text-sm text-gray-600">Up to {capacity} guests</div>
      ) : null}

      {step === 0 ? (
        <>
          <div className="mt-4 space-y-3">
            <TextInput
              label="Date"
              type="date"
              value={engine.state.form.date}
              onChange={(e) => engine.actions.setDate(e.target.value)}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput
                label="Start time (optional)"
                type="time"
                value={engine.state.form.startTime}
                onChange={(e) => engine.actions.setStartTime(e.target.value)}
              />
              <TextInput
                label="End time (optional)"
                type="time"
                value={engine.state.form.endTime}
                onChange={(e) => engine.actions.setEndTime(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">Event type</div>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map((t) => {
                  const selected = (engine.state.form.eventType || "").trim() === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        engine.actions.setEventType(t);
                        if (t !== "Other") setCustomEventType("");
                      }}
                      className={[
                        "rounded-full border px-3 py-1 text-sm font-semibold transition",
                        selected
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-900 hover:border-gray-300",
                      ].join(" ")}
                      aria-pressed={selected}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              {eventTypeIsOther ? (
                <TextInput
                  label="Event type (write it in)"
                  value={customEventType}
                  onChange={(e) => setCustomEventType(e.target.value)}
                  placeholder="e.g. Product launch"
                />
              ) : null}
            </div>

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
              placeholder={notesPlaceholder}
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
              onClick={() => setStep(1)}
              disabled={!canReview}
            >
              Review request
            </Button>
            <p className="mt-2 text-xs text-gray-600">
              You won’t be charged yet. The venue will send a quote for approval.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
              <div className="text-xs font-semibold text-gray-500">Request summary</div>
              <div className="mt-2 space-y-1 text-gray-900">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-600">Date</span>
                  <span className="font-medium">{engine.state.form.date || "—"}</span>
                </div>
                {(engine.state.form.startTime || engine.state.form.endTime) ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-600">Time</span>
                    <span className="font-medium">
                      {(engine.state.form.startTime || "").trim() || "—"}
                      {engine.state.form.endTime ? `–${engine.state.form.endTime}` : ""}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-600">Event type</span>
                  <span className="font-medium">{effectiveEventType || "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-600">Guests</span>
                  <span className="font-medium">{engine.state.form.guests || "—"}</span>
                </div>
                {engine.state.form.notes.trim() ? (
                  <div className="pt-2 text-gray-700 whitespace-pre-line">
                    {engine.state.form.notes.trim()}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
              <div className="text-xs font-semibold text-gray-500">Price</div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-700">Day rate</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(Number(service.price || 0))}</span>
                </div>
                {Number.isFinite(cleaningFee) && cleaningFee > 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-700">Cleaning fee</span>
                    <span className="font-medium text-gray-900">{formatCurrency(cleaningFee)}</span>
                  </div>
                ) : null}
                {Number.isFinite(overtimeRate) && overtimeRate > 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-700">Overtime (per hour)</span>
                    <span className="font-medium text-gray-900">{formatCurrency(overtimeRate)}</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Final pricing is confirmed in the quote.
              </div>
            </div>

            {engine.state.booking.error ? (
              <p className="text-sm text-red-600" role="alert">
                {engine.state.booking.error}
              </p>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setStep(0)} disabled={engine.state.booking.status === "submitting"}>
              Back
            </Button>
            <Button
              onClick={() => void onSubmit()}
              isLoading={engine.state.booking.status === "submitting"}
            >
              Send request
            </Button>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            You won’t be charged yet. The venue will send a quote for approval.
          </p>
        </>
      )}

      {step === 0 &&
      ((Number.isFinite(cleaningFee) && cleaningFee > 0) ||
        (Number.isFinite(overtimeRate) && overtimeRate > 0)) ? (
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

function VenuePhotoGrid({
  images,
  onOpen,
}: {
  images: string[];
  onOpen?: (index: number) => void;
}) {
  const primary = images[0] || null;
  const rest = images.slice(1);
  const desktop = rest.slice(0, 4);
  const mobile = rest.slice(0, 7);
  const openable = typeof onOpen === "function";

  return (
    <section aria-label="Venue photos" className="overflow-hidden rounded-2xl">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4 md:grid-rows-2">
        <button
          type="button"
          onClick={openable ? () => onOpen(0) : undefined}
          disabled={!openable}
          aria-label="Open photo"
          className={[
            "relative aspect-[4/3] overflow-hidden bg-gray-100 md:col-span-2 md:row-span-2 border-0 p-0 text-left",
            openable ? "cursor-pointer" : "",
          ].join(" ")}
        >
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
        </button>
        {desktop.map((src, i) => (
          <button
            key={`${src}:${i}`}
            type="button"
            onClick={openable ? () => onOpen(i + 1) : undefined}
            disabled={!openable}
            aria-label="Open photo"
            className={[
              "relative hidden aspect-[4/3] overflow-hidden bg-gray-100 md:block border-0 p-0 text-left",
              openable ? "cursor-pointer" : "",
            ].join(" ")}
          >
            <SafeImage
              src={src}
              alt={`Venue photo ${i + 2}`}
              fill
              sizes="20vw"
              className="object-cover"
            />
          </button>
        ))}
      </div>

      {mobile.length ? (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 md:hidden">
          {mobile.map((src, i) => (
            <button
              key={`${src}:m:${i}`}
              type="button"
              onClick={openable ? () => onOpen(i + 1) : undefined}
              disabled={!openable}
              aria-label="Open photo"
              className={[
                "relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-gray-100 border-0 p-0 text-left",
                openable ? "cursor-pointer" : "",
              ].join(" ")}
            >
              <SafeImage
                src={src}
                alt={`Venue photo ${i + 2}`}
                fill
                sizes="112px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function getServiceSavedStorageKey(serviceId: number) {
  return `saved:service:${serviceId}`;
}

export default function VenueListingPage({
  service,
  reviews,
}: {
  service: Service;
  reviews: Review[];
}) {
  const details = (service as any)?.details || {};
  const { profile, providerId, providerHref, providerName, cancellationPolicy } =
    resolveProviderInfo(service);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);

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
  const amenityGroups = useMemo(() => {
    if (!amenityValues.length) return [];
    const selected = new Set(amenityValues);
    const groups: Array<{
      id: string;
      label: string;
      items: Array<{ value: string; label: string }>;
    }> = [];
    const included = new Set<string>();

    for (const cat of VENUE_AMENITY_CATEGORIES) {
      const items = cat.items.filter((item) => selected.has(item.value));
      if (!items.length) continue;
      items.forEach((item) => included.add(item.value));
      groups.push({
        id: cat.id,
        label: cat.label,
        items: items.map((item) => ({ value: item.value, label: item.label })),
      });
    }

    const unknown = amenityValues.filter((v) => !included.has(v));
    if (unknown.length) {
      groups.push({
        id: "other",
        label: "Other",
        items: unknown.map((v) => ({ value: v, label: getVenueAmenityLabel(v) })),
      });
    }

    return groups;
  }, [amenityValues]);
  const notIncludedHighlights = useMemo(() => {
    if (!amenityValues.length) return [];
    const selected = new Set(amenityValues);
    return VENUE_NOT_INCLUDED_HIGHLIGHTS.filter((a) => !selected.has(a.value));
  }, [amenityValues]);
  const ruleValues = useMemo(
    () => normalizeVenueRules(details?.house_rules_selected),
    [details?.house_rules_selected],
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
  const providerLocation =
    isNonEmptyString((profile as any)?.location) ? (profile as any).location.trim() : null;
  const capacity = Number(details?.capacity || 0);
  const extraHouseRules = isNonEmptyString(details?.house_rules)
    ? details.house_rules.trim()
    : null;
  const policyOverride = isNonEmptyString(details?.cancellation_policy)
    ? details.cancellation_policy.trim()
    : null;
  const mapQuery = (address || providerLocation || "").trim() || null;
  const mapEmbedUrl = mapQuery
    ? `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`
    : null;
  const mapLinkUrl = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : null;
  const sectionScrollMarginTop = "calc(var(--app-header-height, 64px) + 72px)";

  const aboutTitle = providerName || service.title || "Venue";
  const aboutMetaLocation = (() => {
    const raw = (address || providerLocation || "").trim();
    if (!raw) return null;
    const compact = getTownProvinceFromAddress(raw);
    return compact || raw;
  })();
  const aboutTextRaw = String(service.description || "").trim();
  const aboutShouldClamp = aboutTextRaw.length > 320;

  const onMessageClick = () => {
    try {
      const el = document.getElementById("venue-booking-card");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const key = getServiceSavedStorageKey(service.id);
    try {
      setSaved(window.localStorage.getItem(key) === "1");
    } catch {}
  }, [service.id]);

  const toggleSaved = () => {
    const key = getServiceSavedStorageKey(service.id);
    const next = !saved;
    setSaved(next);
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {}
    Toast.success(next ? "Saved" : "Removed");
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ title: service.title, url });
        return;
      }
    } catch {
      // ignore share cancellation
    }
    try {
      await navigator.clipboard.writeText(url);
      Toast.success("Link copied");
    } catch {
      Toast.error("Could not copy link");
    }
  };

  const openPhotos = (idx = 0) => {
    if (!images.length) return;
    setPhotoIndex(Math.max(0, Math.min(idx, images.length - 1)));
    setPhotosOpen(true);
  };

  return (
    <div className="w-full">
      <nav
        aria-label="Venue sections"
        className="sticky z-30 border-b border-gray-200 bg-white/95 supports-[backdrop-filter]:backdrop-blur-sm"
        style={{ top: "var(--app-header-height, 64px)" }}
      >
        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="flex gap-6 overflow-x-auto py-3 text-sm font-semibold text-gray-900">
            <a
              href="#photos"
              className="whitespace-nowrap text-gray-900 no-underline hover:text-gray-900 hover:no-underline"
            >
              Photos
            </a>
            <a
              href="#amenities"
              className="whitespace-nowrap text-gray-900 no-underline hover:text-gray-900 hover:no-underline"
            >
              Amenities
            </a>
            <a
              href="#reviews"
              className="whitespace-nowrap text-gray-900 no-underline hover:text-gray-900 hover:no-underline"
            >
              Reviews
            </a>
            <a
              href="#location"
              className="whitespace-nowrap text-gray-900 no-underline hover:text-gray-900 hover:no-underline"
            >
              Location
            </a>
          </div>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <header className="mb-4 space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void share()}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              <ArrowUpOnSquareIcon className="h-4 w-4" />
              Share
            </button>
            <button
              type="button"
              onClick={toggleSaved}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              aria-pressed={saved}
            >
              {saved ? (
                <HeartSolidIcon className="h-4 w-4 text-red-500" />
              ) : (
                <HeartOutlineIcon className="h-4 w-4" />
              )}
              {saved ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      </header>

      <section
        aria-label="Photos"
        id="photos"
        style={{ scrollMarginTop: sectionScrollMarginTop }}
      >
        <div className="relative">
          <VenuePhotoGrid images={images} onOpen={openPhotos} />
          {images.length > 1 ? (
            <button
              type="button"
              onClick={() => openPhotos(0)}
              className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-white"
            >
              Show all photos
            </button>
          ) : null}
        </div>
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-gray-900">
            {venueType || "Venue"}
            {address || providerLocation ? (
              <span className="font-normal text-gray-700">
                {" "}
                in {address || providerLocation}
              </span>
            ) : null}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
            {Number.isFinite(capacity) && capacity > 0 ? (
              <span>{capacity} guests</span>
            ) : null}
            {Number.isFinite(capacity) && capacity > 0 ? <span>·</span> : null}
            <span>Per day</span>
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

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
        <main className="space-y-10">
          <section aria-label="About this venue">
            <h2 className="text-xl font-bold text-gray-900">
              About {aboutTitle}
            </h2>

            <div className="mt-2 space-y-0.5 text-sm">
              {providerName ? (
                <div className="font-semibold text-gray-900">{providerName}</div>
              ) : null}
              {service.title && service.title !== providerName ? (
                <div className="text-gray-700">{service.title}</div>
              ) : null}
              {aboutMetaLocation ? (
                <div className="text-gray-600">{aboutMetaLocation}</div>
              ) : null}
            </div>

            <p
              className={[
                "mt-3 text-gray-700",
                aboutExpanded ? "whitespace-pre-line" : "whitespace-normal",
                aboutShouldClamp && !aboutExpanded ? "line-clamp-4" : "",
              ].join(" ")}
            >
              {aboutTextRaw || "—"}
            </p>

            {aboutShouldClamp ? (
              <button
                type="button"
                onClick={() => setAboutExpanded((v) => !v)}
                className="mt-2 text-sm font-semibold text-brand-dark hover:text-brand-dark"
              >
                {aboutExpanded ? "Show less" : "Read more"}
              </button>
            ) : null}

            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={onMessageClick}
                className="w-full sm:w-auto"
              >
                Message {providerName || service.title || "venue"}
              </Button>
              <p className="mt-3 text-xs text-gray-600">
                For your safety, only send payments and messages to artists
                through Booka.
              </p>
            </div>
          </section>

          <section
            aria-label="What this place offers"
            id="amenities"
            style={{ scrollMarginTop: sectionScrollMarginTop }}
          >
            <h2 className="text-xl font-bold text-gray-900">
              What this place offers
            </h2>
            {amenityGroups.length ? (
              <div className="mt-4 space-y-6">
                {amenityGroups.map((group) => (
                  <div key={group.id}>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {group.label}
                    </h3>
                    <ul className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-2">
                      {group.items.map((item) => (
                        <li key={item.value} className="flex items-start gap-2">
                          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-900" />
                          <span>{item.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {notIncludedHighlights.length ? (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Not included
                    </h3>
                    <ul className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-500 sm:grid-cols-2">
                      {notIncludedHighlights.map((item) => (
                        <li
                          key={item.value}
                          className="flex items-start gap-2"
                        >
                          <XMarkIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <span>{item.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-600">
                Amenities haven’t been listed yet.
              </p>
            )}
          </section>

          <section aria-label="House rules">
            <h2 className="text-xl font-bold text-gray-900">House rules</h2>
            {ruleValues.length ? (
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                {ruleValues.map((rule) => (
                  <li key={rule} className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-900" />
                    <span>{getVenueRuleLabel(rule)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-600">
                No house rules have been added yet.
              </p>
            )}
            {extraHouseRules ? (
              <p className="mt-3 whitespace-pre-line text-gray-700">
                {extraHouseRules}
              </p>
            ) : null}
          </section>

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

          <section
            aria-label="Location"
            id="location"
            style={{ scrollMarginTop: sectionScrollMarginTop }}
          >
            <h2 className="text-xl font-bold text-gray-900">Location</h2>
            {mapQuery ? (
              <p className="mt-2 text-sm text-gray-700">{mapQuery}</p>
            ) : (
              <p className="mt-2 text-sm text-gray-600">
                Location hasn’t been added yet.
              </p>
            )}
            {mapEmbedUrl ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                <iframe
                  title={`Map: ${mapQuery || "Venue location"}`}
                  src={mapEmbedUrl}
                  className="h-[320px] w-full"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : null}
            {mapLinkUrl ? (
              <a
                href={mapLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm font-semibold text-brand-dark hover:underline"
              >
                Open in Google Maps
              </a>
            ) : null}
          </section>

          <section
            aria-label="Reviews"
            id="reviews"
            style={{ scrollMarginTop: sectionScrollMarginTop }}
          >
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

        <div
          id="venue-booking-card"
          className="lg:sticky lg:top-24 lg:self-start"
          style={{ scrollMarginTop: sectionScrollMarginTop }}
        >
          <VenueBookingCard service={service} providerId={providerId} />
        </div>
      </div>

      {images.length ? (
        <ImagePreviewModal
          open={photosOpen}
          src={images[photoIndex] || images[0] || ""}
          images={images}
          index={photoIndex}
          onIndexChange={setPhotoIndex}
          onClose={() => setPhotosOpen(false)}
        />
      ) : null}
      </div>
    </div>
  );
}

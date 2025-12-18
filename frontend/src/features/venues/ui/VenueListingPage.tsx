"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";

import SafeImage from "@/components/ui/SafeImage";
import Button from "@/components/ui/Button";
import { ImagePreviewModal, TextArea, TextInput, Toast } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import type { Review, Service } from "@/types";
import { startMessageThread } from "@/lib/api";
import { useVenueBookingEngine } from "@/features/booking/venue/engine/engine";
import { sanitizeCancellationPolicy } from "@/lib/shared/mappers/policy";
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
  BanknotesIcon,
  ChatBubbleOvalLeftIcon,
  EnvelopeIcon,
  LinkIcon,
  HeartIcon as HeartOutlineIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";

const AMENITY_HIGHLIGHTS_LIMIT = 8;
const HOUSE_RULES_PREVIEW_LIMIT = 5;
const VENUE_AMENITY_HIGHLIGHT_ORDER = [
  "parking",
  "toilets",
  "wifi",
  "tables_chairs",
  "kitchen",
  "sound_system",
  "wheelchair_access",
  "generator",
  "indoor_area",
  "outdoor_area",
  "changing_room",
  "air_conditioning",
  "security",
  "pool",
];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPostalCodePart(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  return /^\d{3,10}$/.test(compact);
}

function isCountryPart(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    v === "south africa" ||
    v === "south-africa" ||
    v === "southafrica" ||
    v === "za" ||
    v === "sa"
  );
}

function isProvincePart(value: string): boolean {
  const v = value.trim().toLowerCase();
  const provinces = new Set([
    "gauteng",
    "western cape",
    "eastern cape",
    "kwazulu-natal",
    "kzn",
    "free state",
    "limpopo",
    "mpumalanga",
    "northern cape",
    "north west",
    "northwest",
  ]);
  return provinces.has(v);
}

function getShortLocation(location: string | null): string | null {
  if (!isNonEmptyString(location)) return null;
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  while (parts.length && isCountryPart(parts[parts.length - 1] || "")) {
    parts.pop();
  }
  while (parts.length && isPostalCodePart(parts[parts.length - 1] || "")) {
    parts.pop();
  }
  if (!parts.length) return null;

  const last = parts[parts.length - 1] || null;
  if (last && isProvincePart(last) && parts.length > 1) {
    return parts[parts.length - 2] || last;
  }
  return last;
}

function getAddressPreview(location: string | null, maxParts = 3): string | null {
  if (!isNonEmptyString(location)) return null;
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  while (parts.length && isCountryPart(parts[parts.length - 1] || "")) {
    parts.pop();
  }
  while (parts.length && isPostalCodePart(parts[parts.length - 1] || "")) {
    parts.pop();
  }
  if (parts.length >= 2 && isProvincePart(parts[parts.length - 1] || "")) {
    parts.pop();
  }
  if (!parts.length) return null;

  return parts.slice(0, Math.max(1, maxParts)).join(", ");
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
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const details = (service as any)?.details || {};
  const { profile, providerId, providerHref, providerName, cancellationPolicy } =
    resolveProviderInfo(service);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [amenitiesExpanded, setAmenitiesExpanded] = useState(false);
  const [houseRulesExpanded, setHouseRulesExpanded] = useState(false);

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
  const amenityCount = useMemo(
    () => amenityGroups.reduce((sum, g) => sum + g.items.length, 0),
    [amenityGroups],
  );
  const amenityHighlights = useMemo(() => {
    if (!amenityValues.length) return [];

    const selected = new Set(amenityValues);
    const added = new Set<string>();
    const result: Array<{ value: string; label: string }> = [];

    for (const value of VENUE_AMENITY_HIGHLIGHT_ORDER) {
      if (!selected.has(value)) continue;
      if (added.has(value)) continue;
      added.add(value);
      result.push({ value, label: getVenueAmenityLabel(value) });
      if (result.length >= AMENITY_HIGHLIGHTS_LIMIT) return result;
    }

    for (const value of amenityValues) {
      if (added.has(value)) continue;
      added.add(value);
      result.push({ value, label: getVenueAmenityLabel(value) });
      if (result.length >= AMENITY_HIGHLIGHTS_LIMIT) break;
    }

    return result;
  }, [amenityValues]);
  const amenityHighlightValueSet = useMemo(
    () => new Set(amenityHighlights.map((a) => a.value)),
    [amenityHighlights],
  );
  const amenityGroupsAfterHighlights = useMemo(() => {
    if (!amenityGroups.length) return [];
    if (!amenityHighlights.length) return amenityGroups;
    const highlightSet = amenityHighlightValueSet;
    return amenityGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !highlightSet.has(item.value)),
      }))
      .filter((group) => group.items.length > 0);
  }, [amenityGroups, amenityHighlightValueSet, amenityHighlights.length]);
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
    ? String(details.house_rules).trim()
    : null;
  const extraHouseRulesLineCount = extraHouseRules
    ? extraHouseRules.split(/\r?\n/).filter((l) => l.trim()).length
    : 0;
  const houseRulePreview = houseRulesExpanded
    ? ruleValues
    : ruleValues.slice(0, HOUSE_RULES_PREVIEW_LIMIT);
  const houseRulesToggleVisible =
    ruleValues.length > HOUSE_RULES_PREVIEW_LIMIT ||
    Boolean(
      extraHouseRules &&
        (extraHouseRules.length > 140 || extraHouseRulesLineCount > 4),
    );
  const policyOverride = isNonEmptyString(details?.cancellation_policy)
    ? details.cancellation_policy.trim()
    : null;
  const effectiveCancellationPolicy = policyOverride || cancellationPolicy || null;
  const parsedCancellationPolicy = useMemo(
    () => sanitizeCancellationPolicy(effectiveCancellationPolicy),
    [effectiveCancellationPolicy],
  );
  const mapQuery = (address || providerLocation || "").trim() || null;
  const shortLocation = getShortLocation(mapQuery) || mapQuery;
  const headerAddress = getAddressPreview(mapQuery) || shortLocation;
  const mapAnchorHref = mapQuery ? "#map" : "#location";
  const mapEmbedUrl = mapQuery
    ? `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`
    : null;
  const mapLinkUrl = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : null;
  const sectionScrollMarginTop = "calc(var(--app-header-height, 64px) + 72px)";

  const headerMetaItems = useMemo(() => {
    const items: Array<{ key: string; node: ReactNode }> = [];
    if (average) {
      items.push({
        key: "rating",
        node: <span className="font-medium text-gray-900">{average} / 5</span>,
      });
    }
    if (reviews.length) {
      items.push({ key: "reviews", node: <span>({reviews.length} reviews)</span> });
    }
	    if (venueType) {
	      items.push({ key: "type", node: <span>{venueType}</span> });
	    }
	    if (headerAddress) {
	      items.push({
	        key: "address",
	        node: (
	          <a
	            href={mapAnchorHref}
	            className="text-gray-600 no-underline hover:text-gray-900 hover:no-underline break-words"
	            title={mapQuery || undefined}
	          >
	            {headerAddress}
	          </a>
	        ),
	      });
	    }
	    return items;
	  }, [average, headerAddress, mapAnchorHref, mapQuery, reviews.length, venueType]);

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

  const openPhotos = (idx = 0) => {
    if (!images.length) return;
    setPhotoIndex(Math.max(0, Math.min(idx, images.length - 1)));
    setPhotosOpen(true);
  };

  const onMessageClick = () => {
    if (!providerId || Number.isNaN(providerId)) {
      Toast.error("Host not available yet");
      return;
    }

    if (!authLoading && !user) {
      const next =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/inbox";
      router.push(`/auth?intent=login&next=${encodeURIComponent(next)}`);
      return;
    }

    void (async () => {
      try {
        const res = await startMessageThread({
          artist_id: providerId,
          service_id: service.id,
        });
        const requestId = Number(res.data.booking_request_id);
        if (requestId && !Number.isNaN(requestId)) {
          router.push(`/booking-requests/${requestId}`);
          return;
        }
        router.push("/inbox");
      } catch {
        if (providerHref) {
          router.push(providerHref);
          return;
        }
        Toast.error("Could not start message thread");
      }
    })();
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
	              href={mapAnchorHref}
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
	            <h1 className="text-2xl font-bold leading-tight text-gray-900">
	              {service.title}
	            </h1>
		            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
		              {headerMetaItems.map((item, idx) => (
		                <span
		                  key={item.key}
		                  className={[
		                    "min-w-0",
		                    idx
		                      ? "before:mx-2 before:text-gray-300 before:content-['·']"
		                      : "",
		                  ].join(" ")}
		                >
		                  {item.node}
		                </span>
		              ))}
		            </div>
		          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsShareOpen(true)}
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
	          <h2 className="text-xl font-semibold leading-tight text-gray-900">
	            {venueType || "Venue"}
	            {shortLocation ? (
	              <span className="font-normal text-gray-700">
	                {" "}
	                in{" "}
	                <a
	                  href={mapAnchorHref}
	                  className="text-gray-700 no-underline hover:text-gray-900 hover:no-underline"
	                  title={mapQuery || undefined}
	                >
	                  {shortLocation}
	                </a>
	              </span>
	            ) : null}
	          </h2>
	          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700">
	            {Number.isFinite(capacity) && capacity > 0 ? (
	              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
	                <UserGroupIcon className="h-4 w-4 text-gray-500" />
	                <span className="font-semibold text-gray-900">{capacity}</span>
	                <span>guests</span>
	              </span>
	            ) : null}
	            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
	              <BanknotesIcon className="h-4 w-4 text-gray-500" />
	              {Number(service.price || 0) > 0 ? (
	                <span className="font-semibold text-gray-900">
	                  {formatCurrency(Number(service.price || 0))}
	                </span>
	              ) : null}
	              <span>per day</span>
	            </span>
	          </div>
	        </div>

        <div className="flex shrink-0 items-center gap-2">
          {providerHref ? (
            <Link
              href={providerHref}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 no-underline hover:bg-gray-50 hover:no-underline"
            >
              {providerName ? `Hosted by ${providerName}` : "View host"}
            </Link>
          ) : null}
	          <button
	            type="button"
	            onClick={onMessageClick}
	            disabled={authLoading || !providerId}
	            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
	            title={providerName ? `Message ${providerName}` : "Message"}
	          >
	            Message
	          </button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
        <main className="space-y-10">
          <section aria-label="About this venue">
            <h2 className="text-xl font-bold text-gray-900">About</h2>
            <p className="mt-2 whitespace-pre-line text-gray-700">
              {service.description || "—"}
            </p>
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
		              <>
		                <ul className="mt-4 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-2">
		                  {amenityHighlights.map((item) => (
		                    <li key={item.value} className="flex items-start gap-2">
		                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-900" />
		                      <span>{item.label}</span>
		                    </li>
		                  ))}
		                </ul>

		                {!amenitiesExpanded &&
		                amenityCount > amenityHighlights.length ? (
		                  <div className="mt-4">
		                    <button
		                      type="button"
		                      onClick={() => setAmenitiesExpanded(true)}
		                      className="inline-flex items-center text-sm font-semibold text-brand-dark hover:underline"
		                    >
		                      Show all amenities ({amenityCount})
		                    </button>
		                  </div>
		                ) : null}

		                {amenitiesExpanded ? (
		                  <div className="mt-6 space-y-6">
		                    {amenityGroupsAfterHighlights.map((group) => (
		                      <div key={group.id}>
		                        <h3 className="text-sm font-semibold text-gray-900">
		                          {group.label}
		                        </h3>
		                        <ul className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-2">
		                          {group.items.map((item) => (
		                            <li
		                              key={item.value}
		                              className="flex items-start gap-2"
		                            >
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

		                    <div className="pt-2">
		                      <button
		                        type="button"
		                        onClick={() => setAmenitiesExpanded(false)}
		                        className="inline-flex items-center text-sm font-semibold text-brand-dark hover:underline"
		                      >
		                        Show less
		                      </button>
		                    </div>
		                  </div>
		                ) : null}
		              </>
		            ) : (
	              <p className="mt-2 text-sm text-gray-600">
	                Amenities haven’t been listed yet.
	              </p>
	            )}
	          </section>

	          <section aria-label="House rules">
	            <h2 className="text-xl font-bold text-gray-900">House rules</h2>
	            {ruleValues.length ? (
	              <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-2">
	                {houseRulePreview.map((rule) => (
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
	              <p
	                className={[
	                  "mt-3 whitespace-pre-line text-sm text-gray-700",
	                  houseRulesExpanded ? "" : "line-clamp-4",
	                ].join(" ")}
	              >
	                {extraHouseRules}
	              </p>
	            ) : null}
	            {houseRulesToggleVisible ? (
	              <div className="mt-4">
	                <button
	                  type="button"
	                  onClick={() => setHouseRulesExpanded((v) => !v)}
	                  className="inline-flex items-center text-sm font-semibold text-brand-dark hover:underline"
	                >
	                  {houseRulesExpanded ? "Show fewer" : "Show all house rules"}
	                </button>
	              </div>
	            ) : null}
	          </section>

	          <section aria-label="Cancellation policy">
	            <h2 className="text-xl font-bold text-gray-900">
	              Cancellation policy
	            </h2>
	            {effectiveCancellationPolicy ? (
	              <div className="mt-3 rounded-2xl bg-gray-50 p-4">
	                {parsedCancellationPolicy.intro ? (
	                  <p className="text-sm text-gray-700">
	                    {parsedCancellationPolicy.intro}
	                  </p>
	                ) : null}
	                {parsedCancellationPolicy.bullets.length ? (
	                  <ul
	                    className={[
	                      "text-sm text-gray-700 space-y-2",
	                      parsedCancellationPolicy.intro ? "mt-3" : "mt-0",
	                    ].join(" ")}
	                  >
	                    {parsedCancellationPolicy.bullets.map((bullet, idx) => (
	                      <li
	                        key={`${bullet}:${idx}`}
	                        className="flex items-start gap-2"
	                      >
	                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-900" />
	                        <span>{bullet}</span>
	                      </li>
	                    ))}
	                  </ul>
	                ) : null}
	              </div>
	            ) : (
	              <p className="mt-2 text-sm text-gray-600">
	                Policies vary by venue. Review the quote for final cancellation and
	                refund terms.
	              </p>
	            )}
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
	              <div
	                id="map"
	                style={{ scrollMarginTop: sectionScrollMarginTop }}
	                className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100"
	              >
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

        <div className="lg:sticky lg:top-24 lg:self-start">
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

        {/* Share modal */}
        {isShareOpen ? (
          <div
            className="fixed inset-0 z-50"
            role="dialog"
            aria-modal="true"
            aria-label="Share venue"
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setIsShareOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute left-1/2 top-1/2 w-[90vw] sm:w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-end">
                <button
                  aria-label="Close"
                  onClick={() => setIsShareOpen(false)}
                  className="rounded p-1.5 hover:bg-gray-50"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <h3 className="mb-3 text-3xl font-semibold text-gray-900">Share</h3>

              <div className="mb-4 flex items-center gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {images[0] ? (
                    <SafeImage
                      src={images[0]}
                      alt={service.title}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <div className="h-full w-full bg-gray-100" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {service.title}
                  </p>
                  {average ? (
                    <p className="flex items-center gap-1 text-xs text-gray-600">
                      <span className="font-medium text-gray-900">{average}</span>
                      <span className="text-gray-400">·</span>
                      <span>{reviews.length} reviews</span>
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const url =
                        typeof window !== "undefined" ? window.location.href : "";
                      await navigator.clipboard.writeText(url);
                      Toast.success("Link copied");
                    } catch {
                      Toast.error("Could not copy link");
                    }
                  }}
                  className="inline-flex w-full items-center justify-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                >
                  <LinkIcon className="h-5 w-5 text-gray-800" />
                  Copy Link
                </button>

                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    service.title,
                  )}&body=${encodeURIComponent(
                    typeof window !== "undefined" ? window.location.href : "",
                  )}`}
                  className="inline-flex w-full items-center justify-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 no-underline hover:bg-gray-50 hover:no-underline"
                >
                  <EnvelopeIcon className="h-5 w-5 text-gray-800" />
                  Email
                </a>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <a
                  href={`sms:&body=${encodeURIComponent(
                    typeof window !== "undefined" ? window.location.href : "",
                  )}`}
                  className="inline-flex items-center justify-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 no-underline hover:bg-gray-50 hover:no-underline"
                >
                  <ChatBubbleOvalLeftIcon className="h-5 w-5 text-gray-800" />
                  Messages
                </a>

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    typeof window !== "undefined" ? window.location.href : "",
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 no-underline hover:bg-gray-50 hover:no-underline"
                >
                  <svg
                    className="h-5 w-5 text-gray-800"
                    viewBox="0 0 32 32"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="m26.4996694 5.42690083c-2.7964463-2.80004133-6.5157025-4.34283558-10.4785124-4.3442562-8.16570245 0-14.81136692 6.64495868-14.81420824 14.81280987-.00142066 2.6110744.68118843 5.1596695 1.97750579 7.4057025l-2.10180992 7.6770248 7.85319008-2.0599173c2.16358679 1.1805785 4.59995039 1.8020661 7.07895869 1.8028099h.0063636c8.1642975 0 14.8107438-6.6457025 14.8135547-14.8135537.001404-3.9585124-1.5378522-7.67985954-4.3350423-10.47990913zm-10.4785124 22.79243797h-.0049587c-2.2090909-.0006611-4.3761983-.5945454-6.26702475-1.7161157l-.44965289-.2670248-4.66034711 1.2223967 1.24375207-4.5438843-.29265289-.4659504c-1.23238843-1.9604132-1.8837438-4.2263636-1.88232464-6.552562.0028453-6.78846276 5.5262172-12.31184293 12.31825021-12.31184293 3.2886777.00142149 6.38 1.28353719 8.7047934 3.61122314 2.3248761 2.32698347 3.6041323 5.42111569 3.6027285 8.71053719-.0028938 6.7891736-5.5261995 12.312562-12.3125632 12.312562zm6.7536364-9.2212396c-.3700827-.1853719-2.1898347-1.0804132-2.5294215-1.203967-.3395041-.1236363-.5859504-.1853719-.8324793.1853719-.2464463.3708265-.9560331 1.2047108-1.1719835 1.4511571-.2159504.24719-.4319008.2777686-.8019835.092314-.37-.1853719-1.5626446-.5760331-2.9768595-1.8368595-1.1002479-.9816529-1.8433058-2.1933884-2.0591735-2.5642149-.2159505-.3707438-.0227273-.5710744.1619008-.7550413.1661983-.1661983.3700826-.432562.5554545-.6485124.1854546-.2159504.246529-.3707438.3700827-.6172727.1236363-.2471901.0618182-.4630579-.0304959-.6485124-.0923967-.1853719-.8324793-2.0073554-1.1414876-2.74818183-.3004959-.72166116-.6058678-.62363637-.8324793-.63571075-.2159504-.01066116-.4623967-.01278512-.7095868-.01278512s-.6478512.09233884-.98735538.46312396c-.33950413.37074381-1.29561157 1.26644624-1.29561157 3.08768594s1.32619008 3.5821488 1.51156195 3.8293389c.1853719.24719 2.6103306 3.9855371 6.3231405 5.5894214.8829752.381405 1.5726447.6094215 2.1103306.7799174.8865289.2819835 1.6933884.2422314 2.3312397.1470248.7110744-.1065289 2.1899173-.8957025 2.4981818-1.7601653s.3082645-1.6060331.2159504-1.7601653c-.092314-.1541322-.3395041-.2471901-.7095868-.432562z" />
                  </svg>
                  WhatsApp
                </a>

                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                    typeof window !== "undefined" ? window.location.href : "",
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 no-underline hover:bg-gray-50 hover:no-underline"
                >
                  <svg
                    className="h-5 w-5 text-gray-800"
                    viewBox="0 0 32 32"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="m15.9700599 1c-8.26766469 0-14.9700599 6.70239521-14.9700599 14.9700599 0 7.0203593 4.83353293 12.9113772 11.3538922 14.5293413v-9.954491h-3.08682633v-4.5748503h3.08682633v-1.9712575c0-5.09520959 2.305988-7.45688623 7.3083832-7.45688623.948503 0 2.58503.18622754 3.2544911.37185629v4.14670654c-.3532934-.0371257-.9670659-.0556886-1.7293414-.0556886-2.454491 0-3.402994.9299401-3.402994 3.3473054v1.6179641h4.8898204l-.8401198 4.5748503h-4.0497006v10.2856287c7.4125749-.8952096 13.1562875-7.2065868 13.1562875-14.860479-.0005988-8.26766469-6.702994-14.9700599-14.9706587-14.9700599z" />
                  </svg>
                  Facebook
                </a>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsShareOpen(false)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
	      </div>
	    </div>
	  );
}

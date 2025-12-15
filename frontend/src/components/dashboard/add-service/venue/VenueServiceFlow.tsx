"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import Button from "@/components/ui/Button";
import { Stepper, TextArea, TextInput } from "@/components/ui";
import SafeImage from "@/components/ui/SafeImage";
import type { Service } from "@/types";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { getServiceProviderProfileMeCached, presignServiceMedia, uploadImage } from "@/lib/api";
import { useAddServiceEngine } from "@/features/serviceTypes/addService/engine";
import {
  getVenueAmenityLabel,
  normalizeVenueAmenities,
  VENUE_AMENITY_CATEGORIES,
} from "@/features/venues/amenities";
import { getVenueRuleLabel, normalizeVenueRules, VENUE_RULE_OPTIONS } from "@/features/venues/rules";

type StoredDraft = {
  version: 1;
  step: number;
  common: {
    title: string;
    description: string;
    price: number;
  };
  typeFields: Record<string, any>;
};

type VenueServiceFlowProps = {
  isOpen: boolean;
  onClose: () => void;
  onServiceSaved: (svc: Service) => void;
  service?: Service;
};

const DEFAULT_VENUE_CANCELLATION_POLICY = `# Moderate\n\n- Free cancellation within 24 hours of booking.\n- 50% refund up to 7 days before the event.`;

function useImageThumbnails(files: File[]) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setThumbnails(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);
  return thumbnails;
}

function draftKey(serviceId?: number) {
  return `add-service:venue:v1:${serviceId ? String(serviceId) : "new"}`;
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

export default function VenueServiceFlow({
  isOpen,
  onClose,
  onServiceSaved,
  service,
}: VenueServiceFlowProps) {
  const [step, setStep] = useState(0);
  const [maxStepCompleted, setMaxStepCompleted] = useState(0);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [amenitySearch, setAmenitySearch] = useState("");
  const [profileDefaults, setProfileDefaults] = useState<{
    title: string | null;
    description: string | null;
    location: string | null;
    cancellationPolicy: string | null;
  } | null>(null);
  const thumbnails = useImageThumbnails(mediaFiles);
  const autosaveTimerRef = useRef<number | null>(null);
  const restoredDraftRef = useRef(false);
  const prefilledFromProfileRef = useRef(false);
  const submitLockRef = useRef(false);

  const { state, actions } = useAddServiceEngine({
    serviceCategorySlug: "venue",
    serviceType: "venue_day_hire",
    service,
    onSaved: (svc) => {
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(draftKey(service?.id));
        }
      } catch {}
      onServiceSaved(svc);
      handleCancel();
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setMaxStepCompleted(0);
    setMediaFiles([]);
    setMediaError(null);
    setSubmitError(null);
    setUploading(false);
    setAmenitySearch("");
    setProfileDefaults(null);
    restoredDraftRef.current = false;
    prefilledFromProfileRef.current = false;
    submitLockRef.current = false;
    actions.reset();

    // Ensure the hero image is represented in the gallery for consistent
    // ordering and review.
    const baseGallery = normalizeStringList((service as any)?.details?.gallery_urls);
    const hero = String(service?.media_url || "").trim();
    const merged = normalizeStringList([hero, ...baseGallery]);
    actions.setTypeField("gallery_urls", merged);

    // Restore autosaved draft only when creating a new service (not editing).
    if (service?.id) return;
    try {
      const raw = window.localStorage.getItem(draftKey(undefined));
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredDraft;
      if (!parsed || parsed.version !== 1) return;
      restoredDraftRef.current = true;

      if (typeof parsed.step === "number" && parsed.step > 0) {
        setStep(Math.max(0, Math.min(parsed.step, 7)));
        setMaxStepCompleted(Math.max(0, Math.min(parsed.step, 7)));
      }

      if (parsed.common) {
        actions.setCommonField("title", String(parsed.common.title || ""));
        actions.setCommonField(
          "description",
          String(parsed.common.description || ""),
        );
        actions.setCommonField(
          "price",
          Number(parsed.common.price || 0),
        );
      }

      if (parsed.typeFields && typeof parsed.typeFields === "object") {
        for (const [k, v] of Object.entries(parsed.typeFields)) {
          actions.setTypeField(k, v);
        }
      }
    } catch {}
  }, [isOpen, service, actions]);

  useEffect(() => {
    if (!isOpen) return;
    if (service?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const prof = (await getServiceProviderProfileMeCached(60_000)) as any;
        const title =
          typeof prof?.business_name === "string" ? prof.business_name.trim() : null;
        const description =
          typeof prof?.description === "string" ? prof.description.trim() : null;
        const location =
          typeof prof?.location === "string" ? prof.location.trim() : null;
        const cancellationPolicy =
          typeof prof?.cancellation_policy === "string"
            ? prof.cancellation_policy.trim()
            : null;
        if (cancelled) return;
        setProfileDefaults({
          title: title || null,
          description: description || null,
          location: location || null,
          cancellationPolicy: cancellationPolicy || null,
        });
      } catch {
        if (!cancelled) setProfileDefaults(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, service?.id]);

  useEffect(() => {
    if (!isOpen) return;
    if (service?.id) return;
    if (!profileDefaults) return;
    if (prefilledFromProfileRef.current) return;

    // Only fill missing fields (draft/user input always wins).
    const titleEmpty = !(state.common.title || "").trim();
    const descEmpty = !(state.common.description || "").trim();
    const addressEmpty = !(state.typeFields.address || "").trim();
    const policyEmpty = !(state.typeFields.cancellation_policy || "").trim();

    if (titleEmpty && profileDefaults.title) {
      actions.setCommonField("title", profileDefaults.title);
    }
    if (descEmpty && profileDefaults.description) {
      actions.setCommonField("description", profileDefaults.description);
    }
    if (addressEmpty && profileDefaults.location) {
      actions.setTypeField("address", profileDefaults.location);
    }
    if (policyEmpty) {
      actions.setTypeField(
        "cancellation_policy",
        profileDefaults.cancellationPolicy || DEFAULT_VENUE_CANCELLATION_POLICY,
      );
    }
    prefilledFromProfileRef.current = true;
  }, [
    isOpen,
    service?.id,
    profileDefaults,
    state.common.title,
    state.common.description,
    state.typeFields.address,
    state.typeFields.cancellation_policy,
    actions,
  ]);

  const handleCancel = () => {
    setMediaFiles([]);
    setMediaError(null);
    setSubmitError(null);
    setUploading(false);
    setAmenitySearch("");
    submitLockRef.current = false;
    setStep(0);
    setMaxStepCompleted(0);
    actions.reset();
    onClose();
  };

  const onFileChange = (files: FileList | null) => {
    if (!files) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length !== files.length) {
      setMediaError("Only image files are allowed.");
    } else {
      setMediaError(null);
    }
    setMediaFiles((prev) => {
      const next = [...prev, ...images];
      if (next.length > 7) {
        setMediaError("Max 7 images. Please remove some and try again.");
        return next.slice(0, 7);
      }
      return next;
    });
  };

  const removeFile = (i: number) => {
    setMediaFiles((prev) => {
      const updated = prev.filter((_, idx) => idx !== i);
      return updated;
    });
  };

  const removeExistingUrl = (idx: number) => {
    const urls = normalizeStringList(state.typeFields.gallery_urls);
    const next = urls.filter((_, i) => i !== idx);
    actions.setTypeField("gallery_urls", next);
  };

  const galleryUrls = useMemo(
    () => normalizeStringList(state.typeFields.gallery_urls),
    [state.typeFields.gallery_urls],
  );

  const canAdvanceBasics = useMemo(() => {
    const titleOk = (state.common.title || "").trim().length >= 5;
    const descOk = (state.common.description || "").trim().length >= 20;
    return titleOk && descOk;
  }, [state.common.title, state.common.description, state.common.price, state.typeFields.capacity]);

  const canAdvancePricing = useMemo(() => {
    const priceOk = Number(state.common.price || 0) > 0;
    return priceOk;
  }, [state.common.price]);

  const canAdvanceCapacity = useMemo(() => {
    const capacityOk = Number(state.typeFields.capacity || 0) > 0;
    return capacityOk;
  }, [state.typeFields.capacity]);

  const canAdvancePhotos = useMemo(() => {
    const count = galleryUrls.length + mediaFiles.length;
    return !mediaError && count > 0;
  }, [galleryUrls.length, mediaFiles.length, mediaError]);

  const canAdvanceCurrentStep = useMemo(() => {
    if (step === 0) return canAdvanceBasics;
    if (step === 2) return canAdvanceCapacity;
    if (step === 4) return canAdvancePricing;
    if (step === 6) return canAdvancePhotos;
    return true;
  }, [
    step,
    canAdvanceBasics,
    canAdvanceCapacity,
    canAdvancePricing,
    canAdvancePhotos,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    if (service?.id) return;
    if (state.status.saving) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      try {
        const draft: StoredDraft = {
          version: 1,
          step,
          common: {
            title: String(state.common.title || ""),
            description: String(state.common.description || ""),
            price: Number(state.common.price || 0),
          },
          typeFields: { ...(state.typeFields || {}) },
        };
        window.localStorage.setItem(draftKey(undefined), JSON.stringify(draft));
      } catch {}
    }, 400);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [isOpen, service?.id, state.common, state.typeFields, state.status.saving, step]);

  const handleSubmit = async () => {
    if (submitLockRef.current) return;
    if (uploading || state.status.saving) return;
    setSubmitError(null);

    // Validate core required fields (draft restores may bypass step gating).
    if (!canAdvanceBasics) {
      setStep(0);
      setSubmitError("Please add a title and description before publishing.");
      return;
    }
    if (!canAdvanceCapacity) {
      setStep(2);
      setSubmitError("Please enter a valid capacity before publishing.");
      return;
    }
    if (!canAdvancePricing) {
      setStep(4);
      setSubmitError("Please enter a day rate before publishing.");
      return;
    }

    const imageCount = galleryUrls.length + mediaFiles.length;
    if (imageCount === 0) {
      setMediaError("At least one image is required.");
      return;
    }

    submitLockRef.current = true;
    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const f of mediaFiles) {
        try {
          const presign = await presignServiceMedia(f);
          if (presign.put_url) {
            await fetch(presign.put_url, {
              method: "PUT",
              headers: presign.headers || {},
              body: f,
            });
          }
          const key = (presign.key || presign.public_url || null) as string | null;
          if (key) uploadedUrls.push(key);
        } catch {
          const uploaded = await uploadImage(f);
          if (uploaded?.url) uploadedUrls.push(uploaded.url);
        }
      }

      const combined = normalizeStringList([...galleryUrls, ...uploadedUrls]);
      if (!combined[0]) {
        setMediaError("At least one image is required.");
        return;
      }

      actions.setTypeField("gallery_urls", combined);
      await actions.submit({ media_url: combined[0] || undefined });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Venue publish failed:", err);
      setMediaError("Failed to upload photos. Please try again.");
    } finally {
      submitLockRef.current = false;
      setUploading(false);
    }
  };

  const steps = [
    "Basics",
    "Location",
    "Capacity",
    "Amenities",
    "Pricing",
    "Rules",
    "Photos",
    "Review",
  ];

  const selectedAmenities = useMemo(
    () => normalizeVenueAmenities(state.typeFields.amenities),
    [state.typeFields.amenities],
  );

  const selectedRules = useMemo(
    () => normalizeVenueRules(state.typeFields.house_rules_selected),
    [state.typeFields.house_rules_selected],
  );

  const amenityCategories = useMemo(() => {
    const q = amenitySearch.trim().toLowerCase();
    if (!q) return VENUE_AMENITY_CATEGORIES;
    return VENUE_AMENITY_CATEGORIES.map((cat) => {
      const items = cat.items.filter((item) => {
        const label = (item.label || "").toLowerCase();
        const value = (item.value || "").toLowerCase();
        const helper = (item.helper || "").toLowerCase();
        return label.includes(q) || value.includes(q) || helper.includes(q);
      });
      return items.length ? { ...cat, items } : null;
    }).filter(Boolean) as typeof VENUE_AMENITY_CATEGORIES;
  }, [amenitySearch]);

  const toggleAmenity = (value: string) => {
    const set = new Set(selectedAmenities);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    actions.setTypeField("amenities", Array.from(set));
  };

  const toggleRule = (value: string) => {
    const set = new Set(selectedRules);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    actions.setTypeField("house_rules_selected", Array.from(set));
  };

  const goToStep = (nextStep: number) => {
    if (uploading || state.status.saving) return;
    if (nextStep < 0 || nextStep >= steps.length) return;
    if (nextStep <= maxStepCompleted) {
      setStep(nextStep);
      return;
    }
    if (nextStep === maxStepCompleted + 1 && canAdvanceCurrentStep) {
      setMaxStepCompleted(nextStep);
      setStep(nextStep);
    }
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50"
        open={isOpen}
        onClose={handleCancel}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 z-40 bg-gray-500/75" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 z-50 flex p-0">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel
              as="div"
              className="pointer-events-auto relative flex h-full w-full max-w-none flex-col overflow-hidden bg-white md:flex-row"
            >
              <button
                type="button"
                onClick={handleCancel}
                className="absolute right-4 top-4 z-10 rounded-md p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <XMarkIcon className="pointer-events-none h-5 w-5" />
              </button>

              <div className="flex w-full flex-none flex-col justify-between overflow-y-auto bg-gray-50 p-6 md:w-1/5">
                <Stepper
                  steps={steps}
                  currentStep={step}
                  maxStepCompleted={maxStepCompleted}
                  onStepClick={goToStep}
                  ariaLabel="Add venue service progress"
                  className="space-y-4"
                  orientation="vertical"
                  noCircles
                />
              </div>

              <div className="flex w-full flex-1 flex-col overflow-hidden md:w-4/5">
                <div className="flex-1 space-y-4 overflow-y-scroll p-6">
                  {step === 0 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">Basics</h2>

                      <TextInput
                        label="Listing title"
                        value={state.common.title}
                        onChange={(e) =>
                          actions.setCommonField("title", e.target.value)
                        }
                      />
                      <TextArea
                        label="Description"
                        rows={4}
                        value={state.common.description}
                        onChange={(e) =>
                          actions.setCommonField("description", e.target.value)
                        }
                      />
                      {profileDefaults?.description &&
                      profileDefaults.description ===
                        (state.common.description || "").trim() ? (
                        <p className="text-xs text-gray-500">
                          Pre-filled from your profile bio. Edit it for this venue.
                        </p>
                      ) : null}
                      <TextInput
                        label="Venue type (optional)"
                        value={state.typeFields.venue_type || ""}
                        onChange={(e) =>
                          actions.setTypeField("venue_type", e.target.value)
                        }
                      />
                      {!canAdvanceBasics && (
                        <p className="text-sm text-gray-600">
                          Add a clear title and description to continue.
                        </p>
                      )}
                    </div>
                  )}

                  {step === 1 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">Location</h2>
                      <TextInput
                        label="Address (optional)"
                        value={state.typeFields.address || ""}
                        onChange={(e) =>
                          actions.setTypeField("address", e.target.value)
                        }
                        placeholder="e.g. Sandton, Johannesburg"
                      />
                      {profileDefaults?.location &&
                      profileDefaults.location ===
                        (state.typeFields.address || "").trim() ? (
                        <p className="text-xs text-gray-500">
                          Pre-filled from your profile location. An approximate area is fine for now.
                        </p>
                      ) : null}
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">Capacity</h2>
                      <TextInput
                        label="Capacity"
                        type="number"
                        value={state.typeFields.capacity ?? ""}
                        onChange={(e) =>
                          actions.setTypeField(
                            "capacity",
                            Number(e.target.value || 0),
                          )
                        }
                      />
                      {!canAdvanceCapacity && (
                        <p className="text-sm text-gray-600">
                          Enter a valid capacity to continue.
                        </p>
                      )}
                    </div>
                  )}

                  {step === 3 && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h2 className="text-xl font-semibold">What this place offers</h2>
                        <p className="text-sm text-gray-600">
                          Select the amenities your venue has. You can update this later.
                        </p>
                      </div>
                      <TextInput
                        label="Search amenities"
                        value={amenitySearch}
                        onChange={(e) => setAmenitySearch(e.target.value)}
                        placeholder="e.g. parking, wifi, pool"
                      />
                      {amenityCategories.length === 0 ? (
                        <p className="text-sm text-gray-600">
                          No amenities match “{amenitySearch.trim()}”.
                        </p>
                      ) : (
                        <div className="space-y-6">
                          {amenityCategories.map((cat) => (
                            <div key={cat.id} className="space-y-2">
                              <div className="text-sm font-semibold text-gray-900">
                                {cat.label}
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {cat.items.map((a) => {
                                  const selected = selectedAmenities.includes(a.value);
                                  return (
                                    <label
                                      key={a.value}
                                      className={[
                                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition",
                                        selected
                                          ? "border-gray-200 bg-gray-50"
                                          : "border-gray-200 bg-white hover:border-gray-300",
                                      ].join(" ")}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => toggleAmenity(a.value)}
                                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-dark focus:ring-brand"
                                      />
                                      <span className="min-w-0">
                                        <span className="block font-medium">
                                          {a.label}
                                        </span>
                                        {a.helper ? (
                                          <span className="mt-0.5 block text-xs text-gray-500">
                                            {a.helper}
                                          </span>
                                        ) : null}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {step === 4 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">Pricing</h2>
                      <TextInput
                        label={`Day rate (${DEFAULT_CURRENCY})`}
                        type="number"
                        value={state.common.price}
                        onChange={(e) =>
                          actions.setCommonField(
                            "price",
                            Number(e.target.value || 0),
                          )
                        }
                      />
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <TextInput
                          label={`Cleaning fee (${DEFAULT_CURRENCY})`}
                          type="number"
                          value={state.typeFields.cleaning_fee ?? 0}
                          onChange={(e) =>
                            actions.setTypeField(
                              "cleaning_fee",
                              Number(e.target.value || 0),
                            )
                          }
                        />
                        <TextInput
                          label={`Overtime rate (${DEFAULT_CURRENCY}/hour)`}
                          type="number"
                          value={state.typeFields.overtime_rate ?? 0}
                          onChange={(e) =>
                            actions.setTypeField(
                              "overtime_rate",
                              Number(e.target.value || 0),
                            )
                          }
                        />
                      </div>
                      {!canAdvancePricing && (
                        <p className="text-sm text-gray-600">
                          Enter a day rate to continue.
                        </p>
                      )}
                    </div>
                  )}

                  {step === 5 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">Rules & policies</h2>
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-gray-900">
                          House rules
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {VENUE_RULE_OPTIONS.map((rule) => (
                            <label
                              key={rule.value}
                              className={[
                                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition",
                                selectedRules.includes(rule.value)
                                  ? "border-gray-900 bg-gray-900 text-white"
                                  : "border-gray-200 bg-white text-gray-900 hover:border-gray-300",
                              ].join(" ")}
                            >
                              <input
                                type="checkbox"
                                checked={selectedRules.includes(rule.value)}
                                onChange={() => toggleRule(rule.value)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-dark focus:ring-brand"
                              />
                              <span className="min-w-0">
                                <span className="block font-medium">
                                  {getVenueRuleLabel(rule.value)}
                                </span>
                                {rule.helper ? (
                                  <span
                                    className={[
                                      "mt-0.5 block text-xs",
                                      selectedRules.includes(rule.value)
                                        ? "text-white/80"
                                        : "text-gray-500",
                                    ].join(" ")}
                                  >
                                    {rule.helper}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          ))}
                        </div>
                        <TextArea
                          label="Additional rules (optional)"
                          rows={4}
                          value={state.typeFields.house_rules || ""}
                          onChange={(e) =>
                            actions.setTypeField("house_rules", e.target.value)
                          }
                          placeholder="Noise policy, decor restrictions, smoking, catering rules, etc."
                        />
                      </div>
                      <TextArea
                        label="Cancellation policy override (optional)"
                        rows={4}
                        value={state.typeFields.cancellation_policy || ""}
                        onChange={(e) =>
                          actions.setTypeField(
                            "cancellation_policy",
                            e.target.value,
                          )
                        }
                        placeholder="If empty, we show your profile’s cancellation policy."
                      />
                    </div>
                  )}

                  {step === 6 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">Photos</h2>
                      <p className="text-sm text-gray-600">
                        First image is the cover photo. Up to 7 total.
                      </p>
                      <label
                        htmlFor="media-upload"
                        className="flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 text-center"
                      >
                        <p className="text-sm">Drag files here or click to upload</p>
                        <input
                          id="media-upload"
                          aria-label="Media"
                          data-testid="media-input"
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => onFileChange(e.target.files)}
                        />
                      </label>

                      {mediaError && (
                        <p className="mt-2 text-sm text-red-600">{mediaError}</p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        {galleryUrls.map((src, i) => (
                          <div
                            key={`${src}:${i}`}
                            className="relative h-20 w-20 overflow-hidden rounded border"
                          >
                            <SafeImage
                              src={src}
                              alt={`existing-media-${i}`}
                              width={80}
                              height={80}
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                              {i === 0 ? "Cover" : "Gallery"}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeExistingUrl(i)}
                              className="absolute right-0 top-0 h-4 w-4 rounded-full bg-black/50 text-xs text-white"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {thumbnails.map((src, i) => (
                          <div
                            key={i}
                            className="relative h-20 w-20 overflow-hidden rounded border"
                          >
                            <SafeImage
                              src={src}
                              alt={`media-${i}`}
                              width={80}
                              height={80}
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                              {galleryUrls.length === 0 && i === 0 ? "Cover" : "Gallery"}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFile(i)}
                              className="absolute right-0 top-0 h-4 w-4 rounded-full bg-black/50 text-xs text-white"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {step === 7 && (
                    <div className="space-y-6">
                      <h2 className="text-xl font-semibold">Review</h2>
                      <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="text-sm text-gray-500">Title</div>
                        <div className="mt-1 font-semibold text-gray-900">
                          {(state.common.title || "").trim() || "—"}
                        </div>

                        <div className="mt-4 text-sm text-gray-500">Price</div>
                        <div className="mt-1 font-semibold text-gray-900">
                          {Number(state.common.price || 0) > 0
                            ? `R${Number(state.common.price || 0)} per day`
                            : "—"}
                        </div>

                        <div className="mt-4 text-sm text-gray-500">Capacity</div>
                        <div className="mt-1 font-semibold text-gray-900">
                          {Number(state.typeFields.capacity || 0) > 0
                            ? `${Number(state.typeFields.capacity || 0)} guests`
                            : "—"}
                        </div>

                        <div className="mt-4 text-sm text-gray-500">Amenities</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {selectedAmenities.length ? (
                            selectedAmenities.slice(0, 12).map((a) => (
                              <span
                                key={a}
                                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800"
                              >
                                {getVenueAmenityLabel(a)}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-700">—</span>
                          )}
                          {selectedAmenities.length > 12 ? (
                            <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
                              +{selectedAmenities.length - 12} more
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-4 text-sm text-gray-500">Photos</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {galleryUrls[0] ? (
                            <div className="relative h-24 w-24 overflow-hidden rounded-lg border">
                              <SafeImage
                                src={galleryUrls[0]}
                                alt="cover"
                                width={96}
                                height={96}
                                className="h-full w-full object-cover"
                              />
                              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                                Cover
                              </span>
                            </div>
                          ) : thumbnails[0] ? (
                            <div className="relative h-24 w-24 overflow-hidden rounded-lg border">
                              <SafeImage
                                src={thumbnails[0]}
                                alt="cover"
                                width={96}
                                height={96}
                                className="h-full w-full object-cover"
                              />
                              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                                Cover
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-700">—</span>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-gray-600">
                        Publishing sends your venue to Booka for review.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-none items-center justify-between border-t bg-white p-4">
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={uploading || state.status.saving}
                  >
                    Cancel
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setStep(Math.max(0, step - 1))}
                      disabled={step === 0 || uploading || state.status.saving}
                    >
                      Back
                    </Button>

                    {step < steps.length - 1 ? (
                    <Button
                      onClick={() => goToStep(step + 1)}
                      disabled={!canAdvanceCurrentStep || uploading || state.status.saving}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      isLoading={uploading || state.status.saving}
                    >
                      {uploading ? "Uploading…" : service ? "Save" : "Publish"}
                    </Button>
                  )}
                  </div>
                </div>
                {submitError ? (
                  <div className="border-t bg-white px-6 py-3 text-sm text-red-600">
                    {submitError}
                  </div>
                ) : null}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

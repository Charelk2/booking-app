"use client";

import { useForm, type SubmitHandler } from "react-hook-form";
import { useState, useRef, useEffect, Fragment, useMemo } from "react";
import {
  MusicalNoteIcon,
  VideoCameraIcon,
  SparklesIcon,
  SquaresPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { ElementType } from "react";
import clsx from "clsx";
import { Dialog, Transition } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";

import type { Service } from "@/types";
import {
  createService as apiCreateService,
  updateService as apiUpdateService,
  getAllServices,
} from "@/lib/api";
import { ID_TO_UI_CATEGORY } from "@/lib/categoryMap";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import Button from "@/components/ui/Button";
import { Stepper, TextInput, TextArea, CollapsibleSection } from "@/components/ui";

const serviceTypeIcons: Record<Service["service_type"], ElementType> = {
  "Live Performance": MusicalNoteIcon,
  "Virtual Appearance": VideoCameraIcon,
  "Personalized Video": VideoCameraIcon,
  "Custom Song": SparklesIcon,
  Other: SquaresPlusIcon,
};

// Hook for optimized image preview thumbnails
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

// Framer Motion variants for step transitions
const stepVariants = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -50 },
  transition: { duration: 0.3, ease: [0.42, 0, 0.58, 1] as const },
};

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServiceSaved: (newService: Service) => void;
  service?: Service;
}

interface ServiceFormData {
  service_type: Service["service_type"] | undefined;
  title: string;
  description: string;
  duration_minutes: number | "";
  is_remote: boolean;
  price: number | "";
  travel_rate?: number | "";
  travel_members?: number | "";
  car_rental_price?: number | "";
  flight_price?: number | "";
  // Sound provisioning for Live Performance
  sound_mode?: "artist_provides_variable" | "external_providers";
  price_driving_sound?: number | "";
  price_flying_sound?: number | "";
  sound_city_prefs?: { city: string; provider_ids: number[] }[];
}

const emptyDefaults: ServiceFormData = {
  service_type: undefined,
  title: "",
  description: "",
  duration_minutes: 60,
  is_remote: false,
  price: 0,
  travel_rate: 2.5,
  travel_members: 1,
  car_rental_price: 1000,
  flight_price: 2780,
  sound_mode: "artist_provides_variable",
  price_driving_sound: "",
  price_flying_sound: "",
  sound_city_prefs: [],
};

export default function AddServiceModalMusician({
  isOpen,
  onClose,
  onServiceSaved,
  service,
}: AddServiceModalProps) {
  const steps = ["Type", "Details", "Media", "Review"];
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);

  const editingDefaults = useMemo<ServiceFormData>(
    () => ({
      service_type: service?.service_type,
      title: service?.title ?? "",
      description: service?.description ?? "",
      duration_minutes: service?.duration_minutes ?? 60,
      is_remote: service?.is_remote ?? false,
      price: service?.price ?? 0,
      travel_rate: service?.travel_rate ?? "",
      travel_members: service?.travel_members ?? "",
      car_rental_price: service?.car_rental_price ?? "",
      flight_price: service?.flight_price ?? "",
    }),
    [service],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    trigger,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ServiceFormData>({
    mode: "onChange",
    reValidateMode: "onChange",
    criteriaMode: "all",
    shouldUnregister: false,
    defaultValues: service ? editingDefaults : emptyDefaults,
  });

  // Ensure service_type is registered so watch and validation work when selecting a category.
  useEffect(() => {
    register("service_type", { required: true });
    register("sound_mode");
  }, [register]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(
    service?.media_url ?? null,
  );
  const [publishing, setPublishing] = useState(false);
  const [, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      reset(service ? editingDefaults : emptyDefaults);
      setMediaFiles([]);
      setExistingMediaUrl(service?.media_url ?? null);
      setMediaError(null);
      setStep(0);
      setMaxStep(0);
      // Populate sound provisioning fields when editing
      try {
        const sp: any = (service as any)?.details?.sound_provisioning;
        if (sp) {
          const mode = sp.mode === "external_providers" ? "external_providers" : "artist_provides_variable";
          setValue("sound_mode", mode as any, { shouldDirty: false });
          setValue(
            "price_driving_sound",
            (sp.price_driving_sound_zar ?? sp.flat_price_zar ?? "") as any,
            { shouldDirty: false },
          );
          setValue(
            "price_flying_sound",
            (sp.price_flying_sound_zar ?? "") as any,
            { shouldDirty: false },
          );
          setValue("sound_city_prefs", (sp.city_preferences ?? []) as any, { shouldDirty: false });
        }
      } catch {
        // ignore mapping issues
      }
    }
  }, [isOpen, service, reset, editingDefaults]);

  const watchTitle = watch("title");
  const watchDescription = watch("description");
  const watchServiceType = watch("service_type");
  const watchSoundMode = watch("sound_mode");

  const thumbnails = useImageThumbnails(mediaFiles);

  useEffect(() => {
    setMaxStep((prev) => Math.max(prev, step));
  }, [step]);

  const nextDisabled = () => {
    if (step === 0) return !watch("service_type");
    if (step === 1) return !isValid;
    if (step === 2)
      return (
        (!mediaFiles.some((f) => f.type.startsWith("image/")) &&
          !existingMediaUrl) ||
        !!mediaError
      );
    return false;
  };

  const next = async () => {
    if (step === 1) {
      const valid = await trigger([
        "title",
        "description",
        "duration_minutes",
        "price",
      ]);
      if (!valid) return;
    }
    if (step === 2) {
      if (
        !mediaFiles.some((f) => f.type.startsWith("image/")) &&
        !existingMediaUrl
      ) {
        setMediaError("At least one image is required.");
        return;
      }
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
    setMaxStep((m) => Math.max(m, step + 1));
  };

  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const onFileChange = (files: FileList | null) => {
    if (!files) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length !== files.length) {
      setMediaError("Only image files are allowed.");
    } else {
      setMediaError(null);
    }
    setMediaFiles((prev) => [...prev, ...images]);
    if (
      images.length === 0 &&
      !mediaFiles.some((f) => f.type.startsWith("image/")) &&
      !existingMediaUrl
    ) {
      setMediaError("At least one image is required.");
    }
  };

  const removeFile = (i: number) => {
    setMediaFiles((prev) => {
      const updated = prev.filter((_, idx) => idx !== i);
      if (
        !updated.some((f) => f.type.startsWith("image/")) &&
        !existingMediaUrl
      ) {
        setMediaError("At least one image is required.");
      }
      return updated;
    });
  };

  const removeExistingMedia = () => {
    setExistingMediaUrl(null);
    if (!mediaFiles.some((f) => f.type.startsWith("image/"))) {
      setMediaError("At least one image is required.");
    }
  };

  const onSubmit: SubmitHandler<ServiceFormData> = async (data) => {
    setServerError(null);
    setPublishing(true);
    try {
      const serviceData: any = {
        ...data,
        price: Number(data.price || 0),
        duration_minutes: Number(data.duration_minutes || 0),
        service_category_slug: "musician",
        travel_rate: data.travel_rate ? Number(data.travel_rate) : undefined,
        travel_members: data.travel_members
          ? Number(data.travel_members)
          : undefined,
        car_rental_price: data.car_rental_price
          ? Number(data.car_rental_price)
          : undefined,
        flight_price: data.flight_price ? Number(data.flight_price) : undefined,
      };
      // Attach sound provisioning details when Live Performance
      if (data.service_type === "Live Performance") {
        serviceData.details = {
          ...(service?.details as any),
          sound_provisioning: {
            mode: data.sound_mode,
            price_driving_sound_zar:
              data.sound_mode === "artist_provides_variable"
                ? Number(data.price_driving_sound || 0)
                : undefined,
            price_flying_sound_zar:
              data.sound_mode === "artist_provides_variable"
                ? Number(data.price_flying_sound || 0)
                : undefined,
            city_preferences:
              data.sound_mode === "external_providers"
                ? (data.sound_city_prefs || [])
                : undefined,
          },
        };
      }
      let media_url = existingMediaUrl || "";
      if (mediaFiles[0]) {
        media_url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(mediaFiles[0]);
        });
      }
      const res = service
        ? await apiUpdateService(service.id, { ...serviceData, media_url })
        : await apiCreateService({ ...serviceData, media_url });
      onServiceSaved(res.data);
      reset(service ? editingDefaults : emptyDefaults);
      setMediaFiles([]);
      setExistingMediaUrl(res.data.media_url ?? null);
      setStep(0);
      onClose();
    } catch (err: unknown) {
      console.error("Service save error:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Failed to save service.";
      setServerError(msg);
    } finally {
      setPublishing(false);
    }
  };

  const handleCancel = () => {
    reset(service ? editingDefaults : emptyDefaults);
    setMediaFiles([]);
    setExistingMediaUrl(service?.media_url ?? null);
    setMediaError(null);
    setStep(0);
    setMaxStep(0);
    onClose();
  };

  const types: { value: Service["service_type"]; label: string }[] = [
    { value: "Live Performance", label: "Live Performance" },
    { value: "Virtual Appearance", label: "Virtual Appearance" },
    { value: "Personalized Video", label: "Personalized Video" },
    { value: "Custom Song", label: "Custom Song" },
    { value: "Other", label: "Other" },
  ];

  // Load available Sound Service providers for external selection
  const [soundServices, setSoundServices] = useState<Service[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await getAllServices();
        // Some backends omit `service_category_slug`; fall back to mapping
        // the numeric `service_category_id` to a known slug.
        const services = (res.data || []).filter(
          (s) =>
            s.service_category_slug === "sound_service" ||
            ID_TO_UI_CATEGORY[(s as any).service_category_id || 0] ===
              "sound_service",
        );
        if (!cancelled) setSoundServices(services);
      } catch (e) {
        // non-fatal; keep empty list
      }
    }
    if (isOpen) load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Helpers for provider selection per city
  const CITY_CODES = ["CPT", "JNB", "DBN", "PLZ", "GRJ", "ELS", "MQP", "BFN", "KIM"];
  const addCityPref = () => {
    const cur = watch("sound_city_prefs") || [];
    setValue("sound_city_prefs", [...cur, { city: "", provider_ids: [] }], {
      shouldDirty: true,
    });
  };
  const removeCityPref = (idx: number) => {
    const cur = (watch("sound_city_prefs") || []).slice();
    cur.splice(idx, 1);
    setValue("sound_city_prefs", cur, { shouldDirty: true });
  };
  const updateCityAt = (idx: number, city: string) => {
    const cur = (watch("sound_city_prefs") || []).slice();
    cur[idx] = { ...(cur[idx] || { provider_ids: [] }), city };
    setValue("sound_city_prefs", cur, { shouldDirty: true });
  };
  const toggleProviderAt = (idx: number, providerId: number) => {
    const cur = (watch("sound_city_prefs") || []).slice();
    const entry = cur[idx] || { city: "", provider_ids: [] };
    const set = new Set<number>(entry.provider_ids || []);
    if (set.has(providerId)) set.delete(providerId);
    else if (set.size < 3) set.add(providerId); // limit to 3
    entry.provider_ids = Array.from(set);
    cur[idx] = entry;
    setValue("sound_city_prefs", cur, { shouldDirty: true });
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50"
        open={isOpen}
        onClose={handleCancel}
      >
        {/* Overlay: this needs to be behind the modal content */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 z-40 bg-gray-500/75"
            aria-hidden="true"
          />
        </Transition.Child>

        {/* Modal content container: occupy full screen without padding */}
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
              className="pointer-events-auto relative flex h-full w-full max-w-none flex-col overflow-hidden rounded-none bg-white shadow-none md:flex-row"
            >
              {/* Close button for web and mobile */}
              <button
                type="button"
                onClick={handleCancel}
                className="absolute right-4 top-4 z-10 rounded-md p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <XMarkIcon className="pointer-events-none h-5 w-5" />
              </button>

              {/* Left Pane (Steps) */}
              <div className="flex w-full flex-none flex-col justify-between overflow-y-auto bg-gray-50 p-6 md:w-1/5">
                <Stepper
                  steps={steps.slice(0, 3)}
                  currentStep={step}
                  maxStepCompleted={maxStep}
                  onStepClick={setStep}
                  ariaLabel="Add service progress"
                  className="space-y-4"
                  orientation="vertical"
                  noCircles={true}
                />
              </div>

              {/* Right Pane (Form Content) */}
              <div className="flex w-full flex-1 flex-col overflow-hidden md:w-3/5">
                <form
                  id="add-service-form"
                  onSubmit={handleSubmit(onSubmit)}
                  className="flex-1 space-y-4 overflow-y-scroll p-6"
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      variants={stepVariants}
                      transition={stepVariants.transition}
                    >
                      {step === 0 && (
                        <div className="space-y-4">
                          <h2 className="text-xl font-semibold">
                            Choose Your Service Category
                          </h2>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {types.map(({ value, label }) => {
                              const Icon = serviceTypeIcons[value];
                              return (
                                <button
                                  type="button"
                                  key={value}
                                  data-value={value}
                                  onClick={() =>
                                    setValue("service_type", value, {
                                      shouldDirty: true,
                                      shouldValidate: true,
                                    })
                                  }
                                  className={clsx(
                                    "flex flex-col items-center justify-center rounded-xl border p-4 text-sm transition",
                                    watch("service_type") === value
                                      ? "border-2 border-[var(--brand-color)]"
                                      : "border-gray-200 hover:border-gray-300",
                                  )}
                                >
                                  {Icon && <Icon className="mb-1 h-6 w-6" />}
                                  <span className="text-sm font-medium text-gray-800">
                                    {label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Step 1: Service Details */}
                      {step === 1 && (
                        <div className="space-y-4">
                          <h2 className="text-xl font-semibold">
                            Service Details
                          </h2>
                          <div className="space-y-2">
                            <TextInput
                              label="Service Title"
                              {...register("title", {
                                required: "Service title is required",
                                validate: (value) => {
                                  const len = value.trim().length;
                                  if (len < 5)
                                    return `Need ${5 - len} more characters`;
                                  if (len > 60)
                                    return `Remove ${len - 60} characters`;
                                  return true;
                                },
                              })}
                              error={errors.title?.message}
                            />
                            <p className="mt-1 text-right text-xs text-gray-500">
                              {(watchTitle || "").length}/60
                            </p>
                          </div>

                          <div className="space-y-2">
                            <TextArea
                              label="Description"
                              rows={4}
                              {...register("description", {
                                required: "Description is required",
                                validate: (value) => {
                                  const len = value.trim().length;
                                  if (len < 20)
                                    return `Need ${20 - len} more characters`;
                                  if (len > 500)
                                    return `Remove ${len - 500} characters`;
                                  return true;
                                },
                              })}
                              error={errors.description?.message}
                            />
                            <p className="mt-1 text-right text-xs text-gray-500">
                              {(watchDescription || "").length}/500
                            </p>
                          </div>

                          <TextInput
                            label="Duration (minutes)"
                            type="number"
                            {...register("duration_minutes", {
                              required: "Duration is required",
                              valueAsNumber: true,
                              min: { value: 1, message: "Minimum 1 minute" },
                            })}
                            error={errors.duration_minutes?.message}
                          />
                          <TextInput
                            label={`Price (${DEFAULT_CURRENCY})`}
                            type="number"
                            step="0.01"
                            {...register("price", {
                              required: "Price is required",
                              valueAsNumber: true,
                              min: {
                                value: 0.01,
                                message: "Price must be positive",
                              },
                            })}
                            error={errors.price?.message}
                          />
                      {watchServiceType === "Live Performance" && (
                        <div className="space-y-2">
                          <h3 className="text-base font-semibold">Sound Provisioning</h3>
                          <p className="text-xs text-gray-600">Choose how sound is handled for live shows.</p>
                          <div className="flex flex-wrap gap-2 text-sm">
                            {[
                              { v: "artist_provides_variable", l: "I provide sound (pricing varies by travel)" },
                              { v: "external_providers", l: "Use external providers" },
                            ].map((o) => (
                              <button
                                key={o.v}
                                type="button"
                                className={clsx(
                                  "rounded-full border px-3 py-1",
                                  watchSoundMode === o.v
                                    ? "border-[var(--brand-color)] bg-[var(--brand-color)]/10"
                                    : "border-gray-200 hover:border-gray-300",
                                )}
                                onClick={() => setValue("sound_mode", o.v as any, { shouldDirty: true })}
                              >
                                {o.l}
                              </button>
                            ))}
                          </div>

                          {watchSoundMode === "artist_provides_variable" && (
                            <>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <TextInput
                                  label={`Price when I can drive and provide sound myself (${DEFAULT_CURRENCY})`}
                                  type="number"
                                  step="0.01"
                                  placeholder="e.g., 1500"
                                  {...register("price_driving_sound", { valueAsNumber: true })}
                                />
                                <TextInput
                                  label={`Price when flying (includes sound hire) (${DEFAULT_CURRENCY})`}
                                  type="number"
                                  step="0.01"
                                  placeholder="e.g., 3000"
                                  {...register("price_flying_sound", { valueAsNumber: true })}
                                />
                              </div>
                              <p className="text-xs text-gray-600">
                                Typical cost; final quote may vary based on venue and requirements.
                              </p>
                            </>
                          )}

                          {watchSoundMode === "external_providers" && (
                            <CollapsibleSection
                              title="Preferred external providers per city"
                              open
                              onToggle={() => {}}
                              className="border"
                            >
                              <div className="space-y-3">
                                {(watch("sound_city_prefs") || []).map((row, idx) => {
                                  const providersForCity = soundServices.filter((s: any) =>
                                    Array.isArray((s as any).details?.coverage_areas)
                                      ? (s as any).details.coverage_areas.includes(row.city)
                                      : true,
                                  );
                                  return (
                                    <div key={idx} className="rounded-md border p-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex gap-2">
                                          <label className="text-sm text-gray-700">City</label>
                                          <select
                                            aria-label={`City ${idx + 1}`}
                                            value={row.city || ""}
                                            onChange={(e) => updateCityAt(idx, e.target.value)}
                                            className="rounded border px-2 py-1 text-sm"
                                          >
                                            <option value="">Select city</option>
                                            {CITY_CODES.map((c) => (
                                              <option key={c} value={c}>
                                                {c}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <button
                                          type="button"
                                          className="text-xs text-red-600"
                                          onClick={() => removeCityPref(idx)}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                      <div className="mt-2 text-xs text-gray-600">
                                        Pick up to 3 providers. We’ll use 2 and 3 as backups.
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {providersForCity.map((s) => (
                                          <label key={s.id} className="flex items-center gap-1 text-sm">
                                            <input
                                              type="checkbox"
                                              checked={(row.provider_ids || []).includes(s.id)}
                                              onChange={() => toggleProviderAt(idx, s.id)}
                                              disabled={
                                                !(row.provider_ids || []).includes(s.id) &&
                                                (row.provider_ids || []).length >= 3
                                              }
                                            />
                                            <span>{s.title}</span>
                                          </label>
                                        ))}
                                        {providersForCity.length === 0 && (
                                          <span className="text-xs text-gray-500">No providers match this city yet.</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                <button type="button" className="text-sm text-brand" onClick={addCityPref}>
                                  + Add city
                                </button>
                              </div>
                            </CollapsibleSection>
                          )}
                              <TextInput
                                label="Travelling (Rand per km)"
                                type="number"
                                step="0.1"
                                placeholder="2.5"
                                {...register("travel_rate", {
                                  valueAsNumber: true,
                                })}
                              />
                              <TextInput
                                label="Members travelling"
                                type="number"
                                step="1"
                                {...register("travel_members", {
                                  valueAsNumber: true,
                                })}
                              />
                              <TextInput
                                label="Car rental price"
                                type="number"
                                step="0.01"
                                {...register("car_rental_price", {
                                  valueAsNumber: true,
                                })}
                              />
                              <TextInput
                                label="Return flight price (per person)"
                                type="number"
                                step="0.01"
                                {...register("flight_price", {
                                  valueAsNumber: true,
                                })}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Step 2: Upload Media */}
                      {step === 2 && (
                        <div className="space-y-4">
                          <h2 className="mb-2 text-xl font-semibold">
                            Upload Media
                          </h2>
                          <p className="mb-2 text-sm text-gray-600">
                            Use high-resolution images or short video clips to
                            showcase your talent.
                          </p>
                          <label
                            htmlFor="media-upload"
                            className="flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 text-center"
                          >
                            <p className="text-sm">
                              Drag files here or click to upload
                            </p>
                            <input
                              id="media-upload"
                              ref={fileInputRef}
                              type="file"
                              multiple
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => onFileChange(e.target.files)}
                            />
                          </label>
                          {mediaError && (
                            <p className="mt-2 text-sm text-red-600">
                              {mediaError}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {existingMediaUrl && (
                              <div className="relative h-20 w-20 overflow-hidden rounded border">
                                <Image
                                  src={existingMediaUrl}
                                  alt="existing-media"
                                  width={80}
                                  height={80}
                                  className="h-full w-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={removeExistingMedia}
                                  className="absolute right-0 top-0 h-4 w-4 rounded-full bg-black/50 text-xs text-white"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                            {thumbnails.map((src: string, i: number) => (
                              <div
                                key={i}
                                className="relative h-20 w-20 overflow-hidden rounded border"
                              >
                                <Image
                                  src={src}
                                  alt={`media-${i}`}
                                  width={80}
                                  height={80}
                                  className="h-full w-full object-cover"
                                />
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

                      {/* Step 3: Review Your Service */}
                      {step === 3 && (
                        <div className="space-y-4">
                          <h2 className="text-xl font-semibold">
                            Review Your Service
                          </h2>
                          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                            <div className="rounded-md border p-2">
                              <h3 className="font-medium">Type</h3>
                              <p>{watch("service_type")}</p>
                            </div>
                            <div className="rounded-md border p-2">
                              <h3 className="font-medium">Title</h3>
                              <p>{watch("title")}</p>
                            </div>
                            <div className="rounded-md border p-2">
                              <h3 className="font-medium">Description</h3>
                              <p>{watch("description")}</p>
                            </div>
                            <div className="rounded-md border p-2">
                              <h3 className="font-medium">Duration</h3>
                              <p>{watch("duration_minutes") || 0} minutes</p>
                            </div>
                          <div className="rounded-md border p-2">
                            <h3 className="font-medium">Price</h3>
                            <p>{watch("price") || 0}</p>
                          </div>
                          {watchServiceType === "Live Performance" && watchSoundMode === "artist_provides_variable" && (
                            <>
                              <div className="rounded-md border p-2">
                                <h3 className="font-medium">Sound price when driving</h3>
                                <p>{watch("price_driving_sound") || 0}</p>
                              </div>
                              <div className="rounded-md border p-2">
                                <h3 className="font-medium">Sound price when flying (incl. hire)</h3>
                                <p>{watch("price_flying_sound") || 0}</p>
                              </div>
                            </>
                          )}
                          {watchServiceType === "Live Performance" && (
                            <>
                              <div className="rounded-md border p-2">
                                <h3 className="font-medium">
                                  Travelling (Rand per km)
                                </h3>
                                  <p>{watch("travel_rate") || 0}</p>
                                </div>
                                <div className="rounded-md border p-2">
                                  <h3 className="font-medium">
                                    Members travelling
                                  </h3>
                                  <p>{watch("travel_members") || 1}</p>
                                </div>
                                <div className="rounded-md border p-2">
                                  <h3 className="font-medium">
                                    Car rental price
                                  </h3>
                                  <p>{watch("car_rental_price") || 0}</p>
                                </div>
                                <div className="rounded-md border p-2">
                                  <h3 className="font-medium">
                                    Return flight price (per person)
                                  </h3>
                                  <p>{watch("flight_price") || 0}</p>
                                </div>
                              </>
                            )}
                            {mediaFiles.length > 0 && (
                              <div className="col-span-full rounded-md border p-2">
                                <h3 className="font-medium">Images</h3>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {thumbnails.map((src: string, i: number) => (
                                    <Image
                                      key={i}
                                      src={src}
                                      alt={`media-${i}`}
                                      width={64}
                                      height={64}
                                      className="h-16 w-16 rounded object-cover"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </form>

                {/* Action buttons */}
                <div className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-gray-100 p-4 sm:flex-row sm:justify-between">
                  <Button
                    variant="outline"
                    onClick={step === 0 ? handleCancel : prev}
                    data-testid="back"
                    className="min-h-[40px] w-full sm:w-auto"
                  >
                    {step === 0 ? "Cancel" : "Back"}
                  </Button>
                  {step < steps.length - 1 && (
                    <Button
                      onClick={next}
                      disabled={nextDisabled()}
                      data-testid="next"
                      className="min-h-[40px] w-full sm:w-auto"
                    >
                      Next
                    </Button>
                  )}
                  {step === steps.length - 1 && (
                    <Button
                      type="submit"
                      form="add-service-form"
                      disabled={publishing || isSubmitting || nextDisabled()}
                      isLoading={publishing || isSubmitting}
                      className="min-h-[40px] w-full sm:w-auto"
                    >
                      {service ? "Save Changes" : "Publish"}
                    </Button>
                  )}
                </div>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

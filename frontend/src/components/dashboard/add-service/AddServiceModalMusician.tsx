"use client";

import { useForm, type SubmitHandler, useFieldArray } from "react-hook-form";
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
  upsertRider,
} from "@/lib/api";
import { ID_TO_UI_CATEGORY } from "@/lib/categoryMap";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import Button from "@/components/ui/Button";
import { Stepper, TextInput, TextArea, CollapsibleSection, ToggleSwitch } from "@/components/ui";

// ────────────────────────────────────────────────────────────────────────────────
// Icons per service type
const serviceTypeIcons: Record<Service["service_type"], ElementType> = {
  "Live Performance": MusicalNoteIcon,
  "Virtual Appearance": VideoCameraIcon,
  "Personalized Video": VideoCameraIcon,
  "Custom Song": SparklesIcon,
  Other: SquaresPlusIcon,
};

// ────────────────────────────────────────────────────────────────────────────────
// Hook for optimized image preview thumbnails
function useImageThumbnails(files: File[]) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setThumbnails(urls);
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); };
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

// ────────────────────────────────────────────────────────────────────────────────
// Tech Rider model
type PowerPhase = "single" | "three";

interface TechChannel {
  ch: number;
  source: string;
  mic?: string;
  di?: boolean;
  phantom?: boolean;
  notes?: string;
}

interface TechMonitoring {
  mixes: number;
  wedges_ok: boolean;
  iem_ok: boolean;
  talkback_required: boolean;
}

interface TechStage {
  min_width_m?: number | "";
  min_depth_m?: number | "";
  cover_required: boolean;
  stage_plot_url?: string;
}

interface TechPower {
  phase: PowerPhase;
  amps: number | "";
  circuits_needed?: number | "";
  distro_notes?: string;
}

interface TechFOH {
  min_channels: number | "";
  console_preference?: string;
  fx_requirements?: string;
  playback_sources?: string;
}

interface TechBackline {
  required_items: string[];
  optional_items?: string[];
  notes?: string;
}

interface TechRider {
  lineup_label?: string;
  channels: TechChannel[];
  monitoring: TechMonitoring;
  stage: TechStage;
  power: TechPower;
  foh: TechFOH;
  backline: TechBackline;
  patch_advance_notes?: string;
  pdf_url?: string | null;
}

// ────────────────────────────────────────────────────────────────────────────────
// Form types
interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServiceSaved: (newService: Service) => void;
  service?: Service;
}

type SoundMode = "artist_provides_variable" | "external_providers";
interface CityPref { city: string; provider_ids: number[] }

interface ServiceFormData {
  service_type: Service["service_type"] | undefined;
  title: string;
  description: string;
  duration_label?: string;
  duration_minutes: number | "";
  price: number | "";
  travel_rate?: number | "";
  travel_members?: number | "";
  car_rental_price?: number | "";
  flight_price?: number | "";
  sound_mode?: SoundMode;
  price_driving_sound?: number | "";
  price_flying_sound?: number | "";
  sound_city_prefs?: CityPref[];
  tech: TechRider;
}

const CITY_CODES = ["CPT", "JNB", "DBN", "PLZ", "GRJ", "ELS", "MQP", "BFN", "KIM"];

// ────────────────────────────────────────────────────────────────────────────────
// Defaults
const emptyTechRider: TechRider = {
  lineup_label: "Solo / Duo / Band",
  channels: [
    { ch: 1, source: "Lead Vocal", mic: "Any cardioid dynamic (SM58/e935)", di: false, phantom: false },
    { ch: 2, source: "Acoustic Guitar DI", mic: "", di: true, phantom: false },
  ],
  monitoring: { mixes: 2, wedges_ok: true, iem_ok: true, talkback_required: false },
  stage: { min_width_m: "", min_depth_m: "", cover_required: false, stage_plot_url: "" },
  power: { phase: "single", amps: 16, circuits_needed: "", distro_notes: "" },
  foh: { min_channels: 8, console_preference: "Any pro digital (M32/X32/CL/SQ)", fx_requirements: "1x reverb, 1x delay", playback_sources: "Laptop TRS / 3.5mm / USB" },
  backline: { required_items: [], optional_items: [], notes: "" },
  patch_advance_notes: "",
  pdf_url: "",
};

const emptyDefaults: ServiceFormData = {
  service_type: undefined,
  title: "",
  description: "",
  duration_label: "",
  duration_minutes: 60,
  price: 0,
  travel_rate: 2.5,
  travel_members: 1,
  car_rental_price: 1000,
  flight_price: 2780,
  sound_mode: "artist_provides_variable",
  price_driving_sound: "",
  price_flying_sound: "",
  sound_city_prefs: [],
  tech: emptyTechRider,
};

// ────────────────────────────────────────────────────────────────────────────────
export default function AddServiceModalMusician({
  isOpen,
  onClose,
  onServiceSaved,
  service,
}: AddServiceModalProps) {
  const steps = ["Type", "Details", "Sound & Tech", "Media", "Review"];
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);

  // Collapsibles state
  const [inputsOpen, setInputsOpen] = useState(true);
  const [monitoringOpen, setMonitoringOpen] = useState(false);
  const [stagePowerOpen, setStagePowerOpen] = useState(false);
  const [fohOpen, setFohOpen] = useState(false);
  const [backlineOpen, setBacklineOpen] = useState(false);
  const [providersOpen, setProvidersOpen] = useState(true);

  // Hydrate defaults when editing
  const editingDefaults = useMemo<ServiceFormData>(() => {
    const det: any = service?.details || {};
    const sp: any = det.sound_provisioning || {};
    const existingTech: TechRider = det.tech_rider || emptyTechRider;
    return {
      service_type: service?.service_type,
      title: service?.title ?? "",
      description: service?.description ?? "",
      duration_label:
        (service as any)?.duration ||
        det.duration_label ||
        (service?.duration_minutes != null ? `${service.duration_minutes} min` : ""),
      duration_minutes: service?.duration_minutes ?? 60,
      price: service?.price ?? 0,
      travel_rate: service?.travel_rate ?? "",
      travel_members: service?.travel_members ?? "",
      car_rental_price: service?.car_rental_price ?? "",
      flight_price: service?.flight_price ?? "",
      sound_mode: sp.mode === "external_providers" ? "external_providers" : "artist_provides_variable",
      price_driving_sound: sp.price_driving_sound_zar ?? sp.flat_price_zar ?? "",
      price_flying_sound: sp.price_flying_sound_zar ?? "",
      sound_city_prefs: Array.isArray(sp.city_preferences) ? sp.city_preferences : [],
      tech: {
        ...emptyTechRider,
        ...existingTech,
        channels:
          Array.isArray(existingTech.channels) && existingTech.channels.length > 0
            ? existingTech.channels
            : emptyTechRider.channels,
      },
    };
  }, [service]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    trigger,
    control,
    formState: { errors, isSubmitting, isValid, touchedFields },
  } = useForm<ServiceFormData>({
    mode: "onChange",
    reValidateMode: "onChange",
    criteriaMode: "all",
    shouldUnregister: false,
    defaultValues: service ? editingDefaults : emptyDefaults,
  });

  // Channels field array
  const {
    fields: channelFields,
    append: appendChannel,
    remove: removeChannel,
    replace: replaceChannels,
  } = useFieldArray({
    control,
    name: "tech.channels",
  });

  // Ensure fields are registered
  useEffect(() => {
    register("service_type", { required: true });
    register("sound_mode");
  }, [register]);

  // Media state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(service?.media_url ?? null);
  const [publishing, setPublishing] = useState(false);
  const [, setServerError] = useState<string | null>(null);

  // Reset on open + ensure channels exist
  useEffect(() => {
    if (!isOpen) return;
    const dv = service ? editingDefaults : emptyDefaults;
    reset(dv);
    replaceChannels(dv.tech.channels || []);
    setMediaFiles([]);
    setExistingMediaUrl(service?.media_url ?? null);
    setMediaError(null);
    setStep(0);
    setMaxStep(0);
    // reasonable default collapsible states each time modal opens
    setInputsOpen(true);
    setMonitoringOpen(false);
    setStagePowerOpen(false);
    setFohOpen(false);
    setBacklineOpen(false);
    setProvidersOpen(true);
  }, [isOpen, service, reset, editingDefaults, replaceChannels]);

  // Watches
  const watchTitle = watch("title");
  const watchDescription = watch("description");
  const watchServiceType = watch("service_type");
  const watchSoundMode = watch("sound_mode");
  const tech = watch("tech");

  const thumbnails = useImageThumbnails(mediaFiles);

  useEffect(() => { setMaxStep((prev) => Math.max(prev, step)); }, [step]);

  const nextDisabled = () => {
    if (step === 0) return !watch("service_type");
    if (step === 1) return !isValid;
    if (step === 3)
      return ((!mediaFiles.some((f) => f.type.startsWith("image/")) && !existingMediaUrl) || !!mediaError);
    return false;
  };

  const next = async () => {
    if (step === 1) {
      const valid = await trigger(["title", "description", "duration_label", "price"]);
      if (!valid) return;
    }
    if (step === 3) {
      if (!mediaFiles.some((f) => f.type.startsWith("image/")) && !existingMediaUrl) {
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
    if (images.length !== files.length) setMediaError("Only image files are allowed.");
    else setMediaError(null);
    setMediaFiles((prev) => [...prev, ...images]);
    if (images.length === 0 && !mediaFiles.some((f) => f.type.startsWith("image/")) && !existingMediaUrl) {
      setMediaError("At least one image is required.");
    }
  };

  const removeFile = (i: number) => {
    setMediaFiles((prev) => {
      const updated = prev.filter((_, idx) => idx !== i);
      if (!updated.some((f) => f.type.startsWith("image/")) && !existingMediaUrl) {
        setMediaError("At least one image is required.");
      }
      return updated;
    });
  };

  const removeExistingMedia = () => {
    setExistingMediaUrl(null);
    if (!mediaFiles.some((f) => f.type.startsWith("image/"))) setMediaError("At least one image is required.");
  };

  // Load Sound Services for external selection
  const [soundServices, setSoundServices] = useState<Service[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await getAllServices();
        const services = (res.data || []).filter(
          (s) =>
            s.service_category_slug === "sound_service" ||
            ID_TO_UI_CATEGORY[(s as any).service_category_id || 0] === "sound_service",
        );
        if (!cancelled) setSoundServices(services);
      } catch {}
    }
    if (isOpen) load();
    return () => { cancelled = true; };
  }, [isOpen]);

  // City prefs helpers
  const addCityPref = () => {
    const cur = watch("sound_city_prefs") || [];
    setValue("sound_city_prefs", [...cur, { city: "", provider_ids: [] }], { shouldDirty: true });
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
    else if (set.size < 3) set.add(providerId);
    entry.provider_ids = Array.from(set);
    cur[idx] = entry;
    setValue("sound_city_prefs", cur, { shouldDirty: true });
  };

  // Submit
  const onSubmit: SubmitHandler<ServiceFormData> = async (data) => {
    setServerError(null);
    setPublishing(true);
    try {
      // Normalize duration label
      const rawLabel = (data.duration_label || "").toString().trim();
      const numberMatches = rawLabel.match(/\d+/g) || [];
      const firstNumber = numberMatches.length > 0 ? parseInt(numberMatches[0]!, 10) : Number(data.duration_minutes || 0) || 0;
      const normalizedLabel = (() => {
        if (numberMatches.length >= 2) {
          const a = parseInt(numberMatches[0]!, 10);
          const b = parseInt(numberMatches[1]!, 10);
          if (Number.isFinite(a) && Number.isFinite(b)) return `${a}\u2013${b} min`;
        }
        if (numberMatches.length === 1 && Number.isFinite(firstNumber)) return `${firstNumber} min`;
        return rawLabel || `${Number(data.duration_minutes || 60)} min`;
      })();

      const details: any = {
        ...(service?.details as any),
        duration_label: normalizedLabel,
        tech_rider: {
          ...data.tech,
          pdf_url: data.tech?.pdf_url || null,
        },
        sound_provisioning:
          data.service_type === "Live Performance"
            ? {
                mode: data.sound_mode,
                price_driving_sound_zar:
                  data.sound_mode === "artist_provides_variable"
                    ? numberOrUndefined(data.price_driving_sound)
                    : undefined,
                price_flying_sound_zar:
                  data.sound_mode === "artist_provides_variable"
                    ? numberOrUndefined(data.price_flying_sound)
                    : undefined,
                city_preferences:
                  data.sound_mode === "external_providers"
                    ? (data.sound_city_prefs || [])
                    : undefined,
              }
            : undefined,
      };

      const serviceData: any = {
        ...data,
        price: Number(data.price || 0),
        duration_minutes:
          Number.isFinite(firstNumber) && firstNumber > 0
            ? firstNumber
            : Number(data.duration_minutes || 0),
        service_category_slug: "musician",
        travel_rate: numberOrUndefined(data.travel_rate),
        travel_members: numberOrUndefined(data.travel_members),
        car_rental_price: numberOrUndefined(data.car_rental_price),
        flight_price: numberOrUndefined(data.flight_price),
        details,
      };

      // Media (first file → base64)
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

      // Upsert tech rider PDF (optional)
      try {
        if (data.tech?.pdf_url) {
          await upsertRider(res.data.id, { pdf_url: data.tech.pdf_url });
        }
      } catch {}

      onServiceSaved(res.data);
      reset(service ? editingDefaults : emptyDefaults);
      replaceChannels((service ? editingDefaults : emptyDefaults).tech.channels || []);
      setMediaFiles([]);
      setExistingMediaUrl(res.data.media_url ?? null);
      setStep(0);
      onClose();
    } catch (err: unknown) {
      console.error("Service save error:", err);
      const msg = err instanceof Error ? err.message : "An unexpected error occurred. Failed to save service.";
      setServerError(msg);
    } finally {
      setPublishing(false);
    }
  };

  const handleCancel = () => {
    reset(service ? editingDefaults : emptyDefaults);
    replaceChannels((service ? editingDefaults : emptyDefaults).tech.channels || []);
    setMediaFiles([]);
    setExistingMediaUrl(service?.media_url ?? null);
    setMediaError(null);
    setStep(0);
    setMaxStep(0);
    onClose();
  };

  const types: { value: Service["service_type"]; label: string }[] = [
    { value: "Live Performance", label: "Live Performance" },
    { value: "Personalized Video", label: "Personalized Video" },
    { value: "Custom Song", label: "Custom Song" },
    { value: "Other", label: "Other" },
  ];

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50" open={isOpen} onClose={handleCancel}>
        {/* Overlay */}
        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 z-40 bg-gray-500/75" aria-hidden="true" />
        </Transition.Child>

        {/* Modal content */}
        <div className="fixed inset-0 z-50 flex p-0">
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
            <Dialog.Panel as="div" className="pointer-events-auto relative flex h-full w-full max-w-none flex-col overflow-hidden rounded-none bg-white shadow-none md:flex-row">
              {/* Close */}
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
                  steps={steps}
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
              <div className="flex w-full flex-1 flex-col overflow-hidden md:w-4/5">
                <form id="add-service-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 space-y-4 overflow-y-scroll p-6">
                  <AnimatePresence mode="wait">
                    <motion.div key={step} initial="initial" animate="animate" exit="exit" variants={stepVariants} transition={stepVariants.transition}>
                      {/* Step 0: Type */}
                      {step === 0 && (
                        <div className="space-y-4">
                          <h2 className="text-xl font-semibold">Choose Your Service Category</h2>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {types.map(({ value, label }) => {
                              const Icon = serviceTypeIcons[value];
                              return (
                                <button
                                  type="button"
                                  key={value}
                                  data-value={value}
                                  onClick={() => setValue("service_type", value, { shouldDirty: true, shouldValidate: true })}
                                  className={clsx(
                                    "flex flex-col items-center justify-center rounded-xl border p-4 text-sm transition",
                                    watch("service_type") === value ? "border-2 border-[var(--brand-color)]" : "border-gray-200 hover:border-gray-300",
                                  )}
                                >
                                  {Icon && <Icon className="mb-1 h-6 w-6" />}
                                  <span className="text-sm font-medium text-gray-800">{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Step 1: Details */}
                      {step === 1 && (
                        <div className="space-y-4">
                          <h2 className="text-xl font-semibold">Service Details</h2>

                          <div className="space-y-2">
                            <TextInput
                              label="Service Title"
                              {...register("title", {
                                required: "Service title is required",
                                validate: (value) => {
                                  const len = value.trim().length;
                                  if (len < 5) return `Need ${5 - len} more characters`;
                                  if (len > 60) return `Remove ${len - 60} characters`;
                                  return true;
                                },
                              })}
                              error={errors.title?.message}
                            />
                            <p className="mt-1 text-right text-xs text-gray-500">{(watchTitle || "").length}/60</p>
                          </div>

                          <div className="space-y-2">
                            <TextArea
                              label="Description"
                              rows={4}
                              {...register("description", {
                                required: "Description is required",
                                validate: (value) => {
                                  const len = value.trim().length;
                                  if (len < 20) return `Need ${20 - len} more characters`;
                                  if (len > 500) return `Remove ${len - 500} characters`;
                                  return true;
                                },
                              })}
                              error={errors.description?.message}
                            />
                            <p className="mt-1 text-right text-xs text-gray-500">{(watchDescription || "").length}/500</p>
                          </div>

                          <TextInput
                            label="Duration (minutes or range)"
                            placeholder="e.g., 60-90 min or 45–60 min"
                            type="text"
                            {...register("duration_label", {
                              required: "Duration is required",
                              validate: (v) => /\d+/.test((v || "").toString().trim()) || "Enter a number or range (e.g., 60-90)",
                            })}
                            error={touchedFields?.duration_label ? (errors.duration_label?.message as string | undefined) : undefined}
                          />

                          <TextInput
                            label={`Base Price (${DEFAULT_CURRENCY})`}
                            type="number"
                            step="0.01"
                            {...register("price", {
                              required: "Price is required",
                              valueAsNumber: true,
                              min: { value: 0.01, message: "Price must be positive" },
                            })}
                            error={errors.price?.message}
                          />
                        </div>
                      )}

                      {/* Step 2: Sound & Tech */}
                      {step === 2 && (
                        <div className="space-y-6">
                          <h2 className="text-xl font-semibold">Sound & Tech</h2>

                          {/* Sound Provisioning (Live Performance only) */}
                          {watchServiceType === "Live Performance" && (
                            <div className="space-y-3 rounded-md border p-3">
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
                                      label={`Typical sound price when driving (${DEFAULT_CURRENCY})`}
                                      type="number"
                                      step="0.01"
                                      placeholder="e.g., 1500"
                                      {...register("price_driving_sound", { valueAsNumber: true })}
                                    />
                                    <TextInput
                                      label={`Typical sound price when flying (incl. hire) (${DEFAULT_CURRENCY})`}
                                      type="number"
                                      step="0.01"
                                      placeholder="e.g., 3000"
                                      {...register("price_flying_sound", { valueAsNumber: true })}
                                    />
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                                    <TextInput label="Travel rate (R/km)" type="number" step="0.1" {...register("travel_rate", { valueAsNumber: true })} />
                                    <TextInput label="Members travelling" type="number" step="1" {...register("travel_members", { valueAsNumber: true })} />
                                    <TextInput label="Car rental (typical)" type="number" step="0.01" {...register("car_rental_price", { valueAsNumber: true })} />
                                    <TextInput label="Return flight (pp)" type="number" step="0.01" {...register("flight_price", { valueAsNumber: true })} />
                                  </div>
                                  <p className="text-xs text-gray-600">These help us pre-estimate total costs before final venue details.</p>
                                </>
                              )}

                              {watchSoundMode === "external_providers" && (
                                <CollapsibleSection
                                  title="Preferred external providers per city"
                                  open={providersOpen}
                                  onToggle={() => setProvidersOpen((o) => !o)}
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
                                                  <option key={c} value={c}>{c}</option>
                                                ))}
                                              </select>
                                            </div>
                                            <button type="button" className="text-xs text-red-600" onClick={() => removeCityPref(idx)}>Remove</button>
                                          </div>
                                          <div className="mt-2 text-xs text-gray-600">Pick up to 3 providers. We’ll use 2 and 3 as backups.</div>
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
                                    <button type="button" className="text-sm text-brand" onClick={addCityPref}>+ Add city</button>
                                  </div>
                                </CollapsibleSection>
                              )}
                            </div>
                          )}

                          {/* Tech Rider Builder */}
                          <div className="space-y-4 rounded-md border p-3">
                            <h3 className="text-base font-semibold">Tech Rider Builder</h3>

                            {/* Lineup / FOH quick */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <TextInput label="Lineup label" placeholder="e.g., Solo / Duo / 4-piece band" {...register("tech.lineup_label")} />
                              <TextInput label="Minimum FOH channels" type="number" {...register("tech.foh.min_channels", { valueAsNumber: true })} />
                              <TextInput label="Console preference" placeholder="e.g., M32/X32/CL/SQ" {...register("tech.foh.console_preference")} />
                            </div>

                            {/* Inputs / Channels */}
                            <CollapsibleSection
                              title="Inputs / Channels"
                              open={inputsOpen}
                              onToggle={() => setInputsOpen((o) => !o)}
                              className="border"
                            >
                              <div className="mt-2">
                                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-600">
                                  <div className="col-span-1">Ch</div>
                                  <div className="col-span-3">Source</div>
                                  <div className="col-span-3">Mic preference</div>
                                  <div className="col-span-1 text-center">DI</div>
                                  <div className="col-span-1 text-center">48V</div>
                                  <div className="col-span-3">Notes</div>
                                </div>

                                <div className="mt-1 space-y-1">
                                  {channelFields.map((row, idx) => (
                                    <div key={row.id} className="grid grid-cols-12 items-center gap-2">
                                      <div className="col-span-1">
                                        <TextInput
                                          aria-label={`ch-${idx}`}
                                          type="number"
                                          value={String(watch(`tech.channels.${idx}.ch`) ?? idx + 1)}
                                          onChange={(e) =>
                                            setValue(`tech.channels.${idx}.ch`, Number(e.target.value || idx + 1), { shouldDirty: true })
                                          }
                                        />
                                      </div>

                                      <div className="col-span-3">
                                        <TextInput
                                          aria-label={`src-${idx}`}
                                          placeholder="Lead Vox / Guitar DI / Kick"
                                          value={watch(`tech.channels.${idx}.source`) || ""}
                                          onChange={(e) => setValue(`tech.channels.${idx}.source`, e.target.value, { shouldDirty: true })}
                                        />
                                      </div>

                                      <div className="col-span-3">
                                        <TextInput
                                          aria-label={`mic-${idx}`}
                                          placeholder="SM58 / e935 / Any dynamic"
                                          value={watch(`tech.channels.${idx}.mic`) || ""}
                                          onChange={(e) => setValue(`tech.channels.${idx}.mic`, e.target.value, { shouldDirty: true })}
                                        />
                                      </div>

                                      <div className="col-span-1 flex items-center justify-center">
                                        <input
                                          type="checkbox"
                                          checked={!!watch(`tech.channels.${idx}.di`)}
                                          onChange={(e) => setValue(`tech.channels.${idx}.di`, e.target.checked, { shouldDirty: true })}
                                        />
                                      </div>

                                      <div className="col-span-1 flex items-center justify-center">
                                        <input
                                          type="checkbox"
                                          checked={!!watch(`tech.channels.${idx}.phantom`)}
                                          onChange={(e) => setValue(`tech.channels.${idx}.phantom`, e.target.checked, { shouldDirty: true })}
                                        />
                                      </div>

                                      <div className="col-span-3">
                                        <TextInput
                                          aria-label={`notes-${idx}`}
                                          placeholder="Any quick note"
                                          value={watch(`tech.channels.${idx}.notes`) || ""}
                                          onChange={(e) => setValue(`tech.channels.${idx}.notes`, e.target.value, { shouldDirty: true })}
                                        />
                                      </div>

                                      <div className="col-span-12 -mt-1 flex justify-end">
                                        <button type="button" className="text-[11px] text-red-600" onClick={() => removeChannel(idx)}>
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {channelFields.length === 0 && (
                                  <div className="mt-2 text-xs text-gray-500">No inputs yet.</div>
                                )}

                                <div className="mt-2">
                                  <button
                                    type="button"
                                    className="text-sm text-brand"
                                    onClick={() =>
                                      appendChannel({
                                        ch: (watch("tech.channels")?.length || 0) + 1,
                                        source: "",
                                        mic: "",
                                        di: false,
                                        phantom: false,
                                        notes: "",
                                      })
                                    }
                                  >
                                    + Add channel
                                  </button>
                                </div>
                              </div>
                            </CollapsibleSection>

                            {/* Monitoring */}
                            <CollapsibleSection
                              title="Monitoring"
                              open={monitoringOpen}
                              onToggle={() => setMonitoringOpen((o) => !o)}
                              className="border"
                            >
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                                <TextInput label="Monitor mixes needed" type="number" {...register("tech.monitoring.mixes", { valueAsNumber: true })} />
                                <div className="flex items-end gap-2">
                                  <ToggleSwitch checked={!!watch("tech.monitoring.wedges_ok")} onChange={(v) => setValue("tech.monitoring.wedges_ok", v, { shouldDirty: true })} label="Wedges OK" />
                                </div>
                                <div className="flex items-end gap-2">
                                  <ToggleSwitch checked={!!watch("tech.monitoring.iem_ok")} onChange={(v) => setValue("tech.monitoring.iem_ok", v, { shouldDirty: true })} label="IEMs OK" />
                                </div>
                                <div className="flex items-end gap-2">
                                  <ToggleSwitch checked={!!watch("tech.monitoring.talkback_required")} onChange={(v) => setValue("tech.monitoring.talkback_required", v, { shouldDirty: true })} label="Talkback required" />
                                </div>
                              </div>
                            </CollapsibleSection>

                            {/* Stage & Power */}
                            <CollapsibleSection
                              title="Stage & Power"
                              open={stagePowerOpen}
                              onToggle={() => setStagePowerOpen((o) => !o)}
                              className="border"
                            >
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                                <TextInput label="Min stage width (m)" type="number" step="0.1" {...register("tech.stage.min_width_m", { valueAsNumber: true })} />
                                <TextInput label="Min stage depth (m)" type="number" step="0.1" {...register("tech.stage.min_depth_m", { valueAsNumber: true })} />
                                <div className="flex items-end gap-2">
                                  <ToggleSwitch checked={!!watch("tech.stage.cover_required")} onChange={(v) => setValue("tech.stage.cover_required", v, { shouldDirty: true })} label="Cover required (outdoor)" />
                                </div>
                                <TextInput label="Stage plot image URL (optional)" placeholder="https://…/stageplot.png" {...register("tech.stage.stage_plot_url")} />
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700">Power phase</label>
                                  <div className="mt-1 flex gap-2 text-sm">
                                    {[
                                      { v: "single", l: "Single" },
                                      { v: "three", l: "Three" },
                                    ].map((o) => (
                                      <RadioPill
                                        key={o.v}
                                        name="power_phase"
                                        value={o.v}
                                        current={watch("tech.power.phase")}
                                        onChange={(v) => setValue("tech.power.phase", v as PowerPhase, { shouldDirty: true })}
                                        label={o.l}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <TextInput label="Amps required" type="number" {...register("tech.power.amps", { valueAsNumber: true })} />
                                <TextInput label="Independent circuits" type="number" {...register("tech.power.circuits_needed", { valueAsNumber: true })} />
                                <TextInput label="Distro notes" placeholder="Power distro / tie-in notes" {...register("tech.power.distro_notes")} />
                              </div>
                            </CollapsibleSection>

                            {/* FOH & Playback */}
                            <CollapsibleSection
                              title="FOH & Playback"
                              open={fohOpen}
                              onToggle={() => setFohOpen((o) => !o)}
                              className="border"
                            >
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <TextInput label="FX requirements" placeholder="e.g., 2x reverb, 1x delay" {...register("tech.foh.fx_requirements")} />
                                <TextInput label="Playback sources" placeholder="Laptop TRS / 3.5mm / USB" {...register("tech.foh.playback_sources")} />
                                <TextInput label="Patch / advance notes" placeholder="Any notes for venue or sound co." {...register("tech.patch_advance_notes")} />
                              </div>
                            </CollapsibleSection>

                            {/* Backline */}
                            <CollapsibleSection
                              title="Backline"
                              open={backlineOpen}
                              onToggle={() => setBacklineOpen((o) => !o)}
                              className="border"
                            >
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <TextArea
                                  label="Required items (one per line)"
                                  rows={3}
                                  value={(watch("tech.backline.required_items") || []).join("\n")}
                                  onChange={(e) =>
                                    setValue(
                                      "tech.backline.required_items",
                                      e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                                      { shouldDirty: true },
                                    )
                                  }
                                />
                                <TextArea
                                  label="Optional items (one per line)"
                                  rows={3}
                                  value={(watch("tech.backline.optional_items") || []).join("\n")}
                                  onChange={(e) =>
                                    setValue(
                                      "tech.backline.optional_items",
                                      e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                                      { shouldDirty: true },
                                    )
                                  }
                                />
                              </div>
                              <TextArea label="Backline notes" rows={2} {...register("tech.backline.notes")} />
                            </CollapsibleSection>

                            {/* Rider PDF (optional) */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <TextInput label="Tech rider PDF URL (optional)" placeholder="https://.../tech-rider.pdf" {...register("tech.pdf_url")} />
                              <div className="flex items-end">
                                <p className="text-xs text-gray-600">
                                  If provided, we’ll store it and show it to clients/venues in Event Prep.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Step 3: Media */}
                      {step === 3 && (
                        <div className="space-y-4">
                          <h2 className="mb-2 text-xl font-semibold">Upload Media</h2>
                          <p className="mb-2 text-sm text-gray-600">Use high-resolution images or short clips to showcase your talent.</p>
                          <label
                            htmlFor="media-upload"
                            className="flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 text-center"
                          >
                            <p className="text-sm">Drag files here or click to upload</p>
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
                          {mediaError && <p className="mt-2 text-sm text-red-600">{mediaError}</p>}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {existingMediaUrl && (
                              <div className="relative h-20 w-20 overflow-hidden rounded border">
                                <Image src={existingMediaUrl} alt="existing-media" width={80} height={80} className="h-full w-full object-cover" unoptimized />
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
                              <div key={i} className="relative h-20 w-20 overflow-hidden rounded border">
                                <Image src={src} alt={`media-${i}`} width={80} height={80} className="h-full w-full object-cover" unoptimized />
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

                      {/* Step 4: Review */}
                      {step === 4 && (
                        <div className="space-y-4">
                          <h2 className="text-xl font-semibold">Review Your Service</h2>
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
                              <p>{(watch("duration_label") as string) || `${watch("duration_minutes") || 0} min`}</p>
                            </div>
                            <div className="rounded-md border p-2">
                              <h3 className="font-medium">Price</h3>
                              <p>{watch("price") || 0}</p>
                            </div>
                            {watchServiceType === "Live Performance" && (
                              <>
                                <div className="rounded-md border p-2">
                                  <h3 className="font-medium">Sound mode</h3>
                                  <p>{watchSoundMode}</p>
                                </div>
                                {watchSoundMode === "artist_provides_variable" ? (
                                  <>
                                    <div className="rounded-md border p-2">
                                      <h3 className="font-medium">Sound (driving)</h3>
                                      <p>{watch("price_driving_sound") || 0}</p>
                                    </div>
                                    <div className="rounded-md border p-2">
                                      <h3 className="font-medium">Sound (flying incl. hire)</h3>
                                      <p>{watch("price_flying_sound") || 0}</p>
                                    </div>
                                    <div className="rounded-md border p-2">
                                      <h3 className="font-medium">Travel</h3>
                                      <p>
                                        Rate {watch("travel_rate") || 0} R/km · Members {watch("travel_members") || 1} · Car {watch("car_rental_price") || 0} · Flight {watch("flight_price") || 0}
                                      </p>
                                    </div>
                                  </>
                                ) : (
                                  <div className="rounded-md border p-2">
                                    <h3 className="font-medium">External providers</h3>
                                    <ul className="mt-1 list-disc pl-4">
                                      {(watch("sound_city_prefs") || []).map((r, i) => (
                                        <li key={i}>{r.city || "City?"}: {(r.provider_ids || []).length} provider(s)</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Tech rider summary */}
                          <div className="rounded-md border p-2 text-sm">
                            <h3 className="font-medium">Tech Rider Summary</h3>
                            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div>
                                <div className="text-xs text-gray-600">Lineup</div>
                                <div>{tech?.lineup_label || "—"}</div>
                                <div className="mt-1 text-xs text-gray-600">FOH</div>
                                <div>Min channels: {tech?.foh?.min_channels || "—"}</div>
                                <div>Console pref: {tech?.foh?.console_preference || "—"}</div>
                                <div>FX: {tech?.foh?.fx_requirements || "—"}</div>
                                <div>Playback: {tech?.foh?.playback_sources || "—"}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-600">Monitoring</div>
                                <div>
                                  Mixes {tech?.monitoring?.mixes || 0} · Wedges {tech?.monitoring?.wedges_ok ? "OK" : "No"} · IEM {tech?.monitoring?.iem_ok ? "OK" : "No"} · Talkback {tech?.monitoring?.talkback_required ? "Yes" : "No"}
                                </div>
                                <div className="mt-1 text-xs text-gray-600">Stage & Power</div>
                                <div>
                                  {Number(tech?.stage?.min_width_m || 0) > 0 || Number(tech?.stage?.min_depth_m || 0) > 0
                                    ? `Stage ≥ ${tech?.stage?.min_width_m || "?"}m x ${tech?.stage?.min_depth_m || "?"}m`
                                    : "—"}
                                  {tech?.stage?.cover_required ? " · Cover required" : ""}
                                </div>
                                <div>
                                  Power: {tech?.power?.phase || "single"} · {tech?.power?.amps || "—"}A · Circuits {tech?.power?.circuits_needed || "—"}
                                </div>
                              </div>
                            </div>

                            <div className="mt-2">
                              <div className="text-xs text-gray-600">Inputs ({tech?.channels?.length || 0})</div>
                              <div className="mt-1 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-xs">
                                {(tech?.channels || []).map((c, i) => (
                                  <div key={i}>
                                    {c.ch}. {c.source || "—"}{c.mic ? ` · Mic: ${c.mic}` : ""}{c.di ? " · DI" : ""}{c.phantom ? " · +48V" : ""}{c.notes ? ` · ${c.notes}` : ""}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {(tech?.backline?.required_items || []).length > 0 && (
                              <div className="mt-2">
                                <div className="text-xs text-gray-600">Backline required</div>
                                <ul className="list-disc pl-4">
                                  {(tech?.backline?.required_items || []).map((b, i) => <li key={i}>{b}</li>)}
                                </ul>
                              </div>
                            )}
                            {tech?.pdf_url && (
                              <div className="mt-2 text-xs">PDF: {tech.pdf_url}</div>
                            )}
                          </div>

                          {/* Images */}
                          {mediaFiles.length > 0 && (
                            <div className="rounded-md border p-2">
                              <h3 className="text-sm font-medium">Images</h3>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {thumbnails.map((src: string, i: number) => (
                                  <Image key={i} src={src} alt={`media-${i}`} width={64} height={64} className="h-16 w-16 rounded object-cover" unoptimized />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </form>

                {/* Action buttons */}
                <div className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-gray-100 p-4 sm:flex-row sm:justify-between">
                  <Button variant="outline" onClick={step === 0 ? handleCancel : prev} data-testid="back" className="min-h-[40px] w-full sm:w-auto">
                    {step === 0 ? "Cancel" : "Back"}
                  </Button>
                  {step < steps.length - 1 && (
                    <Button onClick={next} disabled={nextDisabled()} data-testid="next" className="min-h-[40px] w-full sm:w-auto">
                      Next
                    </Button>
                  )}
                  {step === steps.length - 1 && (
                    <Button type="submit" form="add-service-form" disabled={publishing || isSubmitting || nextDisabled()} isLoading={publishing || isSubmitting} className="min-h-[40px] w-full sm:w-auto">
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

// ────────────────────────────────────────────────────────────────────────────────
// Small UI helpers
function RadioPill({
  name,
  value,
  current,
  onChange,
  label,
}: { name: string; value: string; current: string; onChange: (v: string) => void; label: string }) {
  const active = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onChange(value)}
      className={`rounded-full border px-3 py-1 text-xs ${active ? "border-[var(--brand-color)]" : "border-gray-200 hover:border-gray-300"}`}
    >
      {label}
    </button>
  );
}

function numberOrUndefined(v: number | string | undefined | null | ""): number | undefined {
  if (v === "" || v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

"use client";

import { useForm, type SubmitHandler } from "react-hook-form";
import { useState, useRef, useEffect, Fragment } from "react";
import {
  MusicalNoteIcon,
  VideoCameraIcon,
  SparklesIcon,
  SquaresPlusIcon,
  XMarkIcon, // Added XMarkIcon
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
} from "@/lib/api";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import Button from "../ui/Button";
import { Stepper, TextInput, TextArea, ToggleSwitch } from "../ui";

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
}

export default function AddServiceModal({
  isOpen,
  onClose,
  onServiceSaved,
  service,
}: AddServiceModalProps) {
  const steps = ["Type", "Details", "Media", "Review"];
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);

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
  };

  const editingDefaults: ServiceFormData = {
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
  };

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
    }
  }, [isOpen, service, reset, editingDefaults, emptyDefaults]);

  const watchTitle = watch("title");
  const watchDescription = watch("description");
  const watchServiceType = watch("service_type");

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
      const valid = await trigger(["title", "description", "duration_minutes", "price"]);
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
      const serviceData = {
        ...data,
        price: Number(data.price || 0),
        duration_minutes: Number(data.duration_minutes || 0),
        travel_rate: data.travel_rate ? Number(data.travel_rate) : undefined,
        travel_members: data.travel_members
          ? Number(data.travel_members)
          : undefined,
        car_rental_price: data.car_rental_price
          ? Number(data.car_rental_price)
          : undefined,
        flight_price: data.flight_price
          ? Number(data.flight_price)
          : undefined,
      };
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

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50" onClose={handleCancel}>
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
          <div className="fixed inset-0 bg-gray-500/75 z-40" aria-hidden="true" />
        </Transition.Child>

        {/* Modal content container: occupy full screen without padding */}
        <div className="fixed inset-0 flex p-0 z-50">
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
              className="pointer-events-auto relative w-full h-full max-w-none rounded-none shadow-none bg-white flex flex-col md:flex-row overflow-hidden"
            >
              {/* Close button for web and mobile */}
              <button
                type="button"
                onClick={handleCancel}
                className="absolute top-4 right-4 z-10 p-2 rounded-md text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <XMarkIcon className="h-5 w-5 pointer-events-none" />
              </button>

              {/* Left Pane (Steps) */}
              <div className="flex-none w-full md:w-1/5 p-6 bg-gray-50 flex flex-col justify-between overflow-y-auto">
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
              <div className="flex-1 w-full md:w-3/5 flex flex-col overflow-hidden">
                <form
                  id="add-service-form"
                  onSubmit={handleSubmit(onSubmit)}
                  className="flex-1 overflow-y-scroll p-6 space-y-4"
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {types.map(({ value, label }) => {
                              const Icon = serviceTypeIcons[value];
                              return (
                                <button
                                  type="button"
                                  key={value}
                                  data-value={value}
                                  onClick={() => setValue("service_type", value)}
                                  className={clsx(
                                    "flex flex-col items-center justify-center p-4 rounded-xl transition border text-sm",
                                    watch("service_type") === value
                                      ? "border-2 border-[var(--brand-color)]"
                                      : "border-gray-200 hover:border-gray-300",
                                  )}
                                >
                                  {Icon && <Icon className="h-6 w-6 mb-1" />}
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
                            <p className="mt-1 text-xs text-right text-gray-500">
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
                            <p className="mt-1 text-xs text-right text-gray-500">
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
                              min: { value: 0.01, message: "Price must be positive" },
                            })}
                            error={errors.price?.message}
                          />
                          {watchServiceType === "Live Performance" && (
                            <div className="space-y-2">
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
                          <h2 className="text-xl font-semibold mb-2">
                            Upload Media
                          </h2>
                          <p className="text-sm text-gray-600 mb-2">
                            Use high-resolution images or short video clips to showcase your talent.
                          </p>
                          <label
                            htmlFor="media-upload"
                            className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer w-full min-h-40 flex flex-col items-center justify-center"
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
                            <p className="text-sm text-red-600 mt-2">
                              {mediaError}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {existingMediaUrl && (
                              <div className="relative w-20 h-20 border rounded overflow-hidden">
                                <Image
                                  src={existingMediaUrl}
                                  alt="existing-media"
                                  width={80}
                                  height={80}
                                  className="object-cover w-full h-full"
                                />
                                <button
                                  type="button"
                                  onClick={removeExistingMedia}
                                  className="absolute top-0 right-0 bg-black/50 text-white rounded-full w-4 h-4 text-xs"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                            {thumbnails.map((src: string, i: number) => (
                              <div
                                key={i}
                                className="relative w-20 h-20 border rounded overflow-hidden"
                              >
                                <Image
                                  src={src}
                                  alt={`media-${i}`}
                                  width={80}
                                  height={80}
                                  className="object-cover w-full h-full"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeFile(i)}
                                  className="absolute top-0 right-0 bg-black/50 text-white rounded-full w-4 h-4 text-xs"
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            <div className="border rounded-md p-2">
                              <h3 className="font-medium">Type</h3>
                              <p>{watch("service_type")}</p>
                            </div>
                            <div className="border rounded-md p-2">
                              <h3 className="font-medium">Title</h3>
                              <p>{watch("title")}</p>
                            </div>
                            <div className="border rounded-md p-2">
                              <h3 className="font-medium">Description</h3>
                              <p>{watch("description")}</p>
                            </div>
                            <div className="border rounded-md p-2">
                              <h3 className="font-medium">Duration</h3>
                              <p>{watch("duration_minutes") || 0} minutes</p>
                            </div>
                            <div className="border rounded-md p-2">
                              <h3 className="font-medium">Price</h3>
                              <p>{watch("price") || 0}</p>
                            </div>
                            {watchServiceType === "Live Performance" && (
                              <>
                                <div className="border rounded-md p-2">
                                  <h3 className="font-medium">
                                    Travelling (Rand per km)
                                  </h3>
                                  <p>{watch("travel_rate") || 0}</p>
                                </div>
                                <div className="border rounded-md p-2">
                                  <h3 className="font-medium">
                                    Members travelling
                                  </h3>
                                  <p>{watch("travel_members") || 1}</p>
                                </div>
                                <div className="border rounded-md p-2">
                                  <h3 className="font-medium">
                                    Car rental price
                                  </h3>
                                  <p>{watch("car_rental_price") || 0}</p>
                                </div>
                                <div className="border rounded-md p-2">
                                  <h3 className="font-medium">
                                    Return flight price (per person)
                                  </h3>
                                  <p>{watch("flight_price") || 0}</p>
                                </div>
                              </>
                            )}
                            {mediaFiles.length > 0 && (
                              <div className="border rounded-md p-2 col-span-full">
                                <h3 className="font-medium">Images</h3>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {thumbnails.map((src: string, i: number) => (
                                    <Image
                                      key={i}
                                      src={src}
                                      alt={`media-${i}`}
                                      width={64}
                                      height={64}
                                      className="w-16 h-16 object-cover rounded"
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
                <div className="flex-shrink-0 border-t border-gray-100 p-4 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
                  <Button
                    variant="outline"
                    onClick={step === 0 ? handleCancel : prev}
                    data-testid="back"
                    className="w-full sm:w-auto min-h-[40px]"
                  >
                    {step === 0 ? "Cancel" : "Back"}
                  </Button>
                  {step < steps.length - 1 && (
                    <Button
                      onClick={next}
                      disabled={nextDisabled()}
                      data-testid="next"
                      className="w-full sm:w-auto min-h-[40px]"
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
                      className="w-full sm:w-auto min-h-[40px]"
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
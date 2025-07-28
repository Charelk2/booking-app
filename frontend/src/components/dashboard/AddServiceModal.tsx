"use client";

import { useForm, type SubmitHandler } from "react-hook-form";
import { useState, useRef, useEffect, Fragment } from "react";
import {
  MusicalNoteIcon,
  VideoCameraIcon,
  SparklesIcon,
  SquaresPlusIcon,
} from "@heroicons/react/24/outline";
import type { ElementType } from "react";
import clsx from "clsx";
import { Dialog, Transition } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion"; // Import motion and AnimatePresence

import type { Service } from "@/types";
import {
  createService as apiCreateService,
  getDashboardStats,
} from "@/lib/api";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import Button from "../ui/Button";
import { Stepper, TextInput, TextArea, ToggleSwitch } from "../ui";
import useIsMobile from "@/hooks/useIsMobile";

const serviceTypeIcons: Record<Service["service_type"], ElementType> = {
  "Live Performance": MusicalNoteIcon,
  "Virtual Appearance": VideoCameraIcon, // Ensure this matches your Service type definition precisely
  "Personalized Video": VideoCameraIcon,
  "Custom Song": SparklesIcon,
  Other: SquaresPlusIcon,
};

// This class will now primarily control internal spacing of step content,
// as the outer modal panel will handle the background, shadow, and rounded corners.
const stepContentInternalClasses = "space-y-6";

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
  // FIX: Explicitly use a cubic-bezier array for ease to satisfy Framer Motion's TypeScript types.
  // Framer Motion's `ease` property can accept an array of four numbers for a cubic-bezier function.
  transition: { duration: 0.3, ease: [0.42, 0, 0.58, 1] as const }, // Added `as const` to correctly type the tuple
};


interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServiceAdded: (newService: Service) => void;
}

interface PackageData {
  name: string;
  price: string;
}

interface ServiceFormData {
  service_type: Service["service_type"] | undefined;
  title: string;
  description: string;
  duration_minutes: number | "";
  is_remote: boolean;
}

export default function AddServiceModal({ isOpen, onClose, onServiceAdded }: AddServiceModalProps) {
  const steps = [
    "Type",
    "Details",
    "Media",
    "Packages",
    "Review",
  ];
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
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
    defaultValues: {
      service_type: undefined,
      title: "",
      description: "",
      duration_minutes: 60,
      is_remote: false,
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]),
    [mediaError, setMediaError] = useState<string | null>(null);
  const [packages, setPackages] = useState<PackageData[]>([{ name: "", price: "" }]);
  const [packageErrors, setPackageErrors] = useState<{ name?: string; price?: string }[]>([{}]);
  const [publishing, setPublishing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ monthly_new_inquiries: number }>();

  const watchTitle = watch("title");
  const watchDescription = watch("description");
  const isMobile = useIsMobile();

  // Optimized image thumbnails from uploaded files
  const thumbnails = useImageThumbnails(mediaFiles);

  useEffect(() => {
    setMaxStep((prev) => Math.max(prev, step));
  }, [step]);

  useEffect(() => {
    if (step === 3 && !stats) {
      getDashboardStats()
        .then((res) => setStats(res.data))
        .catch(() => {});
    }
  }, [step, stats]);

  const nextDisabled = () => {
    if (step === 0) return !watch("service_type");
    if (step === 1) return !isValid;
    if (step === 2) return !mediaFiles.some((f) => f.type.startsWith("image/")) || !!mediaError;
    if (step === 3) return packages.some((p) => !p.name.trim() || Number(p.price) <= 0);
    return false;
  };

  const validatePackages = () => {
    const errs = packages.map((p) => ({
      name: p.name.trim() ? undefined : "Name is required",
      price: Number(p.price) > 0 ? undefined : "Price must be positive",
    }));
    setPackageErrors(errs);
    return errs.every((e) => !e.name && !e.price);
  };

  const next = async () => {
    if (step === 1) {
      const valid = await trigger(["title", "description", "duration_minutes"]);
      if (!valid) return;
    }
    if (step === 2) {
      if (!mediaFiles.some((f) => f.type.startsWith("image/"))) {
        setMediaError("At least one image is required.");
        return;
      }
    }
    if (step === 3 && !validatePackages()) return;
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
      !mediaFiles.some((f) => f.type.startsWith("image/"))
    ) {
      setMediaError("At least one image is required.");
    }
  };

  const removeFile = (i: number) => {
    setMediaFiles((prev) => {
      const updated = prev.filter((_, idx) => idx !== i);
      if (!updated.some((f) => f.type.startsWith("image/"))) {
        setMediaError("At least one image is required.");
      }
      return updated;
    });
  };

  const addPackage = () => {
    setPackages((prev) => [...prev, { name: "", price: "" }].slice(0, 3));
    setPackageErrors((prev) => [...prev, {}].slice(0, 3));
  };

  const updatePackage = (
    i: number,
    field: keyof PackageData,
    value: string,
  ) => {
    setPackages((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)),
    );
    setPackageErrors((prev) => {
      const newErrs = [...prev];
      if (field === "name") {
        newErrs[i] = {
          ...newErrs[i],
          name: value.trim() ? undefined : "Name is required",
        };
      } else {
        const num = Number(value);
        newErrs[i] = {
          ...newErrs[i],
          price: num > 0 ? undefined : "Price must be positive",
        };
      }
      return newErrs;
    });
  };

  const onSubmit: SubmitHandler<ServiceFormData> = async (data) => {
    setServerError(null);
    setPublishing(true);
    try {
      const price = packages.length > 0 ? parseFloat(packages[0].price || "0") : 0;
      
      const serviceData = {
        ...data,
        price,
        duration_minutes: Number(data.duration_minutes || 0),
      };
      const res = await apiCreateService(serviceData);
      onServiceAdded(res.data);
      reset();
      setMediaFiles([]);
      setPackages([{ name: "", price: "" }]);
      setPackageErrors([{}]);
      setStep(0);
      onClose();
    } catch (err: unknown) {
      console.error("Service creation error:", err);
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Failed to create service.";
      setServerError(msg);
    } finally {
      setPublishing(false);
    }
  };

  const handleCancel = () => {
    reset();
    setMediaFiles([]);
    setPackages([{ name: "", price: "" }]);
    setPackageErrors([{}]);
    setStep(0);
    onClose();
  };

  if (!isOpen) return null;

  const types: { value: Service["service_type"]; label: string }[] = [
    { value: "Live Performance", label: "Live Performance" },
    { value: "Virtual Appearance", label: "Virtual Appearance" },
    { value: "Personalized Video", label: "Personalized Video" },
    { value: "Custom Song", label: "Custom Song" },
    { value: "Other", label: "Other" },
  ];

  const earnings =
    stats && packages[0].price
      ? stats.monthly_new_inquiries * parseFloat(packages[0].price)
      : null;

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50" onClose={handleCancel}>
        {/* Overlay Transition.Child */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Dialog.Overlay className="fixed inset-0 bg-gray-500/75 z-40" />
        </Transition.Child>

        {/* Content Container (to center modal) */}
        <div className="fixed inset-0 flex items-center justify-center p-0 sm:p-4 z-[41]">
          {/* Dialog Panel Transition.Child */}
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            {/* Main Dialog Panel. This is the fixed-size modal card. */}
            {/* w-full max-w-3xl is from your original working code for desktop width. */}
            {/* max-h-[90vh] sets max height for responsiveness. */}
            {/* flex flex-col overflow-hidden for internal layout and containment. */}
<Dialog.Panel
  as="div"
  className="pointer-events-auto w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl bg-white z-50 flex flex-col overflow-hidden"
>
              {/* Stepper (horizontal for all screen sizes in this context) */}
              {/* flex-shrink-0 to keep it at top, not scroll */}
              <Stepper
                  steps={steps.slice(0, 4)} // Stepper only goes up to 'Packages' (step 0-3)
                  currentStep={step}
                  maxStepCompleted={maxStep}
                  onStepClick={setStep}
                  ariaLabel="Add service progress"
                  className="px-6 py-4 border-b border-gray-100 flex-shrink-0" // flex-shrink-0 to keep it at top, not scroll
                  orientation="horizontal" // Always horizontal in this fixed modal variant
                  noCircles={true} // No circles as per booking wizard
              />

              {/* Main Scrollable Content Area. This is the part that will scroll. */}
              {/* flex-1 allows this section to grow and take remaining vertical space. */}
              {/* overflow-y-scroll ensures scrollbar is always present for consistent layout. */}
              <form
                id="add-service-form"
                onSubmit={handleSubmit(onSubmit)}
                className="flex-1 overflow-y-scroll p-6 space-y-6" // p-6 for padding, space-y-6 for content spacing
              >
                {/* Wrap step content in AnimatePresence and motion.div for transitions */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step} // Key is crucial for AnimatePresence to detect step changes
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={stepVariants}
                    transition={stepVariants.transition}
                    // min-h-[400px] is an example. Adjust as needed if content is too short for animation to look right.
                  >
                    {step === 0 && (
                      <div className="space-y-6"> {/* Using space-y-6 directly */}
                        <h2 className="text-xl font-semibold">Choose Your Service Category</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> {/* Mobile friendly grid */}
                          {types.map(({ value, label }) => {
                            const Icon = serviceTypeIcons[value];
                            return (
                              <button
                                type="button"
                                key={value}
                                data-value={value}
                                onClick={() => setValue("service_type", value)}
                                className={clsx(
                                  "flex flex-col items-center justify-center p-6 rounded-2xl shadow-md transition border",
                                  watch("service_type") === value
                                    ? "border-2 border-[var(--brand-color)]"
                                    : "border-gray-200",
                                )}
                              >
                                {Icon && <Icon className="h-8 w-8 mb-2" />}
                                <span className="text-base font-medium text-gray-800">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Step 1: Service Details */}
                    {step === 1 && (
                      <div className="space-y-6"> {/* Using space-y-6 directly */}
                        <h2 className="text-xl font-semibold">Service Details</h2>
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
                        <p className="text-xs text-right text-gray-500">{(watchTitle || "").length}/60</p>

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
                        <p className="text-xs text-right text-gray-500">{(watchDescription || "").length}/500</p>

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
                        <div className="flex items-center gap-2">
                          <ToggleSwitch
                            checked={watch("is_remote")}
                            onChange={(v) => setValue("is_remote", v)}
                            label="Remote"
                          />
                        </div>
                      </div>
                    )}

                    {/* Step 2: Upload Media */}
                    {step === 2 && (
                      <div className="space-y-6"> {/* Using space-y-6 directly */}
                        <h2 className="text-xl font-semibold mb-4">Upload Media</h2>
                        <p className="text-sm text-gray-600 mb-2">
                          Use high-resolution images or short video clips (at least
                          1920×1080) to showcase your talent.
                        </p>
                        <label htmlFor="media-upload" className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer w-full min-h-52 flex flex-col items-center justify-center">
                          <p>Drag files here or click to upload</p>
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
                        {mediaError && <p className="text-sm text-red-600">{mediaError}</p>}
                        <div className="flex flex-wrap gap-3 mt-4">
                          {/* Use thumbnails from useImageThumbnails hook */}
                          {thumbnails.map((src: string, i: number) => (
                            <div key={i} className="relative w-24 h-24 border rounded overflow-hidden">
                              <img src={src} alt={`media-${i}`} className="object-cover w-full h-full" />
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
                        <p className="mt-4 text-sm text-gray-500">
                          Use at least 5 high-res photos (1024×683px) and a short
                          video demo.
                        </p>
                      </div>
                    )}

                    {/* Step 3: Packages & Pricing */}
                    {step === 3 && (
                      <div className="space-y-6"> {/* Using space-y-6 directly */}
                        <h2 className="text-xl font-semibold">Packages & Pricing</h2>
                        {packages.map((pkg, i) => (
                          <div key={i} className="border rounded-md p-4 space-y-2">
                            <TextInput
                              label="Name"
                              value={pkg.name}
                              onChange={(e) => updatePackage(i, "name", e.target.value)}
                              name={`packages.${i}.name`}
                              error={packageErrors?.[i]?.name}
                            />
                            <TextInput
                              label={`Price (${DEFAULT_CURRENCY})`}
                              type="number"
                              step="0.01"
                              value={pkg.price}
                              onChange={(e) => updatePackage(i, "price", e.target.value)}
                              name={`packages.${i}.price`}
                              error={packageErrors?.[i]?.price}
                            />
                          </div>
                        ))}
                        {packages.length < 3 && (
                          <Button type="button" variant="secondary" onClick={addPackage}>
                            + Add Another Package
                          </Button>
                        )}
                        {earnings !== null && (
                          <p className="text-sm text-gray-600">
                            Estimated monthly earnings{" "}
                            {Intl.NumberFormat("en-ZA", {
                              style: "currency",
                              currency: DEFAULT_CURRENCY,
                            }).format(earnings)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Step 4: Review Your Service */}
                    {step === 4 && (
                      <div className="space-y-6"> {/* Using space-y-6 directly */}
                        <h2 className="text-xl font-semibold">Review Your Service</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="border rounded-md p-4">
                            <h3 className="font-medium">Type</h3>
                            <p>{watch("service_type")}</p>
                          </div>
                          <div className="border rounded-md p-4">
                            <h3 className="font-medium">Title</h3>
                            <p>{watch("title")}</p>
                          </div>
                          <div className="border rounded-md p-4">
                            <h3 className="font-medium">Description</h3>
                            <p>{watch("description")}</p>
                          </div>
                          <div className="border rounded-md p-4">
                            <h3 className="font-medium">Duration</h3>
                            <p>{watch("duration_minutes") || 0} minutes</p>
                          </div>
                          <div className="border rounded-md p-4 col-span-full">
                            <h3 className="font-medium">Packages</h3>
                            {packages.map((p, idx) => (
                              <p key={idx}>{p.name}: {p.price}</p>
                            ))}
                          </div>
                          {mediaFiles.length > 0 && ( // Simplified condition
                            <div className="border rounded-md p-4 col-span-full">
                              <h3 className="font-medium">Images</h3>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {/* Use thumbnails from useImageThumbnails hook */}
                                {thumbnails.map((src: string, i: number) => (
                                  <img key={i} src={src} alt={`media-${i}`} className="w-20 h-20 object-cover rounded" />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div> // <--- This div was missing its closing tag
                    )}
                  </motion.div> {/* <--- This motion.div was missing its closing tag */}
                </AnimatePresence>
              </form>{/* End of main form content area scrollable div */}

              {/* Action buttons at the bottom of the modal, always visible */}
              <div className="flex-shrink-0 border-t border-gray-100 p-6 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
                <Button
                  variant="outline"
                  onClick={step === 0 ? handleCancel : prev}
                  data-testid="back"
                  className="w-full sm:w-auto min-h-[44px]"
                >
                  {step === 0 ? "Cancel" : "Back"}
                </Button>
                {step < steps.length - 1 && (
                  <Button
                    onClick={next}
                    disabled={nextDisabled()}
                    data-testid="next"
                    className="w-full sm:w-auto min-h-[44px]"
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
                    className="w-full sm:w-auto min-h-[44px]"
                  >
                    Publish
                  </Button>
                )}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
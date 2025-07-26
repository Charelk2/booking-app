"use client";

import { useForm, type SubmitHandler } from "react-hook-form";
import { useState, useRef, useEffect, Fragment } from "react";
import {
  MusicalNoteIcon,
  VideoCameraIcon,
  SparklesIcon,
  SquaresPlusIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { Service } from "@/types";
import {
  createService as apiCreateService,
  getDashboardStats,
} from "@/lib/api";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { Dialog, Transition } from "@headlessui/react";
import Button from "../ui/Button";
import { Stepper, TextInput, TextArea, ToggleSwitch } from "../ui";

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

export default function AddServiceModal({
  isOpen,
  onClose,
  onServiceAdded,
}: AddServiceModalProps) {
  const steps = ["1. Type", "2. Details", "3. Media", "4. Packages", "Review"];
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<ServiceFormData>({
    defaultValues: {
      service_type: undefined,
      title: "",
      description: "",
      duration_minutes: 60,
      is_remote: false,
    },
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [packages, setPackages] = useState<PackageData[]>([
    { name: "", price: "" },
  ]);
  const [packageErrors, setPackageErrors] = useState<
    { name?: string; price?: string }[]
  >([{}]);
  const [publishing, setPublishing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ monthly_new_inquiries: number }>();
  const watchTitle = watch("title");
  const watchDescription = watch("description");

  useEffect(() => {
    if (step === 3 && !stats) {
      getDashboardStats()
        .then((res) => setStats(res.data))
        .catch(() => {});
    }
  }, [step, stats]);

  const nextDisabled = () => {
    if (step === 0) return !watch("service_type");
    if (step === 1) {
      return !!(errors.title || errors.description || errors.duration_minutes);
    }
    if (step === 2) {
      return !mediaFiles.some((f) => f.type.startsWith("image/"));
    }
    if (step === 3) {
      return packages.some((p) => !p.name.trim() || Number(p.price) <= 0);
    }
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
    if (step === 3) {
      if (!validatePackages()) return;
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
      const price = parseFloat(packages[0].price || "0");
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

  const types = [
    {
      value: "Live Performance",
      label: "Live Performance",
      Icon: MusicalNoteIcon,
    },
    {
      value: "Personalized Video",
      label: "Personalized Video",
      Icon: VideoCameraIcon,
    },
    { value: "Custom Song", label: "Custom Song", Icon: SparklesIcon },
    { value: "Other", label: "Other", Icon: SquaresPlusIcon },
  ];

  const earnings =
    stats && packages[0].price
      ? stats.monthly_new_inquiries * parseFloat(packages[0].price)
      : null;

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50" onClose={handleCancel}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Dialog.Overlay className="fixed inset-0 bg-black bg-opacity-10 pointer-events-none" />
        </Transition.Child>
        <div className="flex min-h-full items-center justify-center p-0 sm:p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
          <Dialog.Panel className="pointer-events-auto flex flex-col h-[90vh] w-full sm:max-w-4xl rounded-2xl shadow-2xl bg-white">
              <div className="flex flex-col h-full">
                <Stepper
                  steps={steps.slice(0, 4)}
                  currentStep={step}
                  maxStepCompleted={maxStep}
                  onStepClick={setStep}
                  ariaLabel="Add service progress"
                />
                <form
                  onSubmit={handleSubmit(onSubmit)}
                  className="flex-1 overflow-auto space-y-6 p-6"
                >
                  {step === 0 && (
                    <div>
                      <h2 className="text-xl font-semibold mb-4">
                        Choose Your Service Category
                      </h2>
                      <div className="grid grid-cols-2 gap-4">
                        {types.map(({ value, label, Icon }) => (
                          <button
                            type="button"
                            key={value}
                            data-value={value}
                            onClick={() => setValue("service_type", value)}
                            className={clsx(
                              "flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow hover:shadow-md transition",
                              watch("service_type") === value
                                ? "border-2 border-[#FF5A5F]"
                                : "border border-gray-200",
                            )}
                          >
                            <Icon className="h-8 w-8 mb-2" />
                            <span className="text-base font-medium text-gray-800">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {step === 1 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">Service Details</h2>
                      <TextInput
                        label="Service Title"
                        {...register("title", {
                          required: "Service title is required",
                          minLength: {
                            value: 5,
                            message: "Must be at least 5 characters",
                          },
                          maxLength: {
                            value: 60,
                            message: "Must be at most 60 characters",
                          },
                        })}
                      />
                      <p className="text-xs text-right text-gray-500">
                        {(watchTitle || "").length}/60
                      </p>
                      <TextArea
                        label="Description"
                        rows={4}
                        {...register("description", {
                          required: "Description is required",
                          minLength: {
                            value: 20,
                            message: "Must be at least 20 characters",
                          },
                          maxLength: {
                            value: 500,
                            message: "Must be at most 500 characters",
                          },
                        })}
                      />
                      <p className="text-xs text-right text-gray-500">
                        {(watchDescription || "").length}/500
                      </p>
                      <TextInput
                        label="Duration (minutes)"
                        type="number"
                        {...register("duration_minutes", {
                          required: "Duration is required",
                          valueAsNumber: true,
                          min: { value: 1, message: "Minimum 1" },
                        })}
                      />
                      <div className="flex items-center gap-2">
                        <ToggleSwitch
                          checked={watch("is_remote")}
                          onChange={(v) => setValue("is_remote", v)}
                          label="Remote"
                        />
                      </div>
                      {errors.title && (
                        <p className="text-sm text-red-600">
                          {errors.title.message}
                        </p>
                      )}
                      {errors.description && (
                        <p className="text-sm text-red-600">
                          {errors.description.message}
                        </p>
                      )}
                      {errors.duration_minutes && (
                        <p className="text-sm text-red-600">
                          {errors.duration_minutes.message}
                        </p>
                      )}
                    </div>
                  )}
                  {step === 2 && (
                    <div>
                      <h2 className="text-xl font-semibold mb-4">
                        Upload Media
                      </h2>
                      <label
                        htmlFor="media-upload"
                        className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer"
                        aria-label="Upload service media"
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          onFileChange(e.dataTransfer.files);
                        }}
                        data-testid="dropzone"
                      >
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
                      {mediaError && (
                        <p className="text-sm text-red-600 mt-2">
                          {mediaError}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-4">
                        {mediaFiles.map((file, i) => (
                          <div
                            // eslint-disable-next-line react/no-array-index-key
                            key={i}
                            className="relative w-24 h-24 border rounded overflow-hidden"
                          >
                            {file.type.startsWith("image/") ? (
                              <img
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                className="object-cover w-full h-full"
                              />
                            ) : (
                              <span className="text-xs break-all p-1">
                                {file.name}
                              </span>
                            )}
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
                  {step === 3 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">
                        Packages & Pricing
                      </h2>
                      {packages.map((pkg, i) => (
                        <div
                          // eslint-disable-next-line react/no-array-index-key
                          key={i}
                          className="border rounded-md p-4 space-y-2"
                        >
                          <TextInput
                            label="Name"
                            value={pkg.name}
                            onChange={(e) =>
                              updatePackage(i, "name", e.target.value)
                            }
                            name={`packages[${i}].name`}
                            error={packageErrors[i]?.name}
                          />
                          <TextInput
                            label={`Price (${DEFAULT_CURRENCY})`}
                            type="number"
                            step="0.01"
                            value={pkg.price}
                            onChange={(e) =>
                              updatePackage(i, "price", e.target.value)
                            }
                            name={`packages[${i}].price`}
                            error={packageErrors[i]?.price}
                          />
                        </div>
                      ))}
                      {packages.length < 3 && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={addPackage}
                        >
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
                  {step === 4 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">
                        Review Your Service
                      </h2>
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
                          <p>{watch("duration_minutes")} minutes</p>
                        </div>
                        <div className="border rounded-md p-4 col-span-full">
                          <h3 className="font-medium">Packages</h3>
                          {packages.map((p, idx) => (
                            <p key={idx}>
                              {p.name}: {p.price}
                            </p>
                          ))}
                        </div>
                        {mediaFiles.filter((f) => f.type.startsWith("image/"))
                          .length > 0 && (
                          <div className="border rounded-md p-4 col-span-full">
                            <h3 className="font-medium">Images</h3>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {mediaFiles
                                .filter((f) => f.type.startsWith("image/"))
                                .map((file, i) => (
                                  <img
                                    // eslint-disable-next-line react/no-array-index-key
                                    key={i}
                                    src={URL.createObjectURL(file)}
                                    alt={file.name}
                                    className="w-16 h-16 object-cover rounded"
                                  />
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {serverError && (
                        <p className="text-sm text-red-600">{serverError}</p>
                      )}
                    </div>
                  )}
                </form>
                <div className="flex-shrink-0 border-t border-gray-100 p-6 flex justify-between">
                  <Button
                    variant="outline"
                    onClick={step === 0 ? handleCancel : prev}
                    data-testid="back"
                    className="px-6 py-3"
                  >
                    {step === 0 ? 'Cancel' : 'Back'}
                  </Button>
                  {step < steps.length - 1 && (
                    <Button
                      onClick={next}
                      disabled={nextDisabled()}
                      data-testid="next"
                      className="px-6 py-3"
                    >
                      Next
                    </Button>
                  )}
                  {step === steps.length - 1 && (
                    <Button
                      type="submit"
                      disabled={publishing || isSubmitting || nextDisabled()}
                      isLoading={publishing || isSubmitting}
                      className="px-6 py-3"
                    >
                      Publish
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

"use client";

import { Fragment, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useForm,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import { Stepper } from "@/components/ui";
import {
  createService as apiCreateService,
  updateService as apiUpdateService,
  uploadImage as apiUploadImage,
  presignServiceMedia,
} from "@/lib/api";
import type { Service } from "@/types";

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

export interface WizardStep<T extends FieldValues> {
  label: string;
  render: (args: {
    form: UseFormReturn<T, any>;
    mediaFiles: File[];
    setMediaFiles: (files: File[]) => void;
    onFileChange: (files: FileList | null) => void;
    removeFile: (index: number) => void;
    existingMediaUrl: string | null;
    removeExistingMedia: () => void;
    mediaError: string | null;
    thumbnails: string[];
  }) => ReactNode;
  fields?: (keyof T)[];
  validate?: (args: {
    form: UseFormReturn<T, any>;
    mediaFiles: File[];
    existingMediaUrl: string | null;
    mediaError: string | null;
  }) => boolean | Promise<boolean>;
}

interface BaseServiceWizardProps<T extends FieldValues> {
  isOpen: boolean;
  onClose: () => void;
  onServiceSaved: (svc: Service) => void;
  service?: Service;
  steps: WizardStep<T>[];
  defaultValues: T;
  toPayload: (data: T, mediaUrl: string | null) => Partial<Service>;
  serviceCategorySlug?: string;
}

export default function BaseServiceWizard<T extends FieldValues>({
  isOpen,
  onClose,
  onServiceSaved,
  service,
  steps,
  defaultValues,
  toPayload,
  serviceCategorySlug,
}: BaseServiceWizardProps<T>) {
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(
    service?.media_url ?? null,
  );
  const thumbnails = useImageThumbnails(mediaFiles);


  const form = useForm<T, any>({ defaultValues: defaultValues as any });
  const { handleSubmit, trigger, reset, formState } = form;

  // Track furthest step reached for stepper highlighting
  useEffect(() => {
    setMaxStep((prev) => Math.max(prev, step));
  }, [step]);

  const next = async () => {
    const fields = steps[step].fields;
    if (fields && !(await trigger(fields as any))) return;
    const validate = steps[step].validate;
    if (
      validate &&
      !(await validate({
        form: form as UseFormReturn<T>,
        mediaFiles,
        existingMediaUrl,
        mediaError,
      }))
    ) {
      return;
    }
    setStep((s) => s + 1);
  };

  const back = () => setStep((s) => (s > 0 ? s - 1 : s));

  const handleCancel = () => {
    reset(defaultValues);
    setMediaFiles([]);
    setExistingMediaUrl(service?.media_url ?? null);
    setMediaError(null);
    setStep(0);
    setMaxStep(0);
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      reset(defaultValues);
      setMediaFiles([]);
      setExistingMediaUrl(service?.media_url ?? null);
      setMediaError(null);
      setStep(0);
      setMaxStep(0);
    }
  }, [isOpen, service, reset, defaultValues]);

  const onFileChange = (files: FileList | null) => {
    if (!files) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length !== files.length) {
      setMediaError("Only image files are allowed.");
    } else {
      setMediaError(null);
    }
    setMediaFiles((prev) => {
      const updated = [...prev, ...images];
      if (updated.length === 0 && !existingMediaUrl) {
        setMediaError("At least one image is required.");
      }
      return updated;
    });
  };

  const removeFile = (i: number) => {
    setMediaFiles((prev) => {
      const updated = prev.filter((_, idx) => idx !== i);
      if (updated.length === 0 && !existingMediaUrl) {
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

  const onSubmit = handleSubmit(async (data: any) => {
    try {
      // Ensure at least one image (hero or uploaded) to avoid backend 422 on required media
      const imageCount = mediaFiles.length + (existingMediaUrl ? 1 : 0);
      if (imageCount === 0) {
        setMediaError("At least one image is required.");
        throw new Error('Please add at least one image (hero or gallery).');
      }
      let mediaUrl: string | null = existingMediaUrl;
      if (mediaFiles[0]) {
        // Prefer R2 presign → PUT → store key; fallback to legacy upload endpoint
        try {
          const f = mediaFiles[0];
          const presign = await presignServiceMedia(f);
          if (presign.put_url) {
            await fetch(presign.put_url, { method: 'PUT', headers: presign.headers || {}, body: f });
          }
          mediaUrl = (presign.key || presign.public_url || null) as string | null;
        } catch (e) {
          try {
            const uploaded = await apiUploadImage(mediaFiles[0]);
            mediaUrl = uploaded?.url || null;
          } catch (e2) {
            console.error('Image upload failed:', e2);
            throw new Error('Failed to upload image. Please try again.');
          }
        }
      }
      const payload: Partial<Service> = toPayload(data, mediaUrl);
      if (!serviceCategorySlug) {
        alert("Service category is required.");
        return;
      }
      payload.service_category_slug = serviceCategorySlug;
      const res = service
        ? await apiUpdateService(service.id, payload)
        : await apiCreateService(payload);
      onServiceSaved(res.data);
      handleCancel();
    } catch (err) {
      console.error("Failed to save service:", err);
      alert(err instanceof Error ? err.message : "Failed to save service.");
    }
  });

  const stepVariants = {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
    transition: { duration: 0.3, ease: [0.42, 0, 0.58, 1] as const },
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
          <div
            className="fixed inset-0 z-40 bg-gray-500/75"
            aria-hidden="true"
          />
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
              className="pointer-events-auto relative flex h-full w-full max-w-none flex-col overflow-hidden rounded-none bg-white shadow-none md:flex-row"
              data-testid="wizard"
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
                  steps={steps.slice(0, steps.length - 1).map((s) => s.label)}
                  currentStep={step}
                  maxStepCompleted={maxStep}
                  onStepClick={setStep}
                  ariaLabel="Add service progress"
                  className="space-y-4"
                  orientation="vertical"
                  noCircles
                />
              </div>

              <div className="flex w-full flex-1 flex-col overflow-hidden md:w-3/5">
                <form
                  id="service-form"
                  onSubmit={onSubmit}
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
                      {steps[step].render({
                        form: form as UseFormReturn<T>,
                        mediaFiles,
                        setMediaFiles,
                        onFileChange,
                        removeFile,
                        existingMediaUrl,
                        removeExistingMedia,
                        mediaError,
                        thumbnails,
                      })}
                    </motion.div>
                  </AnimatePresence>
                </form>

                <div className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-gray-100 p-4 sm:flex-row sm:justify-between">
                  <Button
                    variant="outline"
                    onClick={step === 0 ? handleCancel : back}
                    data-testid="back"
                    className="min-h-[40px] w-full sm:w-auto"
                  >
                    {step === 0 ? "Cancel" : "Back"}
                  </Button>
                  {step < steps.length - 1 && (
                    <Button
                      onClick={next}
                      data-testid="next"
                      className="min-h-[40px] w-full sm:w-auto"
                    >
                      Next
                    </Button>
                  )}
                  {step === steps.length - 1 && (
                    <Button
                      type="submit"
                      form="service-form"
                      isLoading={formState.isSubmitting}
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

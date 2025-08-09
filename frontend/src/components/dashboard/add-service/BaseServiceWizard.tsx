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
} from "@/lib/api";
import type { Service } from "@/types";

export interface WizardStep<T extends FieldValues> {
  label: string;
  render: (args: {
    form: UseFormReturn<T>;
    mediaFiles: File[];
    setMediaFiles: (files: File[]) => void;
  }) => ReactNode;
  fields?: (keyof T)[];
}

interface BaseServiceWizardProps<T extends FieldValues> {
  isOpen: boolean;
  onClose: () => void;
  onServiceSaved: (svc: Service) => void;
  service?: Service;
  steps: WizardStep<T>[];
  defaultValues: T;
  toPayload: (data: T, mediaUrl: string | null) => Partial<Service>;
}

export default function BaseServiceWizard<T extends FieldValues>({
  isOpen,
  onClose,
  onServiceSaved,
  service,
  steps,
  defaultValues,
  toPayload,
}: BaseServiceWizardProps<T>) {
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);

  const form = useForm<T>({ defaultValues });
  const { handleSubmit, trigger, reset, formState } = form;

  // Track furthest step reached for stepper highlighting
  useEffect(() => {
    setMaxStep((prev) => Math.max(prev, step));
  }, [step]);

  const next = async () => {
    const fields = steps[step].fields;
    if (fields && !(await trigger(fields as string[]))) return;
    setStep((s) => s + 1);
  };

  const back = () => setStep((s) => (s > 0 ? s - 1 : s));

  const handleCancel = () => {
    reset(defaultValues);
    setMediaFiles([]);
    setStep(0);
    setMaxStep(0);
    onClose();
  };

  const onSubmit = handleSubmit(async (data: T) => {
    let mediaUrl: string | null = service?.media_url ?? null;
    if (mediaFiles[0]) {
      mediaUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(mediaFiles[0]);
      });
    }
    const payload = toPayload(data, mediaUrl);
    const res = service
      ? await apiUpdateService(service.id, payload)
      : await apiCreateService(payload);
    onServiceSaved(res.data);
    handleCancel();
  });

  const stepVariants = {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
    transition: { duration: 0.3, ease: [0.42, 0, 0.58, 1] as const },
  };

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

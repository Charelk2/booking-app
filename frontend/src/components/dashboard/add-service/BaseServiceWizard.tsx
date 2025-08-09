"use client";

import { Fragment, useState } from "react";
import type { ReactNode } from "react";
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

  const next = async () => {
    const fields = steps[step].fields;
    if (fields && !(await trigger(fields as string[]))) return;
    setStep((s) => {
      const nextStep = s + 1;
      setMaxStep((m) => (nextStep > m ? nextStep : m));
      return nextStep;
    });
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
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl rounded bg-white p-6" data-testid="wizard">
                <div className="mb-4 flex items-center justify-between">
                  <Dialog.Title className="text-lg font-semibold">
                    {service ? "Edit Service" : "Add Service"}
                  </Dialog.Title>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded p-1 hover:bg-gray-100"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
                <Stepper
                  steps={steps.map((s) => s.label)}
                  currentStep={step}
                  maxStepCompleted={maxStep}
                  className="mb-4"
                />
                <form id="service-form" onSubmit={onSubmit}>
                  {steps[step].render({
                    form: form as UseFormReturn<T>,
                    mediaFiles,
                    setMediaFiles,
                  })}
                </form>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={step === 0 ? handleCancel : back}
                    data-testid="back"
                  >
                    {step === 0 ? "Cancel" : "Back"}
                  </Button>
                  {step < steps.length - 1 && (
                    <Button onClick={next} data-testid="next">
                      Next
                    </Button>
                  )}
                  {step === steps.length - 1 && (
                    <Button
                      type="submit"
                      form="service-form"
                      isLoading={formState.isSubmitting}
                    >
                      {service ? "Save" : "Publish"}
                    </Button>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

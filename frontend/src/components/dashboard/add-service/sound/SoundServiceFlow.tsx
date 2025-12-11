"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import Button from "@/components/ui/Button";
import { Stepper, TextInput, TextArea } from "@/components/ui";
import type { Service } from "@/types";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { presignServiceMedia, uploadImage } from "@/lib/api";
import { useAddServiceEngine } from "@/features/serviceTypes/addService/engine";
import { SERVICE_TYPE_REGISTRY } from "@/features/serviceTypes/addService/serviceTypeRegistry";

type SoundServiceFlowProps = {
  isOpen: boolean;
  onClose: () => void;
  onServiceSaved: (svc: Service) => void;
  service?: Service;
};

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

export default function SoundServiceFlow({
  isOpen,
  onClose,
  onServiceSaved,
  service,
}: SoundServiceFlowProps) {
  const sndConfig = SERVICE_TYPE_REGISTRY.sound_service_live;
  const [step, setStep] = useState(0);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(
    service?.media_url ?? null,
  );
  const thumbnails = useImageThumbnails(mediaFiles);

  const { state, actions } = useAddServiceEngine({
    serviceCategorySlug: "sound_service",
    serviceType: "sound_service_live",
    service,
    onSaved: (svc) => {
      onServiceSaved(svc);
      handleCancel();
    },
  });

  const travelPolicyOptions = useMemo(
    () =>
      sndConfig.fields.find((f) => f.key === "travel_fee_policy")?.options || [],
    [sndConfig.fields],
  );

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setMediaFiles([]);
    setExistingMediaUrl(service?.media_url ?? null);
    setMediaError(null);
    actions.reset();
  }, [isOpen, service, actions]);

  const handleCancel = () => {
    setMediaFiles([]);
    setExistingMediaUrl(service?.media_url ?? null);
    setMediaError(null);
    setStep(0);
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
    setMediaFiles((prev) => [...prev, ...images]);
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

  const canAdvanceDetails = () => {
    return (
      (state.common.title || "").trim().length >= 5 &&
      (state.common.description || "").trim().length >= 20 &&
      Number(state.common.price || 0) > 0
    );
  };

  const handleSubmit = async () => {
    const imageCount = mediaFiles.length + (existingMediaUrl ? 1 : 0);
    if (imageCount === 0) {
      setMediaError("At least one image is required.");
      return;
    }

    let mediaUrl = existingMediaUrl;
    if (mediaFiles[0]) {
      try {
        const f = mediaFiles[0];
        const presign = await presignServiceMedia(f);
        if (presign.put_url) {
          await fetch(presign.put_url, {
            method: "PUT",
            headers: presign.headers || {},
            body: f,
          });
        }
        mediaUrl =
          (presign.key || presign.public_url || null) as string | null;
      } catch (e) {
        try {
          const uploaded = await uploadImage(mediaFiles[0]);
          mediaUrl = uploaded?.url || null;
        } catch (err) {
          console.error("Image upload failed:", err);
          setMediaError("Failed to upload image. Please try again.");
          return;
        }
      }
    }

    await actions.submit({ media_url: mediaUrl || undefined });
  };

  const steps = ["Details", "Media"];

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
                  maxStepCompleted={step}
                  onStepClick={setStep}
                  ariaLabel="Add sound service progress"
                  className="space-y-4"
                  orientation="vertical"
                  noCircles
                />
              </div>

              <div className="flex w-full flex-1 flex-col overflow-hidden md:w-4/5">
                <div className="flex-1 space-y-4 overflow-y-scroll p-6">
                  {step === 0 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">Sound service details</h2>

                      <TextInput
                        label="Service Title"
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
                      <TextArea
                        label="Short summary"
                        rows={2}
                        value={state.typeFields.short_summary || ""}
                        onChange={(e) =>
                          actions.setTypeField("short_summary", e.target.value)
                        }
                      />
                      <TextInput
                        label={`Base Price (${DEFAULT_CURRENCY})`}
                        type="number"
                        value={state.common.price}
                        onChange={(e) =>
                          actions.setCommonField(
                            "price",
                            Number(e.target.value || 0),
                          )
                        }
                      />

                      <TextInput
                        label="Coverage areas (comma-separated)"
                        placeholder="CPT,JNB,DBN"
                        value={state.typeFields.coverage_areas || ""}
                        onChange={(e) =>
                          actions.setTypeField("coverage_areas", e.target.value)
                        }
                      />

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-gray-800">
                            Travel fee policy
                          </label>
                          <select
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            value={state.typeFields.travel_fee_policy || "flat"}
                            onChange={(e) =>
                              actions.setTypeField(
                                "travel_fee_policy",
                                e.target.value,
                              )
                            }
                          >
                            {travelPolicyOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {state.typeFields.travel_fee_policy === "flat" && (
                          <TextInput
                            label="Travel flat amount (ZAR)"
                            type="number"
                            value={state.typeFields.travel_flat_amount || ""}
                            onChange={(e) =>
                              actions.setTypeField(
                                "travel_flat_amount",
                                e.target.value,
                              )
                            }
                          />
                        )}
                        {state.typeFields.travel_fee_policy === "per_km" && (
                          <TextInput
                            label="Travel rate per km (ZAR)"
                            type="number"
                            value={state.typeFields.travel_per_km_rate || ""}
                            onChange={(e) =>
                              actions.setTypeField(
                                "travel_per_km_rate",
                                e.target.value,
                              )
                            }
                          />
                        )}
                        {state.typeFields.travel_fee_policy ===
                          "included_radius" && (
                          <TextInput
                            label="Included radius (km)"
                            type="number"
                            value={state.typeFields.included_radius_km || ""}
                            onChange={(e) =>
                              actions.setTypeField(
                                "included_radius_km",
                                e.target.value,
                              )
                            }
                          />
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TextInput
                          label="Setup minutes"
                          type="number"
                          value={state.typeFields.setup_minutes ?? 30}
                          onChange={(e) =>
                            actions.setTypeField(
                              "setup_minutes",
                              e.target.value,
                            )
                          }
                        />
                        <TextInput
                          label="Teardown minutes"
                          type="number"
                          value={state.typeFields.teardown_minutes ?? 30}
                          onChange={(e) =>
                            actions.setTypeField(
                              "teardown_minutes",
                              e.target.value,
                            )
                          }
                        />
                        <TextInput
                          label="Min crew"
                          type="number"
                          value={state.typeFields.crew_min ?? 1}
                          onChange={(e) =>
                            actions.setTypeField("crew_min", e.target.value)
                          }
                        />
                        <TextInput
                          label="Typical crew"
                          type="number"
                          value={state.typeFields.crew_typical ?? 2}
                          onChange={(e) =>
                            actions.setTypeField("crew_typical", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">Media</h2>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-800">
                          Cover image
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => onFileChange(e.target.files)}
                          className="block w-full text-sm text-gray-600"
                        />
                        {mediaError && (
                          <p className="text-sm text-red-600">{mediaError}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {existingMediaUrl && (
                          <div className="relative">
                            <img
                              src={existingMediaUrl}
                              alt="Existing media"
                              className="h-32 w-full rounded-md object-cover"
                            />
                            <button
                              type="button"
                              className="absolute right-1 top-1 rounded bg-white/80 p-1 text-xs text-red-600"
                              onClick={removeExistingMedia}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                        {thumbnails.map((url, idx) => (
                          <div key={url} className="relative">
                            <img
                              src={url}
                              alt={`Upload ${idx + 1}`}
                              className="h-32 w-full rounded-md object-cover"
                            />
                            <button
                              type="button"
                              className="absolute right-1 top-1 rounded bg-white/80 p-1 text-xs text-red-600"
                              onClick={() => removeFile(idx)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-gray-100 p-4 sm:flex-row sm:justify-between">
                  <Button
                    variant="outline"
                    onClick={step === 0 ? handleCancel : () => setStep(step - 1)}
                    className="min-h-[40px] w-full sm:w-auto"
                  >
                    {step === 0 ? "Cancel" : "Back"}
                  </Button>
                  {step < steps.length - 1 && (
                    <Button
                      onClick={() => {
                        if (step === 0 && !canAdvanceDetails()) return;
                        setStep(step + 1);
                      }}
                      className="min-h-[40px] w-full sm:w-auto"
                    >
                      Next
                    </Button>
                  )}
                  {step === steps.length - 1 && (
                    <Button
                      onClick={handleSubmit}
                      isLoading={state.status.saving}
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

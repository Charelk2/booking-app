"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

import Button from "@/components/ui/Button";
import { Stepper, TextInput, TextArea, ToggleSwitch } from "@/components/ui";
import type { Service } from "@/types";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { presignServiceMedia, uploadImage } from "@/lib/api";
import { getFullImageUrl } from "@/lib/utils";
import { useAddServiceEngine } from "@/features/serviceTypes/addService/engine";
import { SERVICE_TYPE_REGISTRY } from "@/features/serviceTypes/addService/serviceTypeRegistry";

type MusicianLiveFlowProps = {
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

export default function MusicianLivePerformanceFlow({
  isOpen,
  onClose,
  onServiceSaved,
  service,
}: MusicianLiveFlowProps) {
  const liveConfig = SERVICE_TYPE_REGISTRY.live_performance_musician;
  const [step, setStep] = useState(0);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(
    service?.media_url ?? null,
  );
  const thumbnails = useImageThumbnails(mediaFiles);

  const { state, actions } = useAddServiceEngine({
    serviceCategorySlug: "musician",
    serviceType: "live_performance_musician",
    service,
    onSaved: (svc) => {
      onServiceSaved(svc);
      handleCancel();
    },
  });

  const soundOptions = useMemo(
    () =>
      liveConfig.fields.find((f) => f.key === "sound_mode")?.options || [
        { value: "artist_provides_variable", label: "I provide sound" },
        { value: "external_providers", label: "Use external providers" },
      ],
    [liveConfig.fields],
  );

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setMediaFiles([]);
    setExistingMediaUrl(service?.media_url ?? null);
    setMediaError(null);
    actions.reset();
    // Seed typeFields from existing details if present
    if (service?.details) {
      const det = service.details as any;
      if (det.sound_provisioning) {
        actions.setTypeField("sound_mode", det.sound_provisioning.mode);
        actions.setTypeField(
          "price_driving_sound",
          det.sound_provisioning.price_driving_sound_zar ?? "",
        );
        actions.setTypeField(
          "price_flying_sound",
          det.sound_provisioning.price_flying_sound_zar ?? "",
        );
      }
      if (det.duration_label && !state.typeFields.duration_minutes) {
        const match = String(det.duration_label).match(/\d+/);
        if (match) {
          actions.setTypeField("duration_minutes", Number(match[0]));
        }
      }
      if (det.tech_rider) {
        const tech = det.tech_rider as any;
        if (tech.stage?.cover_required != null) {
          actions.setTypeField(
            "tech_stage_cover_required",
            Boolean(tech.stage.cover_required),
          );
        }
        if (tech.monitoring?.mixes != null) {
          actions.setTypeField("tech_monitor_mixes", tech.monitoring.mixes);
        }
        const bkKeys = Array.isArray(tech.backline?.required_keys)
          ? tech.backline.required_keys
              .map((k: any) => (typeof k === "string" ? k : k?.key))
              .filter(Boolean)
          : [];
        if (bkKeys.length > 0) {
          actions.setTypeField("tech_backline_keys", bkKeys.join(","));
        }
      }
    }
  }, [isOpen, service, actions, state.typeFields.duration_minutes]);

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
      Number(state.common.price || 0) > 0 &&
      state.typeFields.duration_minutes
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
                  ariaLabel="Add live performance service progress"
                  className="space-y-4"
                  orientation="vertical"
                  noCircles
                />
              </div>

              <div className="flex w-full flex-1 flex-col overflow-hidden md:w-4/5">
                <div className="flex-1 space-y-4 overflow-y-scroll p-6">
                  {step === 0 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">Live performance details</h2>

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
                        label="Default performance length (minutes)"
                        type="number"
                        value={state.typeFields.duration_minutes ?? 60}
                        onChange={(e) =>
                          actions.setTypeField(
                            "duration_minutes",
                            e.target.value,
                          )
                        }
                      />

                      <div className="space-y-2 rounded-md border p-3">
                        <div className="text-sm font-semibold text-gray-800">
                          Sound provisioning
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {soundOptions.map((opt) => {
                            const active =
                              state.typeFields.sound_mode === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                className={clsx(
                                  "rounded-md border px-3 py-2 text-left text-sm",
                                  active
                                    ? "border-[var(--brand-color)] bg-[var(--brand-color)]/10"
                                    : "border-gray-200 hover:border-gray-300",
                                )}
                                onClick={() =>
                                  actions.setTypeField("sound_mode", opt.value)
                                }
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>

                        {state.typeFields.sound_mode ===
                          "artist_provides_variable" && (
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <TextInput
                              label="Sound price (driving)"
                              type="number"
                              value={state.typeFields.price_driving_sound || ""}
                              onChange={(e) =>
                                actions.setTypeField(
                                  "price_driving_sound",
                                  e.target.value,
                                )
                              }
                            />
                            <TextInput
                              label="Sound price (flying)"
                              type="number"
                              value={state.typeFields.price_flying_sound || ""}
                              onChange={(e) =>
                                actions.setTypeField(
                                  "price_flying_sound",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                        )}
                        {state.typeFields.sound_mode ===
                          "external_providers" && (
                          <div className="mt-3 space-y-2">
                        <TextInput
                          label="Preferred provider cities (comma-separated)"
                          placeholder="CPT,JNB,DBN"
                          value={state.typeFields.sound_city_preferences || ""}
                          onChange={(e) =>
                            actions.setTypeField(
                              "sound_city_preferences",
                              e.target.value,
                            )
                          }
                        />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TextInput
                          label="Travel rate per km"
                          type="number"
                          value={state.typeFields.travel_rate || ""}
                          onChange={(e) =>
                            actions.setTypeField("travel_rate", e.target.value)
                          }
                        />
                        <TextInput
                          label="Travel members"
                          type="number"
                          value={state.typeFields.travel_members || ""}
                          onChange={(e) =>
                            actions.setTypeField(
                              "travel_members",
                              e.target.value,
                            )
                          }
                        />
                      </div>

                      <div className="space-y-3 rounded-md border p-3">
                        <div className="text-sm font-semibold text-gray-800">
                          Tech basics
                        </div>
                        <ToggleSwitch
                          label="Stage cover required"
                          checked={Boolean(state.typeFields.tech_stage_cover_required)}
                          onChange={(v) =>
                            actions.setTypeField("tech_stage_cover_required", v)
                          }
                        />
                        <TextInput
                          label="Monitor mixes"
                          type="number"
                          value={state.typeFields.tech_monitor_mixes ?? ""}
                          onChange={(e) =>
                            actions.setTypeField(
                              "tech_monitor_mixes",
                              e.target.value,
                            )
                          }
                        />
                        <TextInput
                          label="Backline needs (comma-separated keys)"
                          placeholder="drums_full,guitar_amp,bass_amp"
                          value={state.typeFields.tech_backline_keys || ""}
                          onChange={(e) =>
                            actions.setTypeField(
                              "tech_backline_keys",
                              e.target.value,
                            )
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
	                        <label
	                          htmlFor="media-upload"
	                          className="flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-gray-200 bg-white p-4 text-center"
	                          onDragOver={(e) => {
	                            e.preventDefault();
	                            e.stopPropagation();
	                            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
	                          }}
	                          onDrop={(e) => {
	                            e.preventDefault();
	                            e.stopPropagation();
	                            onFileChange(e.dataTransfer.files);
	                          }}
	                        >
	                          <p className="text-sm text-gray-700">
	                            Drag images here or click to upload
	                          </p>
	                          <input
	                            id="media-upload"
	                            type="file"
	                            accept="image/*"
	                            multiple
	                            className="sr-only"
	                            onChange={(e) => onFileChange(e.target.files)}
	                          />
	                        </label>
	                        {mediaError && (
	                          <p className="text-sm text-red-600">{mediaError}</p>
	                        )}
	                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {existingMediaUrl && (
                          <div className="relative">
                            <img
                              src={getFullImageUrl(existingMediaUrl) || existingMediaUrl}
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

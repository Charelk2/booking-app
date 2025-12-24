"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

import Button from "@/components/ui/Button";
import { Stepper, TextInput, TextArea } from "@/components/ui";
import type { Service } from "@/types";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { presignServiceMedia, uploadImage } from "@/lib/api";
import { getFullImageUrl } from "@/lib/utils";
import { useAddServiceEngine } from "@/features/serviceTypes/addService/engine";
import { SERVICE_TYPE_REGISTRY } from "@/features/serviceTypes/addService/serviceTypeRegistry";

type MusicianPVFlowProps = {
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
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [files]);
  return thumbnails;
}

export default function MusicianPersonalizedVideoFlow({
  isOpen,
  onClose,
  onServiceSaved,
  service,
}: MusicianPVFlowProps) {
  const pvConfig = SERVICE_TYPE_REGISTRY.personalized_video;
  const [step, setStep] = useState(0);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(
    service?.media_url ?? null,
  );
  const thumbnails = useImageThumbnails(mediaFiles);

  const { state, actions } = useAddServiceEngine({
    serviceCategorySlug: "musician",
    serviceType: "personalized_video",
    service,
    onSaved: (svc) => {
      onServiceSaved(svc);
      handleCancel();
    },
  });

  const languageOptions = useMemo(
    () =>
      pvConfig.fields.find((f) => f.key === "languages")?.options ||
      [{ value: "EN", label: "English" }],
    [pvConfig.fields],
  );

  const pvClientPreview = useMemo(() => {
    const minNoticeRaw = state.typeFields.min_notice_days;
    const minNotice = (() => {
      const n = typeof minNoticeRaw === "number" ? minNoticeRaw : Number(minNoticeRaw);
      if (!Number.isFinite(n)) return 1;
      return Math.max(0, Math.min(365, Math.trunc(n)));
    })();

    const maxPerDayRaw = state.typeFields.max_videos_per_day;
    const maxPerDay = (() => {
      const n = typeof maxPerDayRaw === "number" ? maxPerDayRaw : Number(maxPerDayRaw);
      if (!Number.isFinite(n)) return 3;
      return Math.max(1, Math.min(50, Math.trunc(n)));
    })();

    const rushEnabled = Boolean(state.typeFields.rush_custom_enabled);
    const rushFeeRaw = state.typeFields.rush_fee_zar;
    const rushFee = (() => {
      const n = typeof rushFeeRaw === "number" ? rushFeeRaw : Number(rushFeeRaw);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.round(n));
    })();
    const rushWithinRaw = state.typeFields.rush_within_days;
    const rushWithin = (() => {
      const n = typeof rushWithinRaw === "number" ? rushWithinRaw : Number(rushWithinRaw);
      if (!Number.isFinite(n)) return 2;
      return Math.max(0, Math.min(30, Math.trunc(n)));
    })();

    const money = (value: number) =>
      new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: DEFAULT_CURRENCY,
      }).format(Number.isFinite(value) ? value : 0);

    const parts: string[] = [
      `Standard delivery: ${minNotice} day${minNotice === 1 ? "" : "s"}`,
      `Daily capacity: ${maxPerDay}/day`,
    ];

    if (rushEnabled && rushFee > 0) {
      if (minNotice <= 0) {
        parts.push("Rush: not applicable");
      } else if (rushWithin >= minNotice) {
        parts.push(`Rush: won't apply (set under ${minNotice} days)`);
      } else {
        const latestRush = minNotice - 1;
        const range =
          rushWithin === latestRush
            ? `${rushWithin} day${rushWithin === 1 ? "" : "s"}`
            : `${rushWithin}–${latestRush} days`;
        parts.push(`Rush: +${money(rushFee)} for delivery in ${range}`);
      }
    } else if (rushEnabled) {
      parts.push("Rush: enabled");
    } else {
      parts.push("Rush: standard");
    }

    return parts.join(" • ");
  }, [
    state.typeFields.min_notice_days,
    state.typeFields.max_videos_per_day,
    state.typeFields.rush_custom_enabled,
    state.typeFields.rush_fee_zar,
    state.typeFields.rush_within_days,
  ]);

  const rushHelp = useMemo(() => {
    const enabled = Boolean(state.typeFields.rush_custom_enabled);
    if (!enabled) return null;

    const standardRaw = state.typeFields.min_notice_days;
    const standard = (() => {
      const n = typeof standardRaw === "number" ? standardRaw : Number(standardRaw);
      if (!Number.isFinite(n)) return 1;
      return Math.max(0, Math.min(365, Math.trunc(n)));
    })();

    const feeRaw = state.typeFields.rush_fee_zar;
    const fee = (() => {
      const n = typeof feeRaw === "number" ? feeRaw : Number(feeRaw);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.round(n));
    })();

    const rushRaw = state.typeFields.rush_within_days;
    const rushDays = (() => {
      const n = typeof rushRaw === "number" ? rushRaw : Number(rushRaw);
      if (!Number.isFinite(n)) return 2;
      return Math.max(0, Math.min(365, Math.trunc(n)));
    })();

    if (fee <= 0) {
      return { tone: "muted" as const, text: "Add a rush fee to enable rush delivery." };
    }
    if (standard <= 0) {
      return { tone: "muted" as const, text: "Standard delivery is immediate, so rush won't apply." };
    }
    if (rushDays >= standard) {
      return {
        tone: "warn" as const,
        text: `Rush won't apply — set rush days lower than ${standard} (your standard delivery is ${standard} days).`,
      };
    }
    const latestRush = Math.max(0, standard - 1);
    const range =
      rushDays === latestRush
        ? `${rushDays} day${rushDays === 1 ? "" : "s"}`
        : `${rushDays}–${latestRush} days`;
    return {
      tone: "muted" as const,
      text: `Rush fee applies for delivery in ${range}. Standard delivery applies from ${standard} days.`,
    };
  }, [
    state.typeFields.rush_custom_enabled,
    state.typeFields.rush_fee_zar,
    state.typeFields.rush_within_days,
    state.typeFields.min_notice_days,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setMediaFiles([]);
    setExistingMediaUrl(service?.media_url ?? null);
    setMediaError(null);
    actions.reset();

    const existingDetails = (service?.details || {}) as Record<string, any>;
    const hasCustomRush =
      existingDetails.rush_custom_enabled === true ||
      existingDetails.rush_fee_zar != null ||
      existingDetails.rush_within_days != null;
    if (hasCustomRush) {
      actions.setTypeField("rush_custom_enabled", true);
    }
  }, [isOpen, service, actions]);

  const handleCancel = () => {
    setMediaFiles([]);
    setExistingMediaUrl(service?.media_url ?? null);
    setMediaError(null);
    setStep(0);
    actions.reset();
    onClose();
  };

  const toggleLanguage = (code: string) => {
    const current = Array.isArray(state.typeFields.languages)
      ? [...state.typeFields.languages]
      : [];
    const idx = current.indexOf(code);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(code);
    actions.setTypeField("languages", current);
  };

  const canAdvanceDetails = () => {
    return (
      (state.common.title || "").trim().length >= 5 &&
      (state.common.description || "").trim().length >= 20 &&
      Number(state.common.price || 0) > 0 &&
      state.typeFields.base_length_sec &&
      Number(state.typeFields.max_videos_per_day || 0) >= 1 &&
      Number(state.typeFields.min_notice_days ?? 0) >= 0 &&
      Number(state.typeFields.revisions_included ?? 0) >= 0
    );
  };

  const onFileChange = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    const images = picked.filter((f) => f.type.startsWith("image/"));
    if (images.length !== picked.length || images.length === 0) {
      setMediaError("Only image files are allowed.");
      return;
    }
    setMediaError(null);
    // Service currently supports a single cover image.
    setMediaFiles([images[0]]);
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
	                  ariaLabel="Add personalised video progress"
	                  className="space-y-4"
	                  orientation="vertical"
	                  noCircles
	                />
              </div>

              <div className="flex w-full flex-1 flex-col overflow-hidden md:w-4/5">
                <div className="flex-1 space-y-4 overflow-y-scroll p-6">
	                  {step === 0 && (
	                    <div className="space-y-4">
	                      <h2 className="text-xl font-semibold">
	                        Personalised Video details
	                      </h2>

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
	                        inputMode="numeric"
	                        min={0}
	                        step={1}
	                        value={state.common.price || ""}
	                        onWheel={(e) => {
	                          // Avoid changing the value when scrolling the modal over number inputs.
	                          (e.target as HTMLInputElement).blur();
	                        }}
	                        onChange={(e) => {
	                          const raw = e.target.value;
	                          actions.setCommonField("price", raw === "" ? 0 : Number(raw));
	                        }}
	                      />

	                      <div className="space-y-2">
	                        <label className="text-sm font-medium text-gray-800">
	                          Default video length
	                        </label>
	                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
	                          {(pvConfig.fields.find(
	                            (f) => f.key === "base_length_sec",
	                          )?.options || []).map((opt) => (
	                            <button
	                              key={opt.value}
	                              type="button"
	                              className={clsx(
	                                "rounded-md border px-3 py-2 text-sm",
	                                state.typeFields.base_length_sec === opt.value
	                                  ? "border-[var(--brand-color)] bg-[var(--brand-color)]/10"
	                                  : "border-gray-200 hover:border-gray-300",
	                              )}
	                              onClick={() =>
	                                actions.setTypeField(
	                                  "base_length_sec",
	                                  opt.value,
	                                )
	                              }
	                            >
	                              {opt.label}
	                            </button>
	                          ))}
	                        </div>
	                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-800">
                          Supported languages
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {languageOptions.map((opt) => {
                            const checked = Array.isArray(
                              state.typeFields.languages,
                            )
                              ? state.typeFields.languages.includes(opt.value)
                              : false;
                            return (
                              <label
                                key={opt.value}
                                className={clsx(
                                  "flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
                                  checked
                                    ? "border-[var(--brand-color)] bg-[var(--brand-color)]/10"
                                    : "border-gray-200 hover:border-gray-300",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={checked}
                                  onChange={() => toggleLanguage(opt.value)}
                                />
                                {opt.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>

	                      <div className="space-y-3">
	                        <h3 className="text-sm font-semibold text-gray-900">
	                          Availability rules
	                        </h3>
		                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
		                          <TextInput
		                            label="Minimum notice (days)"
		                            type="number"
		                            inputMode="numeric"
		                            step={1}
		                            value={state.typeFields.min_notice_days ?? ""}
		                            min={0}
		                            onWheel={(e) => {
		                              // Avoid changing the value when scrolling the modal over number inputs.
		                              (e.target as HTMLInputElement).blur();
		                            }}
		                            onChange={(e) =>
		                              actions.setTypeField("min_notice_days", (() => {
		                                const raw = e.target.value;
		                                return raw === "" ? "" : Number(raw);
		                              })())
		                            }
		                            onBlur={(e) => {
		                              const raw = e.target.value;
		                              if (raw === "") actions.setTypeField("min_notice_days", 1);
		                            }}
		                          />
		                          <TextInput
		                            label="Max videos per day"
		                            type="number"
		                            inputMode="numeric"
		                            step={1}
		                            value={state.typeFields.max_videos_per_day ?? ""}
		                            min={1}
		                            onWheel={(e) => {
		                              (e.target as HTMLInputElement).blur();
		                            }}
		                            onChange={(e) =>
		                              actions.setTypeField("max_videos_per_day", (() => {
		                                const raw = e.target.value;
		                                return raw === "" ? "" : Number(raw);
		                              })())
		                            }
		                            onBlur={(e) => {
		                              const raw = e.target.value;
		                              if (raw === "") actions.setTypeField("max_videos_per_day", 3);
		                            }}
		                          />
		                          <TextInput
		                            label="Included revisions"
		                            type="number"
		                            inputMode="numeric"
		                            step={1}
		                            value={state.typeFields.revisions_included ?? ""}
		                            min={0}
		                            max={10}
		                            onWheel={(e) => {
		                              (e.target as HTMLInputElement).blur();
		                            }}
		                            onChange={(e) =>
		                              actions.setTypeField("revisions_included", (() => {
		                                const raw = e.target.value;
		                                return raw === "" ? "" : Number(raw);
		                              })())
		                            }
		                            onBlur={(e) => {
		                              const raw = e.target.value;
		                              if (raw === "") actions.setTypeField("revisions_included", 1);
		                            }}
		                          />
		                        </div>
	                        <p className="text-xs text-gray-500">
	                          We’ll mark a day as unavailable when you reach your max bookings for that day.
	                        </p>
	                      </div>

                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">
                          Rush pricing
                        </h3>
                        <label className="flex items-center gap-3 text-sm text-gray-800">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={Boolean(state.typeFields.rush_custom_enabled)}
                            onChange={(e) =>
                              actions.setTypeField("rush_custom_enabled", e.target.checked)
                            }
                          />
                          Add a rush fee for short-notice deliveries
                        </label>

	                        {Boolean(state.typeFields.rush_custom_enabled) ? (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
	                            <TextInput
	                              label="Rush fee (ZAR)"
	                              type="number"
	                              inputMode="numeric"
	                              step={1}
	                              value={state.typeFields.rush_fee_zar ?? ""}
	                              min={0}
	                              onWheel={(e) => {
	                                (e.target as HTMLInputElement).blur();
	                              }}
	                              onChange={(e) =>
	                                actions.setTypeField(
	                                  "rush_fee_zar",
	                                  (() => {
	                                    const raw = e.target.value;
	                                    return raw === "" ? "" : Number(raw);
	                                  })(),
	                                )
	                              }
	                              onBlur={(e) => {
	                                const raw = e.target.value;
	                                if (raw === "") actions.setTypeField("rush_fee_zar", 0);
	                              }}
	                            />
	                            <TextInput
	                              label="Rush delivery (days)"
	                              type="number"
	                              inputMode="numeric"
	                              step={1}
	                              value={state.typeFields.rush_within_days ?? ""}
	                              min={0}
	                              onWheel={(e) => {
	                                (e.target as HTMLInputElement).blur();
	                              }}
	                              onChange={(e) =>
	                                actions.setTypeField(
	                                  "rush_within_days",
	                                  (() => {
	                                    const raw = e.target.value;
	                                    return raw === "" ? "" : Number(raw);
	                                  })(),
	                                )
	                              }
	                              onBlur={(e) => {
	                                const raw = e.target.value;
	                                if (raw === "") actions.setTypeField("rush_within_days", 2);
	                              }}
	                            />
	                            {rushHelp ? (
	                              <p
	                                className={clsx(
	                                  "text-xs sm:col-span-2",
	                                  rushHelp.tone === "warn" ? "text-amber-700" : "text-gray-500",
	                                )}
	                              >
	                                {rushHelp.text}
	                              </p>
	                            ) : null}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">
                            Rush pricing stays on the default system rules until you enable custom rush pricing.
                          </p>
                        )}
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="text-xs font-semibold text-gray-900">
                          Client-facing preview
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {pvClientPreview}
                        </p>
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
                            Drag an image here or click to upload
                          </p>
                          <input
                            id="media-upload"
                            type="file"
                            accept="image/*"
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

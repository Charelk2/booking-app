"use client";

import Image from "next/image";
import { TextInput } from "@/components/ui";
import type { Service } from "@/types";
import BaseServiceWizard, { type WizardStep } from "./BaseServiceWizard";

interface PhotographerForm {
  title: string;
  price: number | "";
  camera_brand: string;
}

export default function AddServiceModalPhotographer({
  isOpen,
  onClose,
  onServiceSaved,
  service,
}: {
  isOpen: boolean;
  onClose: () => void;
  onServiceSaved: (svc: Service) => void;
  service?: Service;
}) {
  const empty: PhotographerForm = {
    title: "",
    price: "",
    camera_brand: "",
  };
  const defaults: PhotographerForm = service
    ? {
        title: service.title,
        price: service.price,
        camera_brand: (service.details as any)?.camera_brand ?? "",
      }
    : empty;

  const steps: WizardStep<PhotographerForm>[] = [
    {
      label: "Details",
      fields: ["title", "price", "camera_brand"],
      render: ({ form }) => (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Photographer Details</h2>
          <TextInput
            label="Title"
            {...form.register("title", { required: true })}
          />
          <TextInput
            label="Price"
            type="number"
            {...form.register("price", { required: true, valueAsNumber: true })}
          />
          <TextInput
            label="Camera Brand"
            {...form.register("camera_brand", { required: true })}
          />
        </div>
      ),
    },
    {
      label: "Media",
      validate: ({ mediaFiles, existingMediaUrl, mediaError }) =>
        (mediaFiles.length > 0 || !!existingMediaUrl) && !mediaError,
      render: ({
        onFileChange,
        removeFile,
        mediaError,
        thumbnails,
        existingMediaUrl,
        removeExistingMedia,
      }) => (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Upload Media</h2>
          <label
            htmlFor="media-upload"
            className="flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 text-center"
          >
            <p className="text-sm">Drag files here or click to upload</p>
            <input
              id="media-upload"
              aria-label="Media"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onFileChange(e.target.files)}
            />
          </label>
          {mediaError && (
            <p className="mt-2 text-sm text-red-600">{mediaError}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {existingMediaUrl && (
              <div className="relative h-20 w-20 overflow-hidden rounded border">
                <Image
                  src={existingMediaUrl}
                  alt="existing-media"
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={removeExistingMedia}
                  className="absolute right-0 top-0 h-4 w-4 rounded-full bg-black/50 text-xs text-white"
                >
                  ×
                </button>
              </div>
            )}
            {thumbnails.map((src, i) => (
              <div
                key={i}
                className="relative h-20 w-20 overflow-hidden rounded border"
              >
                <Image
                  src={src}
                  alt={`media-${i}`}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
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
      ),
    },
    {
      label: "Review",
      render: ({ form, thumbnails }) => (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Review</h2>
          <p>{form.getValues("title")}</p>
          <p>{form.getValues("price")}</p>
          <p>{form.getValues("camera_brand")}</p>
          {thumbnails.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {thumbnails.map((src, i) => (
                <Image
                  key={i}
                  src={src}
                  alt={`media-${i}`}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded object-cover"
                />
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  const toPayload = (
    data: PhotographerForm,
    mediaUrl: string | null,
  ): Partial<Service> => ({
    service_type: "Other",
    title: data.title,
    price: Number(data.price),
    media_url: mediaUrl ?? "",
    duration_minutes: 60,
    details: { camera_brand: data.camera_brand },
  });

  return (
    <BaseServiceWizard
      isOpen={isOpen}
      onClose={onClose}
      onServiceSaved={onServiceSaved}
      service={service}
      steps={steps}
      defaultValues={defaults}
      toPayload={toPayload}
    />
  );
}

"use client";

import Image from "next/image";
import { TextInput } from "@/components/ui";
import type { Service } from "@/types";
import BaseServiceWizard, { type WizardStep } from "./BaseServiceWizard";

interface CatererForm {
  title: string;
  price: number | "";
  cuisine: string;
}

export default function AddServiceModalCaterer({
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
  const empty: CatererForm = {
    title: "",
    price: "",
    cuisine: "",
  };
  const defaults: CatererForm = service
    ? {
        title: service.title,
        price: service.price,
        cuisine: (service.details as any)?.cuisine ?? "",
      }
    : empty;

  const steps: WizardStep<CatererForm>[] = [
    {
      label: "Details",
      fields: ["title", "price", "cuisine"],
      render: ({ form }) => (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Caterer Details</h2>
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
            label="Cuisine"
            {...form.register("cuisine", { required: true })}
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
          <p>{form.getValues("cuisine")}</p>
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
    data: CatererForm,
    mediaUrl: string | null,
  ): Partial<Service> => ({
    service_type: "Other",
    title: data.title,
    price: Number(data.price),
    media_url: mediaUrl ?? "",
    duration_minutes: 60,
    details: { cuisine: data.cuisine },
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


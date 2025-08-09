"use client";

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
      render: ({ mediaFiles, setMediaFiles }) => (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Upload Media</h2>
          <input
            aria-label="Media"
            type="file"
            accept="image/*"
            onChange={(e) =>
              setMediaFiles(e.target.files ? Array.from(e.target.files) : [])
            }
          />
          {mediaFiles[0] && <p data-testid="file-name">{mediaFiles[0].name}</p>}
        </div>
      ),
    },
    {
      label: "Review",
      render: ({ form, mediaFiles }) => (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Review</h2>
          <p>{form.getValues("title")}</p>
          <p>{form.getValues("price")}</p>
          <p>{form.getValues("camera_brand")}</p>
          {mediaFiles[0] && <p>{mediaFiles[0].name}</p>}
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

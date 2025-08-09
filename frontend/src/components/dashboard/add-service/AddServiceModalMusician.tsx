"use client";

import { TextInput } from "@/components/ui";
import type { Service } from "@/types";
import BaseServiceWizard, {
  type WizardStep,
} from "./BaseServiceWizard";

interface MusicianForm {
  service_type: Service["service_type"];
  title: string;
  price: number | "";
}

export default function AddServiceModalMusician({
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
  const empty: MusicianForm = {
    service_type: "Live Performance",
    title: "",
    price: "",
  };
  const defaults: MusicianForm = service
    ? {
        service_type: service.service_type,
        title: service.title,
        price: service.price,
      }
    : empty;

  const steps: WizardStep<MusicianForm>[] = [
    {
      label: "Details",
      fields: ["service_type", "title", "price"],
      render: ({ form }) => (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Musician Details</h2>
          <label className="block text-sm">
            Type
            <select
              {...form.register("service_type", { required: true })}
              className="mt-1 w-full rounded border p-2"
            >
              <option value="Live Performance">Live Performance</option>
              <option value="Virtual Appearance">Virtual Appearance</option>
              <option value="Personalized Video">Personalized Video</option>
              <option value="Custom Song">Custom Song</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <TextInput
            label="Title"
            {...form.register("title", { required: true })}
          />
          <TextInput
            label="Price"
            type="number"
            {...form.register("price", { required: true, valueAsNumber: true })}
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
          {mediaFiles[0] && <p>{mediaFiles[0].name}</p>}
        </div>
      ),
    },
  ];

  const toPayload = (data: MusicianForm, mediaUrl: string | null) => ({
    service_type: data.service_type,
    title: data.title,
    price: Number(data.price),
    media_url: mediaUrl ?? "",
    duration_minutes: 60,
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

import type { Service } from "@/types";
import type { AddServiceCommonFields, ServiceTypeSlug } from "./types";

export type ServiceTypeFieldKind =
  | "price"
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multi_select"
  | "toggle";

export interface ServiceTypeField {
  key: string;
  kind: ServiceTypeFieldKind;
  label: string;
  helper?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: any;
}

export interface ServiceTypeConfig {
  slug: ServiceTypeSlug;
  label: string;
  description: string;
  serviceTypeLabel: Service["service_type"];
  fields: ServiceTypeField[];
  buildPayload: (
    common: AddServiceCommonFields,
    typeFields: Record<string, any>,
    opts: { serviceCategorySlug: string; existing?: Service | null },
  ) => Partial<Service>;
}

const livePerformanceFields: ServiceTypeField[] = [
  {
    key: "default_set_minutes",
    kind: "number",
    label: "Typical set length (minutes)",
    helper: "How long is a standard performance set?",
    required: false,
    defaultValue: 60,
  },
  {
    key: "includes_sound",
    kind: "toggle",
    label: "Includes sound system",
    helper: "Turn on if you usually bring your own PA/rig.",
    defaultValue: false,
  },
  {
    key: "max_event_hours",
    kind: "number",
    label: "Max event duration (hours)",
    helper: "For longer events, quotes may include additional fees.",
    required: false,
    defaultValue: 4,
  },
];

const personalizedVideoFields: ServiceTypeField[] = [
  {
    key: "base_length_sec",
    kind: "select",
    label: "Default video length",
    helper: "Typical length for this personalized video.",
    required: true,
    options: [
      { value: "40", label: "~40 seconds" },
      { value: "75", label: "~75 seconds" },
    ],
    defaultValue: "40",
  },
  {
    key: "long_addon_price",
    kind: "price",
    label: "Long video add-on price",
    helper: "Additional fee when the client chooses a longer video.",
    required: false,
    defaultValue: 0,
  },
  {
    key: "languages",
    kind: "multi_select",
    label: "Supported languages",
    helper: "Which languages can you comfortably record in?",
    required: false,
    options: [
      { value: "EN", label: "English" },
      { value: "AF", label: "Afrikaans" },
    ],
    defaultValue: ["EN"],
  },
];

const livePerformanceConfig: ServiceTypeConfig = {
  slug: "live_performance",
  label: "Live Performance",
  description: "In-person shows, weddings, parties, festivals.",
  serviceTypeLabel: "Live Performance",
  fields: livePerformanceFields,
  buildPayload(common, typeFields, opts) {
    const details: Record<string, any> = {
      default_set_minutes: Number(typeFields.default_set_minutes || 60),
      includes_sound: Boolean(typeFields.includes_sound),
      max_event_hours:
        typeFields.max_event_hours != null
          ? Number(typeFields.max_event_hours)
          : null,
    };

    return {
      title: common.title,
      description: common.description,
      service_type: "Live Performance",
      price: common.price,
      duration_minutes: details.default_set_minutes || 60,
      service_category_slug: opts.serviceCategorySlug,
      details,
    };
  },
};

const personalizedVideoConfig: ServiceTypeConfig = {
  slug: "personalized_video",
  label: "Personalized Video",
  description:
    "Short custom shout-outs, birthday messages, pep talks, and more.",
  serviceTypeLabel: "Personalized Video",
  fields: personalizedVideoFields,
  buildPayload(common, typeFields, opts) {
    const baseLengthSec = Number(typeFields.base_length_sec || 40);
    const longAddonPrice = Number(typeFields.long_addon_price || 0);
    const languages = Array.isArray(typeFields.languages)
      ? typeFields.languages
      : [];

    const details: Record<string, any> = {
      base_length_sec: baseLengthSec,
      long_addon_price: longAddonPrice,
      languages,
    };

    return {
      title: common.title,
      description: common.description,
      service_type: "Personalized Video",
      price: common.price,
      duration_minutes: baseLengthSec >= 60 ? 75 : 40,
      service_category_slug: opts.serviceCategorySlug,
      details,
    };
  },
};

export const SERVICE_TYPE_REGISTRY: Record<ServiceTypeSlug, ServiceTypeConfig> =
  {
    live_performance: livePerformanceConfig,
    personalized_video: personalizedVideoConfig,
  };


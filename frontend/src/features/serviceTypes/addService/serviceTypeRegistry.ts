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
    helper: "Typical length for this personalised video.",
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
  {
    key: "min_notice_days",
    kind: "number",
    label: "Minimum notice (days)",
    helper: "How many days in advance you need for delivery.",
    required: false,
    defaultValue: 1,
  },
  {
    key: "max_videos_per_day",
    kind: "number",
    label: "Max videos per day",
    helper: "How many personalised videos you can take per day.",
    required: false,
    defaultValue: 3,
  },
  {
    key: "revisions_included",
    kind: "number",
    label: "Included revisions",
    helper: "How many revision requests you’re willing to include after delivery.",
    required: false,
    defaultValue: 1,
  },
  {
    key: "rush_custom_enabled",
    kind: "toggle",
    label: "Custom rush pricing",
    helper: "Charge an extra rush fee for short-notice delivery.",
    defaultValue: false,
  },
  {
    key: "rush_fee_zar",
    kind: "price",
    label: "Rush fee",
    helper: "Extra fee added when rush applies.",
    required: false,
    defaultValue: 0,
  },
  {
    key: "rush_within_days",
    kind: "number",
    label: "Rush applies within (days)",
    helper: "Apply rush fee when delivery is within this many days.",
    required: false,
    defaultValue: 2,
  },
];

const customSongFields: ServiceTypeField[] = [
  {
    key: "base_length_sec",
    kind: "select",
    label: "Default song length",
    helper: "Typical length for this custom song.",
    required: true,
    options: [
      { value: "60", label: "~1 minute" },
      { value: "120", label: "~2 minutes" },
    ],
    defaultValue: "60",
  },
  {
    key: "includes_master",
    kind: "toggle",
    label: "Include master files",
    helper: "Toggle on if you deliver master-quality files.",
    defaultValue: false,
  },
  {
    key: "delivery_format",
    kind: "select",
    label: "Delivery format",
    helper: "Choose your default delivery format.",
    options: [
      { value: "mp3", label: "MP3" },
      { value: "wav", label: "WAV" },
      { value: "stems", label: "Stems (zipped)" },
    ],
    defaultValue: "mp3",
  },
];

const otherFields: ServiceTypeField[] = [
  {
    key: "tags",
    kind: "text",
    label: "Tags or category label",
    helper: "Optional short tags to describe this service.",
    required: false,
    defaultValue: "",
  },
];

const venueDayHireFields: ServiceTypeField[] = [
  {
    key: "venue_type",
    kind: "text",
    label: "Venue type",
    helper: "Optional label like garden, hall, lodge, studio, rooftop.",
    required: false,
    defaultValue: "",
  },
  {
    key: "address",
    kind: "text",
    label: "Address",
    helper: "Displayed to clients after the venue confirms the booking (or earlier if you choose).",
    required: false,
    defaultValue: "",
  },
  {
    key: "capacity",
    kind: "number",
    label: "Capacity (guests)",
    helper: "Max guest capacity for the venue.",
    required: true,
    defaultValue: "",
  },
  {
    key: "amenities",
    kind: "multi_select",
    label: "Amenities",
    required: false,
    defaultValue: [],
  },
  {
    key: "cleaning_fee",
    kind: "price",
    label: "Cleaning fee (optional)",
    required: false,
    defaultValue: 0,
  },
  {
    key: "overtime_rate",
    kind: "price",
    label: "Overtime rate (optional, per hour)",
    required: false,
    defaultValue: 0,
  },
  {
    key: "house_rules_selected",
    kind: "multi_select",
    label: "House rules (internal)",
    required: false,
    defaultValue: [],
  },
  {
    key: "house_rules",
    kind: "textarea",
    label: "House rules",
    helper: "Noise, smoking, catering, decor, parking, time limits, etc.",
    required: false,
    defaultValue: "",
  },
  {
    key: "cancellation_policy",
    kind: "textarea",
    label: "Cancellation policy override (optional)",
    required: false,
    defaultValue: "",
  },
  {
    key: "gallery_urls",
    kind: "text",
    label: "Gallery (internal)",
    required: false,
    defaultValue: [],
  },
];

const soundServiceFields: ServiceTypeField[] = [
  {
    key: "short_summary",
    kind: "textarea",
    label: "Short summary",
    helper: "One-line summary of your sound service.",
    defaultValue: "",
  },
  {
    key: "coverage_areas",
    kind: "text",
    label: "Coverage areas",
    helper: "Comma-separated city codes or areas (e.g., CPT,JNB,DBN).",
    defaultValue: "",
  },
  {
    key: "travel_fee_policy",
    kind: "select",
    label: "Travel fee policy",
    options: [
      { value: "flat", label: "Flat amount" },
      { value: "per_km", label: "Per km" },
      { value: "included_radius", label: "Included radius" },
    ],
    defaultValue: "flat",
  },
  {
    key: "travel_flat_amount",
    kind: "number",
    label: "Travel flat amount (ZAR)",
    defaultValue: "",
  },
  {
    key: "travel_per_km_rate",
    kind: "number",
    label: "Travel rate per km (ZAR)",
    defaultValue: "",
  },
  {
    key: "included_radius_km",
    kind: "number",
    label: "Included radius (km)",
    defaultValue: "",
  },
  {
    key: "setup_minutes",
    kind: "number",
    label: "Setup minutes",
    defaultValue: 30,
  },
  {
    key: "teardown_minutes",
    kind: "number",
    label: "Teardown minutes",
    defaultValue: 30,
  },
  {
    key: "crew_min",
    kind: "number",
    label: "Min crew",
    defaultValue: 1,
  },
  {
    key: "crew_typical",
    kind: "number",
    label: "Typical crew",
    defaultValue: 2,
  },
];

const musicianLiveFields: ServiceTypeField[] = [
  {
    key: "duration_minutes",
    kind: "number",
    label: "Default performance length (minutes)",
    helper: "How long is a standard set?",
    defaultValue: 60,
  },
  {
    key: "sound_mode",
    kind: "select",
    label: "Sound provisioning",
    options: [
      { value: "artist_provides_variable", label: "I provide sound (pricing varies)" },
      { value: "external_providers", label: "Use external providers" },
    ],
    defaultValue: "artist_provides_variable",
  },
  {
    key: "price_driving_sound",
    kind: "number",
    label: "Sound price (driving)",
    helper: "If you provide sound and are driving.",
    defaultValue: "",
  },
  {
    key: "price_flying_sound",
    kind: "number",
    label: "Sound price (flying)",
    helper: "If you provide sound and are flying.",
    defaultValue: "",
  },
  {
    key: "sound_city_preferences",
    kind: "text",
    label: "Preferred sound provider cities",
    helper: "Comma-separated city codes if you rely on external providers (e.g., CPT,JNB,DBN).",
    defaultValue: "",
  },
  {
    key: "travel_rate",
    kind: "number",
    label: "Travel rate per km",
    defaultValue: "",
  },
  {
    key: "travel_members",
    kind: "number",
    label: "Travel members",
    defaultValue: "",
  },
  {
    key: "tech_stage_cover_required",
    kind: "toggle",
    label: "Stage cover required",
    helper: "Toggle on if you require stage cover/shade.",
    defaultValue: false,
  },
  {
    key: "tech_monitor_mixes",
    kind: "number",
    label: "Monitor mixes",
    helper: "How many monitor mixes do you typically need?",
    defaultValue: 0,
  },
  {
    key: "tech_backline_keys",
    kind: "text",
    label: "Backline needs (keys)",
    helper: "Comma-separated backline items (e.g., drums_full,guitar_amp).",
    defaultValue: "",
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
  label: "Personalised Video",
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

    const minNoticeDaysRaw = typeFields.min_notice_days;
    const minNoticeDays = (() => {
      const n = typeof minNoticeDaysRaw === "number" ? minNoticeDaysRaw : Number(minNoticeDaysRaw);
      if (!Number.isFinite(n)) return 1;
      return Math.max(0, Math.min(365, Math.trunc(n)));
    })();

    const maxVideosPerDayRaw = typeFields.max_videos_per_day;
    const maxVideosPerDay = (() => {
      const n = typeof maxVideosPerDayRaw === "number" ? maxVideosPerDayRaw : Number(maxVideosPerDayRaw);
      if (!Number.isFinite(n)) return 3;
      return Math.max(1, Math.min(50, Math.trunc(n)));
    })();

    const revisionsIncludedRaw = typeFields.revisions_included;
    const revisionsIncluded = (() => {
      const n = typeof revisionsIncludedRaw === "number" ? revisionsIncludedRaw : Number(revisionsIncludedRaw);
      if (!Number.isFinite(n)) return 1;
      return Math.max(0, Math.min(10, Math.trunc(n)));
    })();

    const rushCustomEnabled = Boolean(typeFields.rush_custom_enabled);
    const rushFeeZarRaw = typeFields.rush_fee_zar;
    const rushFeeZar = (() => {
      const n = typeof rushFeeZarRaw === "number" ? rushFeeZarRaw : Number(rushFeeZarRaw);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.round(n));
    })();
    const rushWithinDaysRaw = typeFields.rush_within_days;
    const rushWithinDays = (() => {
      const n = typeof rushWithinDaysRaw === "number" ? rushWithinDaysRaw : Number(rushWithinDaysRaw);
      if (!Number.isFinite(n)) return 2;
      return Math.max(0, Math.min(30, Math.trunc(n)));
    })();

    const details: Record<string, any> = {
      base_length_sec: baseLengthSec,
      long_addon_price: longAddonPrice,
      languages,
      min_notice_days: minNoticeDays,
      max_videos_per_day: maxVideosPerDay,
      revisions_included: revisionsIncluded,
      rush_custom_enabled: rushCustomEnabled,
    };
    if (rushCustomEnabled) {
      details.rush_fee_zar = rushFeeZar;
      details.rush_within_days = rushWithinDays;
    }

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

const customSongConfig: ServiceTypeConfig = {
  slug: "custom_song",
  label: "Custom Song",
  description: "Bespoke songs for special occasions and requests.",
  serviceTypeLabel: "Custom Song",
  fields: customSongFields,
  buildPayload(common, typeFields, opts) {
    const baseLengthSec = Number(typeFields.base_length_sec || 60);
    const deliveryFormat = typeFields.delivery_format || "mp3";
    const includesMaster = Boolean(typeFields.includes_master);

    const details: Record<string, any> = {
      base_length_sec: baseLengthSec,
      delivery_format: deliveryFormat,
      includes_master: includesMaster,
    };

    return {
      title: common.title,
      description: common.description,
      service_type: "Custom Song",
      price: common.price,
      duration_minutes: baseLengthSec >= 90 ? 120 : 60,
      service_category_slug: opts.serviceCategorySlug,
      details,
    };
  },
};

const venueDayHireConfig: ServiceTypeConfig = {
  slug: "venue_day_hire",
  label: "Venue",
  description: "Day hire for events, shoots, and gatherings.",
  serviceTypeLabel: "Other",
  fields: venueDayHireFields,
  buildPayload(common, typeFields, opts) {
    const toOptionalString = (v: unknown): string | undefined => {
      if (typeof v !== "string") return undefined;
      const t = v.trim();
      return t ? t : undefined;
    };

    const toOptionalPositiveInt = (v: unknown): number | undefined => {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return undefined;
      const i = Math.trunc(n);
      return i > 0 ? i : undefined;
    };

    const toOptionalNonNegativeMoney = (v: unknown): number | undefined => {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return undefined;
      const m = Math.max(0, Math.round(n));
      return m > 0 ? m : undefined;
    };

    const capacity = toOptionalPositiveInt(typeFields.capacity);
    const amenities = Array.isArray(typeFields.amenities)
      ? (typeFields.amenities as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    const house_rules_selected = Array.isArray(typeFields.house_rules_selected)
      ? (typeFields.house_rules_selected as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    const gallery_urls = Array.isArray(typeFields.gallery_urls)
      ? (typeFields.gallery_urls as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
      : [];

    const details: Record<string, any> = {
      duration_label: "Per day",
      capacity,
      venue_type: toOptionalString(typeFields.venue_type),
      address: toOptionalString(typeFields.address),
      amenities,
      cleaning_fee: toOptionalNonNegativeMoney(typeFields.cleaning_fee),
      overtime_rate: toOptionalNonNegativeMoney(typeFields.overtime_rate),
      house_rules_selected,
      house_rules: toOptionalString(typeFields.house_rules),
      cancellation_policy: toOptionalString(typeFields.cancellation_policy),
      gallery_urls,
    };

    return {
      title: common.title,
      description: common.description,
      service_type: "Other",
      price: common.price,
      // Represent a day hire. (Bookings use proposed_datetime_1 for the event date.)
      duration_minutes: 1440,
      service_category_slug: opts.serviceCategorySlug,
      details,
    };
  },
};

const otherConfig: ServiceTypeConfig = {
  slug: "other",
  label: "Other",
  description: "For services that don’t fit the predefined types.",
  serviceTypeLabel: "Other",
  fields: otherFields,
  buildPayload(common, typeFields, opts) {
    const details: Record<string, any> = {};
    if (typeFields.tags) details.tags = typeFields.tags;

    return {
      title: common.title,
      description: common.description,
      service_type: "Other",
      price: common.price,
      duration_minutes: 60,
      service_category_slug: opts.serviceCategorySlug,
      details,
    };
  },
};

const soundServiceConfig: ServiceTypeConfig = {
  slug: "sound_service_live",
  label: "Sound Service",
  description: "PA, stage, lighting, and backline packages.",
  serviceTypeLabel: "Other",
  fields: soundServiceFields,
  buildPayload(common, typeFields, opts) {
    // Seed defaults to keep sound pricing compatible with legacy shape
    const defaultAudiencePackages = [
      {
        id: "0_100",
        label: "0–100",
        active: true,
        indoor_base_zar: 2500,
        outdoor_base_zar: 3500,
        included: {
          pa: true,
          vocal_mics: 2,
          speech_mics: 2,
          console_basic: true,
          engineer_count: 1,
          lighting: "none",
          monitors: 0,
          di_boxes: 2,
          stands_and_cabling: true,
        },
      },
    ];

    const defaultStagePrices = { S: 100, M: 200, L: 300 };
    const defaultLightingPrices = { basic: 400, advanced: 800 };
    const defaultUnitAddons = {
      extra_vocal_mic_zar: 0,
      extra_speech_mic_zar: 0,
      extra_monitor_mix_zar: 0,
      extra_iem_pack_zar: 0,
      extra_di_box_zar: 0,
      lighting_tech_day_rate_zar: 0,
      advanced_includes_tech: true,
    };
    const defaultBacklinePrices: Record<string, any> = {
      drums_full: { enabled: false, price_zar: 1000 },
      drum_shells: { enabled: false, price_zar: 0 },
      guitar_amp: { enabled: false, price_zar: 1000 },
      bass_amp: { enabled: false, price_zar: 1000 },
      keyboard_amp: { enabled: false, price_zar: 0 },
      keyboard_stand: { enabled: false, price_zar: 0 },
      piano_digital_88: { enabled: false, price_zar: 2000 },
      piano_acoustic_upright: { enabled: false, price_zar: 0 },
      piano_acoustic_grand: { enabled: false, price_zar: 0 },
      dj_booth: { enabled: false, price_zar: 0 },
    };

    const coverageRaw = String(typeFields.coverage_areas || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const details: Record<string, any> = {
      short_summary: typeFields.short_summary || "",
      coverage_areas: coverageRaw,
      travel_fee_policy: typeFields.travel_fee_policy || "flat",
      travel_flat_amount:
        typeFields.travel_fee_policy === "flat"
          ? Number(typeFields.travel_flat_amount || 0)
          : undefined,
      travel_per_km_rate:
        typeFields.travel_fee_policy === "per_km"
          ? Number(typeFields.travel_per_km_rate || 0)
          : undefined,
      included_radius_km:
        typeFields.travel_fee_policy === "included_radius"
          ? Number(typeFields.included_radius_km || 0)
          : undefined,
      setup_minutes:
        typeFields.setup_minutes != null ? Number(typeFields.setup_minutes) : 30,
      teardown_minutes:
        typeFields.teardown_minutes != null
          ? Number(typeFields.teardown_minutes)
          : 30,
      crew_min:
        typeFields.crew_min != null ? Number(typeFields.crew_min) : 1,
      crew_typical:
        typeFields.crew_typical != null ? Number(typeFields.crew_typical) : 2,
      audience_packages:
        Array.isArray((opts.existing as any)?.details?.audience_packages) &&
        (opts.existing as any)?.details?.audience_packages.length
          ? (opts.existing as any)?.details?.audience_packages
          : defaultAudiencePackages,
      stage_prices:
        (opts.existing as any)?.details?.stage_prices || defaultStagePrices,
      lighting_prices:
        (opts.existing as any)?.details?.lighting_prices || defaultLightingPrices,
      addon_unit_prices:
        (opts.existing as any)?.details?.addon_unit_prices || defaultUnitAddons,
      backline_prices:
        (opts.existing as any)?.details?.backline_prices || defaultBacklinePrices,
    };

    return {
      title: common.title,
      description: common.description || details.short_summary || "",
      service_type: "Other",
      price: common.price,
      duration_minutes: 60,
      service_category_slug: opts.serviceCategorySlug,
      details,
    };
  },
};

const musicianLiveConfig: ServiceTypeConfig = {
  slug: "live_performance_musician",
  label: "Live Performance (Musician)",
  description: "Live shows with optional sound provisioning.",
  serviceTypeLabel: "Live Performance",
  fields: musicianLiveFields,
  buildPayload(common, typeFields, opts) {
    const baseDetails: Record<string, any> = {
      ...(opts.existing?.details as any),
    };
    const durationMinutes =
      typeFields.duration_minutes != null && typeFields.duration_minutes !== ""
        ? Number(typeFields.duration_minutes)
        : opts.existing?.duration_minutes ?? 60;

    const soundMode = typeFields.sound_mode || "artist_provides_variable";
    const soundProvisioning =
      soundMode === "artist_provides_variable"
        ? {
            mode: soundMode,
            price_driving_sound_zar:
              typeFields.price_driving_sound !== ""
                ? Number(typeFields.price_driving_sound || 0)
                : undefined,
            price_flying_sound_zar:
              typeFields.price_flying_sound !== ""
                ? Number(typeFields.price_flying_sound || 0)
                : undefined,
          }
        : {
            mode: soundMode,
            city_preferences: String(
              typeFields.sound_city_preferences || "",
            )
              .split(",")
              .map((c: string) => c.trim())
              .filter(Boolean)
              .map((city: string) => ({ city, provider_ids: [] })),
          };

    const travelRate =
      typeFields.travel_rate !== "" && typeFields.travel_rate != null
        ? Number(typeFields.travel_rate)
        : undefined;
    const travelMembers =
      typeFields.travel_members !== "" && typeFields.travel_members != null
        ? Number(typeFields.travel_members)
        : undefined;

    const details: Record<string, any> = {
      ...baseDetails,
      duration_label: `${durationMinutes} min`,
      sound_provisioning: soundProvisioning,
    };

    const existingTech = (baseDetails as any)?.tech_rider || {};
    const backlineKeys = String(typeFields.tech_backline_keys || "")
      .split(",")
      .map((k: string) => k.trim())
      .filter(Boolean);
    const backlineRequired =
      backlineKeys.length > 0
        ? backlineKeys.map((k: string) => ({ key: k, quantity: 1 }))
        : existingTech.backline?.required_keys;

    const techRider = {
      ...existingTech,
      stage: {
        ...(existingTech.stage || {}),
        cover_required: Boolean(typeFields.tech_stage_cover_required),
      },
      monitoring: {
        ...(existingTech.monitoring || {}),
        mixes:
          typeFields.tech_monitor_mixes !== "" &&
          typeFields.tech_monitor_mixes != null
            ? Number(typeFields.tech_monitor_mixes)
            : existingTech.monitoring?.mixes,
      },
      backline: {
        ...(existingTech.backline || {}),
        required_keys: backlineRequired,
      },
    };

    details.tech_rider = techRider;

    return {
      title: common.title,
      description: common.description,
      service_type: "Live Performance",
      price: common.price,
      duration_minutes: durationMinutes,
      travel_rate: travelRate,
      travel_members: travelMembers,
      service_category_slug: opts.serviceCategorySlug,
      details,
    };
  },
};

export const SERVICE_TYPE_REGISTRY: Record<ServiceTypeSlug, ServiceTypeConfig> =
  {
    live_performance: livePerformanceConfig,
    live_performance_musician: musicianLiveConfig,
    personalized_video: personalizedVideoConfig,
    custom_song: customSongConfig,
    venue_day_hire: venueDayHireConfig,
    other: otherConfig,
    sound_service_live: soundServiceConfig,
  };

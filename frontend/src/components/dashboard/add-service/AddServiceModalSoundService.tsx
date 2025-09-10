"use client";

import SafeImage from "@/components/ui/SafeImage";
import { useMemo, useState } from "react";
import { TextInput, TextArea, CollapsibleSection, ToggleSwitch } from "@/components/ui";
import type { Service } from "@/types";
import BaseServiceWizard, { type WizardStep } from "./BaseServiceWizard";
import { DEFAULT_CURRENCY } from "@/lib/constants";

// ────────────────────────────────────────────────────────────────────────────────
// New pricing model: Packages by Audience Tier (+ Add-ons)
// • Removes single list price
// • Each audience band has Indoor & Outdoor base prices
// • Add-ons: Stage S/M/L, Lighting (Basic/Advanced), Backline presets, Custom add-ons
// • Client only answers: indoor/outdoor + add-ons (stage, lights, backline)
// ────────────────────────────────────────────────────────────────────────────────

// Logistics & travel
type TravelPolicy = "flat" | "per_km" | "included_radius";
type PowerPhase = "single" | "three" | "";

// Audience bands used to build packages
export type AudienceBandId = "0_100" | "101_200" | "201_500" | "501_1000" | "1000_plus";

interface AudiencePackage {
  id: AudienceBandId;
  label: string; // e.g., "0–100"
  active: boolean; // provider can disable a band they don't serve
  indoor_base_zar: number | "";
  outdoor_base_zar: number | "";
  inclusions: string[]; // shown to client (e.g., "1x wireless mic, PA sized for audience")
}

// Structured add-ons
type StageSize = "S" | "M" | "L";
interface StagePrices { S: number | ""; M: number | ""; L: number | "" }

type LightingLevel = "basic" | "advanced";
interface LightingPrices { basic: number | ""; advanced: number | "" }

interface BacklineItem { name: string; price_zar: number | ""; enabled: boolean }
interface CustomAddon { name: string; price_zar: number | "" }

// Backwards-compat placeholders (preserved if editing an old record; not used in UI)
interface PackageAddonLegacy { name: string; price: number | "" }
interface ServicePackageLegacy {
  name: string;
  inclusions: string[];
  base_price_zar: number | "";
  overtime_rate_zar_per_hour: number | "";
  addons: PackageAddonLegacy[];
  notes?: string;
}

// Main form model
interface SoundServiceForm {
  // Basics
  title: string; // Service Name (public)
  short_summary: string; // <= 120 chars
  tags: string[];

  // Coverage & Logistics
  coverage_areas: string[]; // city codes
  travel_fee_policy: TravelPolicy;
  travel_flat_amount?: number | "";
  travel_per_km_rate?: number | "";
  included_radius_km?: number | "";
  setup_minutes: number | "";
  teardown_minutes: number | "";
  crew_min: number | "";
  crew_typical: number | "";
  power_amps: number | "";
  power_phase: PowerPhase;
  vehicle_access_notes: string;

  // Capabilities & Inventory (for matching/marketing)
  console_brands: string[];
  console_models: string;
  pa_types: ("line_array" | "point_source")[];
  microphones: string; // freeform types + counts
  di_boxes: number | "";
  monitoring_wedges: number | "";
  monitoring_iem_support: boolean;
  monitoring_iem_brands: string[];
  backline_notes: string;

  // New pricing model
  audience_packages: AudiencePackage[];    // indoor/outdoor base by band
  stage_prices: StagePrices;               // S/M/L
  lighting_prices: LightingPrices;         // basic/advanced
  backline_menu: BacklineItem[];           // preset menu with enable+price
  custom_addons: CustomAddon[];            // arbitrary add-ons

  // SLAs & Availability
  response_sla_hours: number | "";
  min_notice_days: number | "";
  availability_sync_url?: string;
  default_response_timeout_hours: number | "";
  auto_accept_threshold: boolean;

  // Legacy data for backwards compatibility (not shown in UI but preserved on edit)
  packages_legacy?: ServicePackageLegacy[];
}

// ─── Presets ───────────────────────────────────────────────────────────────────
const KNOWN_CONSOLE_BRANDS = ["Yamaha", "Midas", "Behringer", "Avid", "Allen & Heath", "Soundcraft"];
const IEM_BRANDS = ["Shure", "Sennheiser", "LD Systems", "Behringer"];
const CITY_CODES = ["CPT", "JNB", "DBN", "PLZ", "GRJ", "ELS", "MQP", "BFN", "KIM"];
const TAG_PRESETS = ["weddings", "corporate", "festivals", "birthday", "conference", "club", "church"];

const AUDIENCE_BANDS: { id: AudienceBandId; label: string }[] = [
  { id: "0_100", label: "0–100" },
  { id: "101_200", label: "101–200" },
  { id: "201_500", label: "201–500" },
  { id: "501_1000", label: "501–1000" },
  { id: "1000_plus", label: "1000+" },
];

const DEFAULT_INCLUSIONS_PER_BAND = (label: string) => [
  `PA sized for ${label} guests`,
  "1× vocal mic (wired or wireless)",
  "Basic mixing console + cabling",
  "On-site sound engineer",
];

const DEFAULT_STAGE_PRICES: StagePrices = { S: 100, M: 200, L: 300 };
const DEFAULT_LIGHTING_PRICES: LightingPrices = { basic: 400, advanced: 800 };
// Backline examples from prompt
const DEFAULT_BACKLINE_MENU: BacklineItem[] = [
  { name: "Full drum kit", price_zar: 1000, enabled: false },
  { name: "Guitar amp", price_zar: 1000, enabled: false },
  { name: "Piano/Keyboard", price_zar: 2000, enabled: false },
];

function mkDefaultAudiencePackages(): AudiencePackage[] {
  return AUDIENCE_BANDS.map(({ id, label }) => ({
    id,
    label,
    active: true,
    // Example defaults from prompt for 0–100 (Indoor 2500, Outdoor 3500). Others blank for provider to fill.
    indoor_base_zar: id === "0_100" ? 2500 : "",
    outdoor_base_zar: id === "0_100" ? 3500 : "",
    inclusions: DEFAULT_INCLUSIONS_PER_BAND(label),
  }));
}

// ─── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULTS: SoundServiceForm = {
  title: "",
  short_summary: "",
  tags: [],
  coverage_areas: [],
  travel_fee_policy: "flat",
  travel_flat_amount: "",
  travel_per_km_rate: "",
  included_radius_km: "",
  setup_minutes: 30,
  teardown_minutes: 30,
  crew_min: 1,
  crew_typical: 2,
  power_amps: 16,
  power_phase: "single",
  vehicle_access_notes: "",
  console_brands: [],
  console_models: "",
  pa_types: [],
  microphones: "",
  di_boxes: "",
  monitoring_wedges: "",
  monitoring_iem_support: false,
  monitoring_iem_brands: [],
  backline_notes: "",
  // Pricing model
  audience_packages: mkDefaultAudiencePackages(),
  stage_prices: DEFAULT_STAGE_PRICES,
  lighting_prices: DEFAULT_LIGHTING_PRICES,
  backline_menu: DEFAULT_BACKLINE_MENU,
  custom_addons: [],
  // SLAs
  response_sla_hours: 24,
  min_notice_days: 3,
  availability_sync_url: "",
  default_response_timeout_hours: 48,
  auto_accept_threshold: false,
  // legacy hidden
  packages_legacy: [],
};

// ─── Component ─────────────────────────────────────────────────────────────────
export default function AddServiceModalSoundService({
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
  // Collapsible section open state
  const [travelOpen, setTravelOpen] = useState(true);
  const [consolesOpen, setConsolesOpen] = useState(true);
  const [paOpen, setPaOpen] = useState(true);
  const [monitoringOpen, setMonitoringOpen] = useState(false);

  const defaults: SoundServiceForm = useMemo(() => {
    if (!service) return DEFAULTS;

    // Attempt to hydrate from existing service shape
    const det: any = (service.details as any) || {};
    const logistics = det.logistics || {};
    const capabilities = det.capabilities || {};
    const consoles = capabilities.consoles || {};
    const pa = capabilities.pa || {};
    const monitoring = capabilities.monitoring || {};
    const travel = det.travel || det.coverage?.travel || {};
    const coverageAreas = det.coverage_areas || det.coverage?.areas || [];
    const sla = det.sla || {};

    // New fields (with fallbacks)
    const audience_packages: AudiencePackage[] = Array.isArray(det.audience_packages)
      ? det.audience_packages
      : mkDefaultAudiencePackages();

    const stage_prices: StagePrices = det.stage_prices || DEFAULT_STAGE_PRICES;
    const lighting_prices: LightingPrices = det.lighting_prices || DEFAULT_LIGHTING_PRICES;

    const backline_menu: BacklineItem[] = Array.isArray(det.backline_menu)
      ? det.backline_menu
      : DEFAULT_BACKLINE_MENU;

    const custom_addons: CustomAddon[] = Array.isArray(det.custom_addons) ? det.custom_addons : [];

    // Backwards compatibility: keep legacy packages if present (not shown in UI)
    const packages_legacy: ServicePackageLegacy[] = Array.isArray(det.packages)
      ? (det.packages as any[]).map((p: any) => ({
          name: p.name || "",
          inclusions: Array.isArray(p.inclusions) ? p.inclusions : [],
          base_price_zar: p.base_price_zar ?? "",
          overtime_rate_zar_per_hour: p.overtime_rate_zar_per_hour ?? "",
          addons: Array.isArray(p.addons)
            ? p.addons.map((a: any) => ({ name: a.name || "", price: a.price ?? "" }))
            : [],
          notes: p.notes || "",
        }))
      : [];

    return {
      ...DEFAULTS,
      title: service.title,
      short_summary: (service as any)?.short_summary || det.short_summary || det.shortSummary || "",
      tags: det.tags || [],
      // Coverage & travel
      coverage_areas: coverageAreas || [],
      travel_fee_policy: (travel.policy as TravelPolicy) || DEFAULTS.travel_fee_policy,
      travel_flat_amount: travel.flat_amount ?? (travel.flatAmount as any) ?? DEFAULTS.travel_flat_amount,
      travel_per_km_rate: travel.per_km_rate ?? (travel.perKmRate as any) ?? DEFAULTS.travel_per_km_rate,
      included_radius_km:
        travel.included_radius_km ?? (travel.includedRadiusKm as any) ?? DEFAULTS.included_radius_km,
      // Logistics
      setup_minutes: logistics.setup_minutes ?? DEFAULTS.setup_minutes,
      teardown_minutes: logistics.teardown_minutes ?? DEFAULTS.teardown_minutes,
      crew_min: logistics.crew_min ?? DEFAULTS.crew_min,
      crew_typical: logistics.crew_typical ?? DEFAULTS.crew_typical,
      power_amps: logistics.power_amps ?? DEFAULTS.power_amps,
      power_phase: (logistics.power_phase as PowerPhase) ?? DEFAULTS.power_phase,
      vehicle_access_notes: logistics.vehicle_access_notes || "",
      // Capabilities
      console_brands: consoles.brands || [],
      console_models: consoles.models || "",
      pa_types: (pa.types as any) || [],
      microphones: capabilities.microphones || "",
      di_boxes: capabilities.di_boxes ?? DEFAULTS.di_boxes,
      monitoring_wedges: monitoring.wedges ?? DEFAULTS.monitoring_wedges,
      monitoring_iem_support: !!monitoring.iem_support,
      monitoring_iem_brands: monitoring.brands || [],
      backline_notes: (capabilities.backline?.notes as string) || "",
      // Pricing model
      audience_packages,
      stage_prices,
      lighting_prices,
      backline_menu,
      custom_addons,
      // SLAs
      response_sla_hours: sla.response_sla_hours ?? DEFAULTS.response_sla_hours,
      min_notice_days: sla.min_notice_days ?? DEFAULTS.min_notice_days,
      availability_sync_url: sla.availability_sync_url || "",
      default_response_timeout_hours:
        sla.default_response_timeout_hours ?? DEFAULTS.default_response_timeout_hours,
      auto_accept_threshold: !!sla.auto_accept_threshold,
      // legacy
      packages_legacy,
    } as SoundServiceForm;
  }, [service]);

  // ─── Wizard Steps ────────────────────────────────────────────────────────────
  const steps: WizardStep<SoundServiceForm>[] = [
    {
      label: "Basics",
      fields: ["title", "short_summary", "tags"],
      render: ({ form }) => {
        const title = form.watch("title") || "";
        const summary = form.watch("short_summary") || "";
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Basics</h2>
            <div className="rounded-md border p-3 text-sm text-gray-700">
              <p>
                Service Type: <span className="font-medium">Sound</span> (locked)
              </p>
            </div>
            <TextInput
              label="Service Name (public)"
              placeholder="e.g., PA + Engineer (Tiered Packages)"
              {...form.register("title", {
                required: "Name is required",
                validate: (v) => {
                  const n = (v || "").trim().length;
                  if (n < 5) return `Need ${5 - n} more characters`;
                  if (n > 80) return `Remove ${n - 80} characters`;
                  return true;
                },
              })}
              error={(form.formState.errors as any)?.title?.message as string}
            />
            <div className="space-y-1">
              <TextArea
                id="short_summary"
                label="Short Summary (max 120 chars)"
                rows={2}
                placeholder="Packages by audience size + add-ons (stage, lights, backline)"
                {...form.register("short_summary", {
                  required: "Short summary is required",
                  validate: (v) => ((v || "").trim().length <= 120 ? true : "Keep under 120 characters"),
                })}
                error={(form.formState.errors as any)?.short_summary?.message as string}
              />
              <p className="text-right text-xs text-gray-500">{summary.length}/120</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Tags</label>
              <ChipsInput
                values={form.watch("tags") || []}
                onChange={(vals) => form.setValue("tags", vals, { shouldDirty: true })}
                placeholder="Add tags like weddings, corporate, festivals"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {TAG_PRESETS.map((t) => (
                  <CheckboxPill
                    key={t}
                    checked={(form.watch("tags") || []).includes(t)}
                    onChange={() => {
                      const set = new Set<string>((form.watch("tags") || []) as string[]);
                      if (set.has(t)) set.delete(t);
                      else set.add(t);
                      form.setValue("tags", Array.from(set), { shouldDirty: true });
                    }}
                    label={t}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-md border p-3 text-xs text-gray-600">
              <p>
                Pricing is configured per audience band (indoor/outdoor) and optional add-ons. Clients will only
                need to pick indoor/outdoor and select add-ons.
              </p>
            </div>
            <div className="mt-1 text-xs text-gray-500">{title.length}/80</div>
          </div>
        );
      },
    },
    {
      label: "Media",
      validate: ({ mediaFiles, existingMediaUrl, mediaError }) => {
        const count = mediaFiles.length + (existingMediaUrl ? 1 : 0);
        if (mediaError) return false;
        if (count === 0) return false;
        if (count > 7) return false; // 1 hero + up to 6 gallery
        return true;
      },
      render: ({ onFileChange, removeFile, mediaError, thumbnails, existingMediaUrl, removeExistingMedia }) => (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Hero + Gallery</h2>
          <p className="text-sm text-gray-600">First image is the hero. Up to 7 total (1 hero + 6 gallery).</p>
          <label
            htmlFor="media-upload"
            className="flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 text-center"
          >
            <p className="text-sm">Media: Drag images here or click to upload</p>
            <input
              id="media-upload"
              aria-label="Media"
              data-testid="media-input"
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => onFileChange(e.target.files)}
            />
          </label>
          {mediaError && <p className="mt-2 text-sm text-red-600">{mediaError}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {existingMediaUrl && (
              <div className="relative h-20 w-20 overflow-hidden rounded border">
                <SafeImage src={existingMediaUrl} alt="existing-media" width={80} height={80} className="h-full w-full object-cover" />
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">Hero</span>
                <button type="button" onClick={removeExistingMedia} className="absolute right-0 top-0 h-4 w-4 rounded-full bg-black/50 text-xs text-white">×</button>
              </div>
            )}
            {thumbnails.map((src, i) => (
              <div key={i} className="relative h-20 w-20 overflow-hidden rounded border">
                <SafeImage src={src} alt={`media-${i}`} width={80} height={80} className="h-full w-full object-cover" />
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{i === 0 && !existingMediaUrl ? "Hero" : "Gallery"}</span>
                <button type="button" onClick={() => removeFile(i)} className="absolute right-0 top-0 h-4 w-4 rounded-full bg-black/50 text-xs text-white">×</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">Maximum 7 images total.</p>
        </div>
      ),
    },
    {
      label: "Audience Packages",
      fields: ["audience_packages"],
      render: ({ form }) => {
        const pkgs: AudiencePackage[] = form.watch("audience_packages") || [];
        const setPkgs = (next: AudiencePackage[]) => form.setValue("audience_packages", next, { shouldDirty: true });
        const update = (i: number, patch: Partial<AudiencePackage>) => {
          const next = [...pkgs];
          next[i] = { ...next[i], ...patch } as AudiencePackage;
          setPkgs(next);
        };
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Audience Packages (Indoor/Outdoor)</h2>
            <p className="text-sm text-gray-600">Set base prices per audience band. Inclusions appear on the client quote.</p>
            <div className="space-y-3">
              {pkgs.map((p, i) => (
                <div key={p.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">{p.label} guests</div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-600">Active</span>
                      <ToggleSwitch checked={!!p.active} onChange={(v) => update(i, { active: v })} />
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <TextInput
                      label={`Indoor base (${DEFAULT_CURRENCY})`}
                      type="number"
                      value={String(p.indoor_base_zar ?? "")}
                      onChange={(e) =>
                        update(i, { indoor_base_zar: e.target.value === "" ? "" : Number(e.target.value) })
                      }
                    />
                    <TextInput
                      label={`Outdoor base (${DEFAULT_CURRENCY})`}
                      type="number"
                      value={String(p.outdoor_base_zar ?? "")}
                      onChange={(e) =>
                        update(i, { outdoor_base_zar: e.target.value === "" ? "" : Number(e.target.value) })
                      }
                    />
                    <TextArea
                      label="Inclusions (one per line)"
                      rows={3}
                      value={(p.inclusions || []).join("\n")}
                      onChange={(e) =>
                        update(i, { inclusions: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      },
    },
    {
      label: "Add-ons",
      fields: ["stage_prices", "lighting_prices", "backline_menu", "custom_addons"],
      render: ({ form }) => {
        // Stage prices
        const stage = form.watch("stage_prices") as StagePrices;
        const setStage = (patch: Partial<StagePrices>) =>
          form.setValue("stage_prices", { ...stage, ...patch }, { shouldDirty: true });

        // Lighting prices
        const lighting = form.watch("lighting_prices") as LightingPrices;
        const setLighting = (patch: Partial<LightingPrices>) =>
          form.setValue("lighting_prices", { ...lighting, ...patch }, { shouldDirty: true });

        // Backline menu
        const backline: BacklineItem[] = form.watch("backline_menu") || [];
        const setBackline = (next: BacklineItem[]) => form.setValue("backline_menu", next, { shouldDirty: true });
        const updateBackline = (i: number, patch: Partial<BacklineItem>) => {
          const next = [...backline];
          next[i] = { ...next[i], ...patch } as BacklineItem;
          setBackline(next);
        };
        const addBackline = () =>
          setBackline([...(backline || []), { name: "", price_zar: "", enabled: true }]);
        const removeBackline = (i: number) => setBackline(backline.filter((_, idx) => idx !== i));

        // Custom add-ons
        const customs: CustomAddon[] = form.watch("custom_addons") || [];
        const setCustoms = (next: CustomAddon[]) => form.setValue("custom_addons", next, { shouldDirty: true });
        const updateCustom = (i: number, patch: Partial<CustomAddon>) => {
          const next = [...customs];
          next[i] = { ...next[i], ...patch } as CustomAddon;
          setCustoms(next);
        };
        const addCustom = () => setCustoms([...(customs || []), { name: "", price_zar: "" }]);
        const removeCustom = (i: number) => setCustoms(customs.filter((_, idx) => idx !== i));

        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Add-ons</h2>

            {/* Stage */}
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">Stage (S / M / L)</div>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextInput
                  label={`Small (${DEFAULT_CURRENCY})`}
                  type="number"
                  value={String(stage.S ?? "")}
                  onChange={(e) => setStage({ S: e.target.value === "" ? "" : Number(e.target.value) })}
                />
                <TextInput
                  label={`Medium (${DEFAULT_CURRENCY})`}
                  type="number"
                  value={String(stage.M ?? "")}
                  onChange={(e) => setStage({ M: e.target.value === "" ? "" : Number(e.target.value) })}
                />
                <TextInput
                  label={`Large (${DEFAULT_CURRENCY})`}
                  type="number"
                  value={String(stage.L ?? "")}
                  onChange={(e) => setStage({ L: e.target.value === "" ? "" : Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Lighting */}
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">Lighting</div>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput
                  label={`Basic (${DEFAULT_CURRENCY})`}
                  type="number"
                  value={String(lighting.basic ?? "")}
                  onChange={(e) => setLighting({ basic: e.target.value === "" ? "" : Number(e.target.value) })}
                />
                <TextInput
                  label={`Advanced (${DEFAULT_CURRENCY})`}
                  type="number"
                  value={String(lighting.advanced ?? "")}
                  onChange={(e) => setLighting({ advanced: e.target.value === "" ? "" : Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Backline menu */}
            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Backline menu</div>
              <div className="space-y-2">
                {(backline || []).map((b, i) => (
                  <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-8">
                    <div className="sm:col-span-4">
                      <TextInput label="Name" value={b.name} onChange={(e) => updateBackline(i, { name: e.target.value })} />
                    </div>
                    <div className="sm:col-span-3">
                      <TextInput
                        label={`Price (${DEFAULT_CURRENCY})`}
                        type="number"
                        value={String(b.price_zar ?? "")}
                        onChange={(e) => updateBackline(i, { price_zar: e.target.value === "" ? "" : Number(e.target.value) })}
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <div className="flex items-center gap-2">
                        <ToggleSwitch checked={!!b.enabled} onChange={(v) => updateBackline(i, { enabled: v })} />
                        <span className="text-xs text-gray-600">Enabled</span>
                      </div>
                    </div>
                    <div className="sm:col-span-8 -mt-1 flex justify-end">
                      <button type="button" className="text-xs text-red-600" onClick={() => removeBackline(i)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <button type="button" className="text-xs text-brand" onClick={addBackline}>
                  + Add backline item
                </button>
              </div>
              <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600">
                Examples: Full drum kit (R1000), Guitar amp (R1000), Piano (R2000)
              </div>
            </div>

            {/* Custom add-ons */}
            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Custom add-ons</div>
              <div className="space-y-2">
                {(customs || []).map((a, ai) => (
                  <div key={ai} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                    <div className="sm:col-span-3">
                      <TextInput label="Name" value={a.name} onChange={(e) => updateCustom(ai, { name: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <TextInput
                        label={`Price (${DEFAULT_CURRENCY})`}
                        type="number"
                        value={String(a.price_zar ?? "")}
                        onChange={(e) => updateCustom(ai, { price_zar: e.target.value === "" ? "" : Number(e.target.value) })}
                      />
                    </div>
                    <div className="sm:col-span-5 -mt-1 flex justify-end">
                      <button type="button" className="text-xs text-red-600" onClick={() => removeCustom(ai)}>
                        Remove add-on
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <button type="button" className="text-xs text-brand" onClick={addCustom}>
                  + Add custom add-on
                </button>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      label: "Coverage & Logistics",
      fields: [
        "coverage_areas",
        "travel_fee_policy",
        "setup_minutes",
        "teardown_minutes",
        "crew_min",
        "crew_typical",
        "power_amps",
        "power_phase",
      ],
      render: ({ form }) => {
        const policy = form.watch("travel_fee_policy");
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Coverage & Logistics</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700">Coverage Areas (city codes)</label>
              <ChipsInput
                values={form.watch("coverage_areas") || []}
                onChange={(vals) => form.setValue("coverage_areas", vals, { shouldDirty: true })}
                placeholder="e.g., CPT, JNB, DBN"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {CITY_CODES.map((c) => (
                  <CheckboxPill
                    key={c}
                    checked={(form.watch("coverage_areas") || []).includes(c)}
                    onChange={() => {
                      const set = new Set<string>((form.watch("coverage_areas") || []) as string[]);
                      if (set.has(c)) set.delete(c);
                      else set.add(c);
                      form.setValue("coverage_areas", Array.from(set), { shouldDirty: true });
                    }}
                    label={c}
                  />
                ))}
              </div>
            </div>

            <CollapsibleSection title="Travel fee policy" open={travelOpen} onToggle={() => setTravelOpen((o) => !o)}>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-3 text-sm">
                  <RadioPill
                    name="travel_fee_policy"
                    value="flat"
                    current={policy}
                    onChange={(v) => form.setValue("travel_fee_policy", v as TravelPolicy, { shouldDirty: true })}
                    label="Flat call-out"
                  />
                  <RadioPill
                    name="travel_fee_policy"
                    value="per_km"
                    current={policy}
                    onChange={(v) => form.setValue("travel_fee_policy", v as TravelPolicy, { shouldDirty: true })}
                    label="Per-km"
                  />
                  <RadioPill
                    name="travel_fee_policy"
                    value="included_radius"
                    current={policy}
                    onChange={(v) => form.setValue("travel_fee_policy", v as TravelPolicy, { shouldDirty: true })}
                    label="Included radius"
                  />
                </div>
                {policy === "flat" && (
                  <TextInput
                    label={`Flat call-out (${DEFAULT_CURRENCY})`}
                    type="number"
                    step="0.01"
                    {...form.register("travel_flat_amount", { valueAsNumber: true })}
                  />
                )}
                {policy === "per_km" && (
                  <TextInput
                    label={`Rate per km (${DEFAULT_CURRENCY}/km)`}
                    type="number"
                    step="0.1"
                    {...form.register("travel_per_km_rate", { valueAsNumber: true })}
                  />
                )}
                {policy === "included_radius" && (
                  <TextInput
                    label="Included radius (km)"
                    type="number"
                    step="1"
                    {...form.register("included_radius_km", { valueAsNumber: true })}
                  />
                )}
              </div>
            </CollapsibleSection>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput label="Setup duration (mins)" type="number" {...form.register("setup_minutes", { valueAsNumber: true })} />
              <TextInput label="Teardown duration (mins)" type="number" {...form.register("teardown_minutes", { valueAsNumber: true })} />
              <TextInput label="On-site crew (min)" type="number" {...form.register("crew_min", { valueAsNumber: true })} />
              <TextInput label="On-site crew (typical)" type="number" {...form.register("crew_typical", { valueAsNumber: true })} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <TextInput label="Power requirements (amps)" type="number" {...form.register("power_amps", { valueAsNumber: true })} />
              <div>
                <label className="block text-sm font-medium text-gray-700">Power phase</label>
                <div className="mt-1 flex gap-2 text-sm">
                  {[
                    { v: "single", l: "Single" },
                    { v: "three", l: "Three" },
                  ].map((o) => (
                    <RadioPill
                      key={o.v}
                      name="power_phase"
                      value={o.v}
                      current={form.watch("power_phase")}
                      onChange={(v) => form.setValue("power_phase", v as PowerPhase, { shouldDirty: true })}
                      label={o.l}
                    />
                  ))}
                </div>
              </div>
              <TextInput label="Vehicle access notes" placeholder="e.g., Loading bay restrictions" {...form.register("vehicle_access_notes")} />
            </div>
          </div>
        );
      },
    },
    {
      label: "Capabilities & Inventory",
      fields: ["console_brands", "pa_types"],
      render: ({ form }) => {
        const toggleArray = (name: keyof SoundServiceForm, val: string) => {
          const arr = new Set<string>((form.getValues(name as any) as any[]) || []);
          if (arr.has(val)) arr.delete(val);
          else arr.add(val);
          form.setValue(name as any, Array.from(arr), { shouldDirty: true });
        };
        const capabilitiesPreview = {
          consoles: {
            brands: form.watch("console_brands"),
            models: form.watch("console_models"),
          },
          pa: {
            types: form.watch("pa_types"),
          },
          microphones: form.watch("microphones"),
          di_boxes: Number(form.watch("di_boxes") || 0),
          monitoring: {
            wedges: Number(form.watch("monitoring_wedges") || 0),
            iem_support: !!form.watch("monitoring_iem_support"),
            brands: form.watch("monitoring_iem_brands"),
          },
          backline: {
            notes: form.watch("backline_notes"),
          },
          tags: form.watch("tags"),
        };
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Capabilities & Inventory</h2>

            <CollapsibleSection title="Console brands/models" open={consolesOpen} onToggle={() => setConsolesOpen((o) => !o)}>
              <div className="flex flex-wrap gap-2">
                {KNOWN_CONSOLE_BRANDS.map((b) => (
                  <CheckboxPill
                    key={b}
                    checked={(form.watch("console_brands") || []).includes(b)}
                    onChange={() => toggleArray("console_brands", b)}
                    label={b}
                  />
                ))}
              </div>
              <TextInput label="Models (freeform)" placeholder="e.g., M32, CL5, SQ5" {...form.register("console_models")} />
            </CollapsibleSection>

            <CollapsibleSection title="PA types" open={paOpen} onToggle={() => setPaOpen((o) => !o)}>
              <div className="flex gap-2">
                {[
                  { v: "line_array", l: "Line array" },
                  { v: "point_source", l: "Point source" },
                ].map((o) => (
                  <CheckboxPill
                    key={o.v}
                    checked={(form.watch("pa_types") || []).includes(o.v as any)}
                    onChange={() => toggleArray("pa_types", o.v)}
                    label={o.l}
                  />
                ))}
              </div>
            </CollapsibleSection>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput label="Microphones (types + counts)" placeholder="e.g., 4x SM58, 2x e935, 1x KM184" {...form.register("microphones")} />
              <TextInput label="DI boxes (count)" type="number" {...form.register("di_boxes", { valueAsNumber: true })} />
            </div>

            <CollapsibleSection title="Monitoring" open={monitoringOpen} onToggle={() => setMonitoringOpen((o) => !o)}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextInput label="Wedges (count)" type="number" {...form.register("monitoring_wedges", { valueAsNumber: true })} />
                <div className="flex items-end gap-2">
                  <ToggleSwitch
                    checked={!!form.watch("monitoring_iem_support")}
                    onChange={(v) => form.setValue("monitoring_iem_support", v, { shouldDirty: true })}
                    label="IEM support"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">IEM brands</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {IEM_BRANDS.map((b) => (
                      <CheckboxPill
                        key={b}
                        checked={(form.watch("monitoring_iem_brands") || []).includes(b)}
                        onChange={() => toggleArray("monitoring_iem_brands", b)}
                        label={b}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <TextArea id="backline_notes" label="Backline notes" rows={2} placeholder="Any specifics or brand models" {...form.register("backline_notes")} />

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">JSON “capabilities” preview</label>
              <pre className="max-h-60 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800">{JSON.stringify(capabilitiesPreview, null, 2)}</pre>
            </div>
          </div>
        );
      },
    },
    {
      label: "SLAs & Availability",
      fields: [
        "response_sla_hours",
        "min_notice_days",
        "availability_sync_url",
        "default_response_timeout_hours",
        "auto_accept_threshold",
      ],
      render: ({ form }) => (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">SLAs & Availability</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput label="Response SLA (hours)" type="number" {...form.register("response_sla_hours", { valueAsNumber: true })} />
            <TextInput label="Minimum notice (days)" type="number" {...form.register("min_notice_days", { valueAsNumber: true })} />
            <TextInput label="Availability sync URL (ICS/webhook)" {...form.register("availability_sync_url")} />
            <TextInput
              label="Default response timeout (hours)"
              type="number"
              {...form.register("default_response_timeout_hours", { valueAsNumber: true })}
            />
            <div className="flex items-end">
              <ToggleSwitch
                checked={!!form.watch("auto_accept_threshold")}
                onChange={(v) => form.setValue("auto_accept_threshold", v, { shouldDirty: true })}
                label="Auto-accept if tech rider match and not double-booked"
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      label: "Review",
      render: ({ form, thumbnails }) => {
        const hero = thumbnails[0] || null;
        const pkgs = (form.getValues("audience_packages") || []) as AudiencePackage[];
        const stage = form.getValues("stage_prices") as StagePrices;
        const lighting = form.getValues("lighting_prices") as LightingPrices;
        const backline = (form.getValues("backline_menu") || []) as BacklineItem[];
        const customs = (form.getValues("custom_addons") || []) as CustomAddon[];
        return (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Review</h2>
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">Basics</div>
              <div>Name: {form.getValues("title")}</div>
              <div>Summary: {form.getValues("short_summary")}</div>
              <div>Tags: {(form.getValues("tags") || []).join(", ")}</div>
            </div>

            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">Audience packages</div>
              <div className="mt-1 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="py-1 pr-3">Band</th>
                      <th className="py-1 pr-3">Active</th>
                      <th className="py-1 pr-3">Indoor ({DEFAULT_CURRENCY})</th>
                      <th className="py-1 pr-3">Outdoor ({DEFAULT_CURRENCY})</th>
                      <th className="py-1 pr-3">Inclusions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkgs.map((p) => (
                      <tr key={p.id}>
                        <td className="py-1 pr-3">{p.label}</td>
                        <td className="py-1 pr-3">{p.active ? "Yes" : "No"}</td>
                        <td className="py-1 pr-3">{String(p.indoor_base_zar || "—")}</td>
                        <td className="py-1 pr-3">{String(p.outdoor_base_zar || "—")}</td>
                        <td className="py-1 pr-3">{(p.inclusions || []).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">Add-ons</div>
              <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded bg-gray-50 p-2">
                  <div className="text-xs font-medium">Stage</div>
                  <div className="mt-1 text-xs">S: {String(stage.S || "—")} {DEFAULT_CURRENCY}</div>
                  <div className="text-xs">M: {String(stage.M || "—")} {DEFAULT_CURRENCY}</div>
                  <div className="text-xs">L: {String(stage.L || "—")} {DEFAULT_CURRENCY}</div>
                </div>
                <div className="rounded bg-gray-50 p-2">
                  <div className="text-xs font-medium">Lighting</div>
                  <div className="mt-1 text-xs">Basic: {String(lighting.basic || "—")} {DEFAULT_CURRENCY}</div>
                  <div className="text-xs">Advanced: {String(lighting.advanced || "—")} {DEFAULT_CURRENCY}</div>
                </div>
                <div className="rounded bg-gray-50 p-2">
                  <div className="text-xs font-medium">Backline</div>
                  <ul className="mt-1 list-disc pl-4 text-xs">
                    {backline.filter((b) => b.enabled).map((b, i) => (
                      <li key={i}>{b.name}: {String(b.price_zar || "—")} {DEFAULT_CURRENCY}</li>
                    ))}
                    {backline.filter((b) => !b.enabled).length === 0 && <li className="text-gray-500">None enabled</li>}
                  </ul>
                </div>
              </div>
              {customs.length > 0 && (
                <div className="mt-2 rounded bg-gray-50 p-2 text-xs">
                  <div className="font-medium">Custom add-ons</div>
                  <ul className="mt-1 list-disc pl-4">
                    {customs.map((c, i) => (
                      <li key={i}>{c.name}: {String(c.price_zar || "—")} {DEFAULT_CURRENCY}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">Coverage & Logistics</div>
              <div>Areas: {(form.getValues("coverage_areas") || []).join(", ")}</div>
              <div>Travel policy: {form.getValues("travel_fee_policy")}</div>
              <div>
                Setup/Teardown: {String(form.getValues("setup_minutes"))} / {String(form.getValues("teardown_minutes"))} mins
              </div>
              <div>
                Crew: min {String(form.getValues("crew_min"))}, typical {String(form.getValues("crew_typical"))}
              </div>
              <div>
                Power: {String(form.getValues("power_amps"))}A / {String(form.getValues("power_phase"))} phase
              </div>
            </div>

            {hero && (
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">Hero image</div>
                <SafeImage src={hero} alt="hero" width={128} height={96} className="h-24 w-32 rounded object-cover" />
              </div>
            )}
          </div>
        );
      },
    },
  ];

  // Map to a backend-friendly payload. Extended fields go under `details`.
  const toPayload = (data: SoundServiceForm, mediaUrl: string | null): Partial<Service> => {
    const details: any = {
      short_summary: data.short_summary,
      tags: data.tags,
      coverage_areas: data.coverage_areas,
      travel: {
        policy: data.travel_fee_policy,
        flat_amount: numOrNull(data.travel_flat_amount),
        per_km_rate: numOrNull(data.travel_per_km_rate),
        included_radius_km: numOrNull(data.included_radius_km),
      },
      logistics: {
        setup_minutes: numOrNull(data.setup_minutes),
        teardown_minutes: numOrNull(data.teardown_minutes),
        crew_min: numOrNull(data.crew_min),
        crew_typical: numOrNull(data.crew_typical),
        power_amps: numOrNull(data.power_amps),
        power_phase: data.power_phase,
        vehicle_access_notes: data.vehicle_access_notes,
      },
      capabilities: {
        consoles: { brands: data.console_brands, models: data.console_models },
        pa: { types: data.pa_types },
        microphones: data.microphones,
        di_boxes: numOrNull(data.di_boxes),
        monitoring: {
          wedges: numOrNull(data.monitoring_wedges),
          iem_support: !!data.monitoring_iem_support,
          brands: data.monitoring_iem_brands,
        },
        backline: { notes: data.backline_notes },
      },
      // NEW pricing model
      audience_packages: (data.audience_packages || []).map((p) => ({
        id: p.id,
        label: p.label,
        active: !!p.active,
        indoor_base_zar: numOrNull(p.indoor_base_zar),
        outdoor_base_zar: numOrNull(p.outdoor_base_zar),
        inclusions: p.inclusions || [],
      })),
      stage_prices: {
        S: numOrNull(data.stage_prices.S),
        M: numOrNull(data.stage_prices.M),
        L: numOrNull(data.stage_prices.L),
      },
      lighting_prices: {
        basic: numOrNull(data.lighting_prices.basic),
        advanced: numOrNull(data.lighting_prices.advanced),
      },
      backline_menu: (data.backline_menu || []).map((b) => ({
        name: b.name,
        price_zar: numOrNull(b.price_zar),
        enabled: !!b.enabled,
      })),
      custom_addons: (data.custom_addons || []).map((a) => ({
        name: a.name,
        price_zar: numOrNull(a.price_zar),
      })),
      // SLA
      sla: {
        response_sla_hours: numOrNull(data.response_sla_hours),
        min_notice_days: numOrNull(data.min_notice_days),
        availability_sync_url: data.availability_sync_url || null,
        default_response_timeout_hours: numOrNull(data.default_response_timeout_hours),
        auto_accept_threshold: !!data.auto_accept_threshold,
      },
      // legacy preserved for older records
      packages_legacy: data.packages_legacy || [],
    };

    return {
      service_type: "Other", // category via serviceCategorySlug
      title: data.title,
      // NOTE: list price removed → omit `price` entirely
      media_url: mediaUrl ?? "",
      duration_minutes: 60,
      details,
    } as Partial<Service>;
  };

  return (
    <BaseServiceWizard
      isOpen={isOpen}
      onClose={onClose}
      onServiceSaved={onServiceSaved}
      service={service}
      steps={steps}
      defaultValues={defaults}
      toPayload={toPayload}
      serviceCategorySlug="sound_service"
    />
  );
}

// ─── Small Inline UI Helpers (chips / pills) ───────────────────────────────────
function ChipsInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const add = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const v = target.value.trim();
      if (!v) return;
      if (!values.includes(v)) onChange([...values, v]);
      target.value = "";
    }
  };
  const remove = (v: string) => onChange(values.filter((x) => x !== v));
  return (
    <div className="rounded-md border p-2">
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs">
            {v}
            <button type="button" onClick={() => remove(v)} className="text-gray-500">×</button>
          </span>
        ))}
        <input
          type="text"
          className="min-w-[10ch] flex-1 border-0 text-sm outline-none"
          placeholder={placeholder || "Type and press Enter"}
          onKeyDown={add}
        />
      </div>
    </div>
  );
}

function RadioPill({
  name,
  value,
  current,
  onChange,
  label,
}: {
  name: string;
  value: string;
  current: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onChange(value)}
      className={`rounded-full border px-3 py-1 text-xs ${active ? "border-[var(--brand-color)]" : "border-gray-200 hover:border-gray-300"}`}
    >
      {label}
    </button>
  );
}

function CheckboxPill({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onChange}
      className={`rounded-full border px-3 py-1 text-xs ${checked ? "border-[var(--brand-color)] bg-[var(--brand-color)]/10" : "border-gray-200 hover:border-gray-300"}`}
    >
      {label}
    </button>
  );
}

function numOrNull(v: number | string | undefined | ""): number | null {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

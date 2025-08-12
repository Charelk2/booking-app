"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { TextInput, TextArea, CollapsibleSection, ToggleSwitch } from "@/components/ui";
import type { Service } from "@/types";
import BaseServiceWizard, { type WizardStep } from "./BaseServiceWizard";
import { DEFAULT_CURRENCY } from "@/lib/constants";

type TravelPolicy = "flat" | "per_km" | "included_radius";
type PowerPhase = "single" | "three" | "";
type AudienceTier = "up_to_150" | "151_500" | "501_2000" | "2000_plus" | "";

interface PackageAddon {
  name: string;
  price: number | "";
}

interface ServicePackage {
  name: string;
  inclusions: string[];
  base_price_zar: number | "";
  overtime_rate_zar_per_hour: number | "";
  addons: PackageAddon[];
  notes?: string;
}

interface EventServiceForm {
  // Basics
  title: string; // Service Name (public)
  short_summary: string; // <= 120 chars
  price: number | ""; // list price for card

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

  // Capabilities & Inventory
  console_brands: string[];
  console_models: string;
  pa_types: ("line_array" | "point_source")[];
  audience_tier: AudienceTier;
  microphones: string; // freeform types + counts
  di_boxes: number | "";
  monitoring_wedges: number | "";
  monitoring_iem_support: boolean;
  monitoring_iem_brands: string[];
  backline_options: string[];
  backline_notes: string;
  tags: string[];

  // Packages & Pricing
  packages: ServicePackage[];

  // SLAs & Availability
  response_sla_hours: number | "";
  min_notice_days: number | "";
  availability_sync_url?: string;
  default_response_timeout_hours: number | "";
  auto_accept_threshold: boolean;
}

const DEFAULTS: EventServiceForm = {
  title: "",
  short_summary: "",
  price: "",
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
  audience_tier: "",
  microphones: "",
  di_boxes: "",
  monitoring_wedges: "",
  monitoring_iem_support: false,
  monitoring_iem_brands: [],
  backline_options: [],
  backline_notes: "",
  tags: [],
  packages: [],
  response_sla_hours: 24,
  min_notice_days: 3,
  availability_sync_url: "",
  default_response_timeout_hours: 48,
  auto_accept_threshold: false,
};

const KNOWN_CONSOLE_BRANDS = [
  "Yamaha",
  "Midas",
  "Behringer",
  "Avid",
  "Allen & Heath",
  "Soundcraft",
];
const IEM_BRANDS = ["Shure", "Sennheiser", "LD Systems", "Behringer"];
const BACKLINE_PRESETS = [
  "Drum kit",
  "Bass amp",
  "Guitar amp",
  "Keyboard stand",
  "DJ booth",
  "Stage risers",
];
const CITY_CODES = ["CPT", "JNB", "DBN", "PLZ", "GRJ", "ELS", "MQP", "BFN", "KIM"];
const TAG_PRESETS = ["weddings", "corporate", "festivals", "birthday", "conference", "club", "church"];

export default function AddServiceModalEventService({
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
  const [backlineOpen, setBacklineOpen] = useState(false);
  const defaults: EventServiceForm = useMemo(
    () =>
      service
        ? {
            ...DEFAULTS,
            title: service.title,
            price: service.price,
            short_summary: (service as any)?.short_summary || (service.details as any)?.short_summary || "",
            // fall back to any persisted details
            ...(service.details as any),
          }
        : DEFAULTS,
    [service],
  );

  const steps: WizardStep<EventServiceForm>[] = [
    {
      label: "Basics",
      fields: ["title", "short_summary", "price"],
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
              placeholder="e.g., Full PA + Sound Engineer"
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
                placeholder="Concise one-liner for cards and search results"
                {...form.register("short_summary", {
                  required: "Short summary is required",
                  validate: (v) => ((v || "").trim().length <= 120 ? true : "Keep under 120 characters"),
                })}
                error={(form.formState.errors as any)?.short_summary?.message as string}
              />
              <p className="text-right text-xs text-gray-500">{summary.length}/120</p>
            </div>
            <TextInput
              label={`List Price (${DEFAULT_CURRENCY})`}
              type="number"
              step="0.01"
              placeholder="e.g., 3500"
              {...form.register("price", {
                required: "Price is required",
                valueAsNumber: true,
                min: { value: 0, message: "Must be 0 or more" },
              })}
              error={(form.formState.errors as any)?.price?.message as string}
            />
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
                      if (set.has(t)) set.delete(t); else set.add(t);
                      form.setValue("tags", Array.from(set), { shouldDirty: true });
                    }}
                    label={t}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-md border p-3 text-xs text-gray-600">
              <p>
                Tip: Use clear names and a short summary to help clients quickly
                understand your service.
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
                <Image src={existingMediaUrl} alt="existing-media" width={80} height={80} className="h-full w-full object-cover" />
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">Hero</span>
                <button type="button" onClick={removeExistingMedia} className="absolute right-0 top-0 h-4 w-4 rounded-full bg-black/50 text-xs text-white">×</button>
              </div>
            )}
            {thumbnails.map((src, i) => (
              <div key={i} className="relative h-20 w-20 overflow-hidden rounded border">
                <Image src={src} alt={`media-${i}`} width={80} height={80} className="h-full w-full object-cover" />
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
                      if (set.has(c)) set.delete(c); else set.add(c);
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
      fields: ["console_brands", "pa_types", "audience_tier"],
      render: ({ form }) => {
        const toggleArray = (name: keyof EventServiceForm, val: string) => {
          const arr = new Set<string>((form.getValues(name as any) as any[]) || []);
          if (arr.has(val)) arr.delete(val); else arr.add(val);
          form.setValue(name as any, Array.from(arr), { shouldDirty: true });
        };
        const capabilitiesPreview = {
          consoles: {
            brands: form.watch("console_brands"),
            models: form.watch("console_models"),
          },
          pa: {
            types: form.watch("pa_types"),
            audience_tier: form.watch("audience_tier"),
          },
          microphones: form.watch("microphones"),
          di_boxes: Number(form.watch("di_boxes") || 0),
          monitoring: {
            wedges: Number(form.watch("monitoring_wedges") || 0),
            iem_support: !!form.watch("monitoring_iem_support"),
            brands: form.watch("monitoring_iem_brands"),
          },
          backline: {
            options: form.watch("backline_options"),
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

            <CollapsibleSection title="PA types & audience size" open={paOpen} onToggle={() => setPaOpen((o) => !o)}>
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
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                {[
                  { v: "up_to_150", l: "Up to 150" },
                  { v: "151_500", l: "151–500" },
                  { v: "501_2000", l: "501–2000" },
                  { v: "2000_plus", l: "2000+" },
                ].map((o) => (
                  <RadioPill
                    key={o.v}
                    name="audience_tier"
                    value={o.v}
                    current={form.watch("audience_tier")}
                    onChange={(v) => form.setValue("audience_tier", v as AudienceTier, { shouldDirty: true })}
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

            <CollapsibleSection title="Backline options" open={backlineOpen} onToggle={() => setBacklineOpen((o) => !o)}>
              <div className="flex flex-wrap gap-2">
                {BACKLINE_PRESETS.map((b) => (
                  <CheckboxPill
                    key={b}
                    checked={(form.watch("backline_options") || []).includes(b)}
                    onChange={() => toggleArray("backline_options", b)}
                    label={b}
                  />
                ))}
              </div>
              <TextArea id="backline_notes" label="Notes" rows={2} placeholder="Any specifics or brand models" {...form.register("backline_notes")} />
            </CollapsibleSection>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">JSON “capabilities” preview</label>
              <pre className="max-h-60 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-800">
                {JSON.stringify(capabilitiesPreview, null, 2)}
              </pre>
            </div>
          </div>
        );
      },
    },
    {
      label: "Packages & Pricing",
      fields: ["packages"],
      render: ({ form }) => {
        const pkgs: ServicePackage[] = (form.watch("packages") || []) as any;
        const setPkgs = (next: ServicePackage[]) => form.setValue("packages", next, { shouldDirty: true });
        const addPkg = () => setPkgs([...(pkgs || []), { name: "", inclusions: [], base_price_zar: "", overtime_rate_zar_per_hour: "", addons: [], notes: "" }]);
        const removePkg = (i: number) => setPkgs(pkgs.filter((_, idx) => idx !== i));
        const updatePkg = (i: number, patch: Partial<ServicePackage>) => {
          const next = [...pkgs];
          next[i] = { ...next[i], ...patch } as ServicePackage;
          setPkgs(next);
        };
        const updateAddon = (pi: number, ai: number, patch: Partial<PackageAddon>) => {
          const next = [...pkgs];
          const addons = [...(next[pi].addons || [])];
          addons[ai] = { ...addons[ai], ...patch } as PackageAddon;
          next[pi].addons = addons;
          setPkgs(next);
        };
        const addAddon = (pi: number) => {
          const next = [...pkgs];
          next[pi].addons = [...(next[pi].addons || []), { name: "", price: "" }];
          setPkgs(next);
        };
        const removeAddon = (pi: number, ai: number) => {
          const next = [...pkgs];
          next[pi].addons = (next[pi].addons || []).filter((_, idx) => idx !== ai);
          setPkgs(next);
        };
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Packages & Pricing</h2>
            <p className="text-sm text-gray-600">Currency is locked to ZAR.</p>
            <div className="space-y-4">
              {(pkgs || []).map((p, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Package {i + 1}</h3>
                    <button type="button" className="text-xs text-red-600" onClick={() => removePkg(i)}>
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <TextInput label="Name" value={p.name} onChange={(e) => updatePkg(i, { name: e.target.value }) as any} />
                    <TextInput
                      label={`Base price (${"ZAR"})`}
                      type="number"
                      value={String(p.base_price_zar ?? "")}
                      onChange={(e) => updatePkg(i, { base_price_zar: e.target.value === "" ? "" : Number(e.target.value) })}
                    />
                    <TextInput
                      label={`Overtime hourly rate (${"ZAR"}/h)`}
                      type="number"
                      value={String(p.overtime_rate_zar_per_hour ?? "")}
                      onChange={(e) => updatePkg(i, { overtime_rate_zar_per_hour: e.target.value === "" ? "" : Number(e.target.value) })}
                    />
                    <TextArea
                      label="Inclusions (one per line)"
                      rows={3}
                      value={(p.inclusions || []).join("\n")}
                      onChange={(e) => updatePkg(i, { inclusions: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }) as any}
                    />
                    <TextArea id={`pkg_notes_${i}`} label="Notes / limitations" rows={2} value={p.notes || ""} onChange={(e) => updatePkg(i, { notes: e.target.value }) as any} />
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 text-sm font-medium">Add-ons</div>
                    <div className="space-y-2">
                      {(p.addons || []).map((a, ai) => (
                        <div key={ai} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                          <div className="sm:col-span-3">
                            <TextInput label="Name" value={a.name} onChange={(e) => updateAddon(i, ai, { name: e.target.value }) as any} />
                          </div>
                          <div className="sm:col-span-2">
                            <TextInput
                              label={`Price (${"ZAR"})`}
                              type="number"
                              value={String(a.price ?? "")}
                              onChange={(e) => updateAddon(i, ai, { price: e.target.value === "" ? "" : Number(e.target.value) })}
                            />
                          </div>
                          <div className="sm:col-span-5 -mt-1 flex justify-end">
                            <button type="button" className="text-xs text-red-600" onClick={() => removeAddon(i, ai)}>
                              Remove add-on
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      <button type="button" className="text-xs text-brand" onClick={() => addAddon(i)}>
                        + Add add-on
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="text-sm text-brand" onClick={addPkg}>
                + Add package
              </button>
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
                label="Auto-accept if only tech rider match and not double-booked"
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
        return (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Review</h2>
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">Basics</div>
              <div>Name: {form.getValues("title")}</div>
              <div>Summary: {form.getValues("short_summary")}</div>
              <div>
                Price: {String(form.getValues("price") || 0)} {DEFAULT_CURRENCY}
              </div>
              <div>Tags: {(form.getValues("tags") || []).join(", ")}</div>
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
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">Capabilities</div>
              <pre className="mt-1 max-h-40 overflow-auto text-xs">
                {JSON.stringify(
                  {
                    consoles: { brands: form.getValues("console_brands"), models: form.getValues("console_models") },
                    pa: { types: form.getValues("pa_types"), audience_tier: form.getValues("audience_tier") },
                    microphones: form.getValues("microphones"),
                    di_boxes: form.getValues("di_boxes"),
                    monitoring: {
                      wedges: form.getValues("monitoring_wedges"),
                      iem_support: form.getValues("monitoring_iem_support"),
                      brands: form.getValues("monitoring_iem_brands"),
                    },
                    backline: { options: form.getValues("backline_options"), notes: form.getValues("backline_notes") },
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
            {hero && (
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">Hero image</div>
                <Image src={hero} alt="hero" width={128} height={96} className="h-24 w-32 rounded object-cover" />
              </div>
            )}
          </div>
        );
      },
    },
  ];

  const toPayload = (data: EventServiceForm, mediaUrl: string | null): Partial<Service> => {
    // Map to a backend-friendly payload. Extended fields go under `details`.
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
        pa: { types: data.pa_types, audience_tier: data.audience_tier },
        microphones: data.microphones,
        di_boxes: numOrNull(data.di_boxes),
        monitoring: {
          wedges: numOrNull(data.monitoring_wedges),
          iem_support: !!data.monitoring_iem_support,
          brands: data.monitoring_iem_brands,
        },
        backline: { options: data.backline_options, notes: data.backline_notes },
      },
      packages: (data.packages || []).map((p) => ({
        name: p.name,
        inclusions: p.inclusions,
        base_price_zar: numOrNull(p.base_price_zar),
        overtime_rate_zar_per_hour: numOrNull(p.overtime_rate_zar_per_hour),
        addons: (p.addons || []).map((a) => ({ name: a.name, price: numOrNull(a.price) })),
        notes: p.notes,
      })),
      sla: {
        response_sla_hours: numOrNull(data.response_sla_hours),
        min_notice_days: numOrNull(data.min_notice_days),
        availability_sync_url: data.availability_sync_url || null,
        default_response_timeout_hours: numOrNull(data.default_response_timeout_hours),
        auto_accept_threshold: !!data.auto_accept_threshold,
      },
    };

    return {
      service_type: "Other", // "Sound" category is represented by the service category slug
      title: data.title,
      price: Number(data.price || 0),
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
      serviceCategorySlug="event_service"
    />
  );
}

// ─── Small Inline UI Helpers (chips / pills) ───────────────────────────────────

function ChipsInput({ values, onChange, placeholder }: { values: string[]; onChange: (vals: string[]) => void; placeholder?: string }) {
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

function RadioPill({ name, value, current, onChange, label }: { name: string; value: string; current: string; onChange: (v: string) => void; label: string }) {
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

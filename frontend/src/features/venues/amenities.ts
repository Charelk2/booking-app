export const VENUE_AMENITY_OPTIONS = [
  { value: "parking", label: "Parking" },
  { value: "wheelchair_access", label: "Wheelchair access" },
  { value: "toilets", label: "Bathrooms / toilets" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bar", label: "Bar" },
  { value: "generator", label: "Generator / backup power" },
  { value: "wifi", label: "Wi‑Fi" },
  { value: "sound_system", label: "Sound system" },
  { value: "tables_chairs", label: "Tables & chairs" },
  { value: "security", label: "Security" },
  { value: "air_conditioning", label: "Air conditioning" },
  { value: "outdoor_area", label: "Outdoor area" },
  { value: "indoor_area", label: "Indoor area" },
  { value: "changing_room", label: "Changing room" },
] as const;

export type VenueAmenityValue = (typeof VENUE_AMENITY_OPTIONS)[number]["value"];

export function getVenueAmenityLabel(value: string): string {
  const found = VENUE_AMENITY_OPTIONS.find((o) => o.value === value);
  return found?.label || value;
}

export function normalizeVenueAmenities(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    const s = String(v || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}


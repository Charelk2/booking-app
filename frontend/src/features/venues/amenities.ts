export type VenueAmenityOption = {
  value: string;
  label: string;
  helper?: string;
};

export type VenueAmenityCategory = {
  id: string;
  label: string;
  items: VenueAmenityOption[];
};

export const VENUE_AMENITY_CATEGORIES: VenueAmenityCategory[] = [
  {
    id: "bathroom",
    label: "Bathroom",
    items: [
      { value: "toilets", label: "Bathrooms / toilets" },
      { value: "hair_dryer", label: "Hair dryer" },
      { value: "shampoo", label: "Shampoo" },
      { value: "conditioner", label: "Conditioner" },
      { value: "body_soap", label: "Body soap" },
      { value: "hot_water", label: "Hot water" },
      { value: "shower_gel", label: "Shower gel" },
    ],
  },
  {
    id: "bedroom_laundry",
    label: "Bedroom & laundry",
    items: [
      {
        value: "essentials",
        label: "Essentials",
        helper: "Towels, bed sheets, soap, and toilet paper",
      },
      { value: "hangers", label: "Hangers" },
      { value: "bed_linens", label: "Bed linens" },
      { value: "extra_pillows_blankets", label: "Extra pillows and blankets" },
      { value: "room_darkening_shades", label: "Room-darkening shades" },
      { value: "iron", label: "Iron" },
      { value: "wardrobe", label: "Clothing storage (wardrobe)" },
      { value: "washer", label: "Washer" },
      { value: "dryer", label: "Dryer" },
    ],
  },
  {
    id: "entertainment",
    label: "Entertainment",
    items: [
      { value: "tv", label: "TV" },
      { value: "books", label: "Books and reading material" },
      { value: "sound_system", label: "Sound system" },
    ],
  },
  {
    id: "heating_cooling",
    label: "Heating & cooling",
    items: [
      { value: "ceiling_fan", label: "Ceiling fan" },
      { value: "portable_heater", label: "Portable heater" },
      { value: "air_conditioning", label: "Air conditioning" },
    ],
  },
  {
    id: "home_safety",
    label: "Home safety",
    items: [
      { value: "smoke_alarm", label: "Smoke alarm" },
      { value: "carbon_monoxide_alarm", label: "Carbon monoxide alarm" },
      { value: "first_aid_kit", label: "First aid kit" },
      { value: "fire_extinguisher", label: "Fire extinguisher" },
      { value: "security", label: "Security" },
      {
        value: "security_cameras_exterior",
        label: "Exterior security cameras on property",
      },
    ],
  },
  {
    id: "internet_office",
    label: "Internet & office",
    items: [
      { value: "wifi", label: "Wi‑Fi" },
      { value: "dedicated_workspace", label: "Dedicated workspace" },
    ],
  },
  {
    id: "kitchen_dining",
    label: "Kitchen & dining",
    items: [
      { value: "kitchen", label: "Kitchen" },
      { value: "kitchenette", label: "Kitchenette" },
      { value: "microwave", label: "Microwave" },
      {
        value: "cooking_basics",
        label: "Cooking basics",
        helper: "Pots and pans, oil, salt and pepper",
      },
      {
        value: "dishes_and_silverware",
        label: "Dishes and silverware",
        helper: "Bowls, plates, cups, etc.",
      },
      { value: "mini_fridge", label: "Mini fridge" },
      { value: "hot_water_kettle", label: "Hot water kettle" },
      {
        value: "coffee_maker",
        label: "Coffee maker",
        helper: "Drip coffee maker / french press",
      },
      { value: "wine_glasses", label: "Wine glasses" },
      { value: "toaster", label: "Toaster" },
      { value: "coffee", label: "Coffee" },
      { value: "bar", label: "Bar" },
    ],
  },
  {
    id: "outdoor",
    label: "Outdoor",
    items: [
      { value: "outdoor_area", label: "Outdoor area" },
      { value: "outdoor_furniture", label: "Outdoor furniture" },
      { value: "sun_loungers", label: "Sun loungers" },
    ],
  },
  {
    id: "parking_facilities",
    label: "Parking & facilities",
    items: [
      { value: "parking", label: "Parking on premises" },
      { value: "pool", label: "Pool" },
      { value: "play_area", label: "Play area" },
      { value: "single_level_home", label: "Single level (no stairs)" },
      { value: "wheelchair_access", label: "Wheelchair access" },
      { value: "indoor_area", label: "Indoor area" },
      { value: "tables_chairs", label: "Tables & chairs" },
      { value: "changing_room", label: "Changing room" },
      { value: "generator", label: "Generator / backup power" },
    ],
  },
  {
    id: "services",
    label: "Services",
    items: [
      {
        value: "luggage_dropoff_allowed",
        label: "Luggage dropoff allowed",
        helper: "Early arrival or late departure",
      },
      {
        value: "long_term_stays_allowed",
        label: "Long term stays allowed",
        helper: "28 days or more",
      },
      {
        value: "housekeeping_available",
        label: "Housekeeping available",
        helper: "If arranged",
      },
      { value: "host_greets_you", label: "Host greets you" },
    ],
  },
];

export const VENUE_AMENITY_OPTIONS: VenueAmenityOption[] = VENUE_AMENITY_CATEGORIES.flatMap(
  (c) => c.items,
);

export const VENUE_NOT_INCLUDED_HIGHLIGHTS: VenueAmenityOption[] = [
  { value: "security_cameras_exterior", label: "Exterior security cameras on property" },
  { value: "kitchen", label: "Kitchen" },
  { value: "washer", label: "Washer" },
  { value: "dryer", label: "Dryer" },
  { value: "air_conditioning", label: "Air conditioning" },
];

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

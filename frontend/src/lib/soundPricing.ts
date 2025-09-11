// frontend/src/lib/soundPricing.ts
// Helper to compute Sound Service pricing based on audience packages and add-ons

export type VenueType = 'indoor' | 'outdoor' | 'hybrid';

export interface SoundPricingInput {
  details?: Record<string, any> | null;
  guestCount?: number;
  venueType?: VenueType;
  stageRequired?: boolean;
  stageSize?: 'S' | 'M' | 'L';
  lightingEvening?: boolean;
}

export interface LineItem {
  key: string;
  label: string;
  amount: number;
}

export interface SoundPricingResult {
  baseOnly: number; // the audience package base amount only
  addons: number; // sum of add-ons (stage, lighting)
  total: number; // baseOnly + addons
  items: LineItem[]; // ordered breakdown
  selectedBandId?: string;
  selectedBandLabel?: string;
  appliedVenueKind?: 'indoor' | 'outdoor';
}

function toNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

// Map guest count to audience band ids used by AddServiceModalSoundService
function bandIdForGuests(guests: number | undefined): string | undefined {
  if (!guests || guests <= 0) return undefined;
  if (guests <= 100) return '0_100';
  if (guests <= 200) return '101_200';
  if (guests <= 500) return '201_500';
  if (guests <= 1000) return '501_1000';
  return '1000_plus';
}

export function computeSoundServicePrice(input: SoundPricingInput): SoundPricingResult {
  const details = input.details || {};
  const pkgs: any[] = Array.isArray(details.audience_packages) ? details.audience_packages : [];
  const stagePrices = (details.stage_prices || {}) as { S?: number; M?: number; L?: number };
  const lightingPrices = (details.lighting_prices || {}) as { basic?: number; advanced?: number };

  const activePkgs = pkgs.filter((p) => p && (p.active ?? true));
  const bandId = bandIdForGuests(input.guestCount);

  // Choose the configured band or fallback to first active
  let selected = activePkgs.find((p) => p.id === bandId);
  if (!selected && activePkgs.length > 0) {
    selected = activePkgs[0];
  }

  let items: LineItem[] = [];
  let baseOnly = 0;
  let addons = 0;
  let appliedVenueKind: 'indoor' | 'outdoor' | undefined;

  if (selected) {
    const vt = (input.venueType || 'indoor');
    appliedVenueKind = vt === 'outdoor' || vt === 'hybrid' ? 'outdoor' : 'indoor';
    const baseField = appliedVenueKind === 'outdoor' ? 'outdoor_base_zar' : 'indoor_base_zar';
    const rawBase = selected[baseField];
    baseOnly = toNumber(rawBase, 0);
    const bandLabel = selected.label || selected.id || '';
    items.push({ key: 'audience_base', label: `Audience Package ${bandLabel} (${appliedVenueKind})`, amount: baseOnly });

    // Stage add-on
    if (input.stageRequired && input.stageSize) {
      const stageAmt = toNumber((stagePrices as any)[input.stageSize], 0);
      if (stageAmt > 0) {
        items.push({ key: 'stage', label: `Stage ${input.stageSize}`, amount: stageAmt });
        addons += stageAmt;
      }
    }

    // Lighting logic: if evening and package includes 'none', add basic by default.
    const included = (selected.included || {}) as { lighting?: 'none' | 'basic' | 'advanced' };
    if (input.lightingEvening) {
      if (!included.lighting || included.lighting === 'none') {
        const basic = toNumber(lightingPrices.basic, 0);
        if (basic > 0) {
          items.push({ key: 'lighting_basic', label: 'Lighting (Basic)', amount: basic });
          addons += basic;
        }
      } else if (included.lighting === 'basic') {
        // No UI for upgrade → Advanced yet; default to included basic at no extra cost
      } else {
        // advanced included → no add-on
      }
    }

    return {
      baseOnly,
      addons,
      total: baseOnly + addons,
      items,
      selectedBandId: selected.id,
      selectedBandLabel: selected.label || selected.id,
      appliedVenueKind,
    };
  }

  return { baseOnly: 0, addons: 0, total: 0, items };
}


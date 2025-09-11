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
  upgradeLightingAdvanced?: boolean;
  // Requested counts from rider (we'll price extras above included)
  riderUnits?: {
    vocal_mics?: number;
    speech_mics?: number;
    monitor_mixes?: number;
    iem_packs?: number;
    di_boxes?: number;
  };
  // Requested backline quantities keyed by BacklineKey
  backlineRequested?: Record<string, number>;
}

export interface LineItem {
  key: string;
  label: string;
  amount: number;
}

export interface SoundPricingResult {
  baseOnly: number; // the audience package base amount only
  addons: number; // sum of add-ons (stage, lighting)
  unitAddons: number; // extras above included (mics/monitors/di/iem)
  backline: number; // backline rentals
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
  let unitAddons = 0;
  let backlineTotal = 0;
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

    // Lighting logic:
    // - If evening and included is 'none': add Basic; if upgrade flag, add (Advanced - Basic) on top (and tech day if required).
    // - If evening and included is 'basic': default 0; if upgrade flag, add (Advanced - Basic) (+tech day if required).
    // - If included is 'advanced': ignore upgrade.
    const included = (selected.included || {}) as { lighting?: 'none' | 'basic' | 'advanced' };
    if (input.lightingEvening) {
      const basic = toNumber(lightingPrices.basic, 0);
      const adv = toNumber(lightingPrices.advanced, 0);
      const techDay = toNumber((details.addon_unit_prices || {}).lighting_tech_day_rate_zar, 0);
      const advIncludesTech = !!(details.addon_unit_prices || {}).advanced_includes_tech;
      const delta = Math.max(0, adv - basic);
      if (!included.lighting || included.lighting === 'none') {
        if (basic > 0) {
          items.push({ key: 'lighting_basic', label: 'Lighting (Basic)', amount: basic });
          addons += basic;
        }
        if (input.upgradeLightingAdvanced && delta > 0) {
          items.push({ key: 'lighting_upgrade', label: 'Upgrade to Advanced', amount: delta });
          addons += delta;
          if (!advIncludesTech && techDay > 0) {
            items.push({ key: 'lighting_tech', label: 'Lighting tech (day rate)', amount: techDay });
            addons += techDay;
          }
        }
      } else if (included.lighting === 'basic') {
        if (input.upgradeLightingAdvanced && delta > 0) {
          items.push({ key: 'lighting_upgrade', label: 'Upgrade to Advanced', amount: delta });
          addons += delta;
          if (!advIncludesTech && techDay > 0) {
            items.push({ key: 'lighting_tech', label: 'Lighting tech (day rate)', amount: techDay });
            addons += techDay;
          }
        }
      } else {
        // advanced included → no add-on
      }
    }

    // Unit add-ons above included
    const incVocal = Number((selected.included?.vocal_mics ?? 0) as any) || 0;
    const incSpeech = Number((selected.included?.speech_mics ?? 0) as any) || 0;
    const incMon = Number((selected.included?.monitors ?? 0) as any) || 0;
    const incDi = Number((selected.included?.di_boxes ?? 0) as any) || 0;
    const u = input.riderUnits || {};
    const extraVocal = Math.max(0, (Number(u.vocal_mics || 0) - incVocal));
    const extraSpeech = Math.max(0, (Number(u.speech_mics || 0) - incSpeech));
    const extraMon = Math.max(0, (Number(u.monitor_mixes || 0) - incMon));
    const extraIem = Math.max(0, Number(u.iem_packs || 0)); // no included IEMs in package spec
    const extraDi = Math.max(0, (Number(u.di_boxes || 0) - incDi));
    const unitPrices = (details.addon_unit_prices || {}) as Record<string, any>;
    const lines: Array<[string, string, number, number]> = [
      ['extra_vocal_mic_zar', 'Extra vocal mics', extraVocal, toNumber(unitPrices.extra_vocal_mic_zar, 0)],
      ['extra_speech_mic_zar', 'Extra speech mics', extraSpeech, toNumber(unitPrices.extra_speech_mic_zar, 0)],
      ['extra_monitor_mix_zar', 'Extra monitor mixes', extraMon, toNumber(unitPrices.extra_monitor_mix_zar, 0)],
      ['extra_iem_pack_zar', 'IEM packs', extraIem, toNumber(unitPrices.extra_iem_pack_zar, 0)],
      ['extra_di_box_zar', 'Extra DI boxes', extraDi, toNumber(unitPrices.extra_di_box_zar, 0)],
    ];
    for (const [key, label, qty, rate] of lines) {
      if (qty > 0 && rate > 0) {
        const amt = qty * rate;
        items.push({ key, label: `${label} ×${qty}`, amount: amt });
        unitAddons += amt;
      }
    }

    // Backline items
    const bl: Record<string, any> = details.backline_prices || {};
    const backReq = input.backlineRequested || {};
    for (const k of Object.keys(backReq)) {
      const qty = Math.max(0, Number(backReq[k] || 0));
      if (!qty) continue;
      const row = bl[k];
      const enabled = row && (row.enabled === true || row === true || row != null);
      const price = typeof row === 'object' ? toNumber(row.price_zar, 0) : toNumber(row, 0);
      if (enabled && price > 0) {
        const amt = qty * price;
        items.push({ key: `backline_${k}`, label: `Backline: ${k} ×${qty}`, amount: amt });
        backlineTotal += amt;
      }
    }

    return {
      baseOnly,
      addons,
      unitAddons,
      backline: backlineTotal,
      total: baseOnly + addons + unitAddons + backlineTotal,
      items,
      selectedBandId: selected.id,
      selectedBandLabel: selected.label || selected.id,
      appliedVenueKind,
    };
  }

  return { baseOnly: 0, addons: 0, unitAddons: 0, backline: 0, total: 0, items };
}

export const VENUE_RULE_OPTIONS = [
  { value: "no_smoking", label: "No smoking", helper: "" },
  { value: "no_open_flames", label: "No open flames (candles/fireworks)", helper: "" },
  { value: "no_confetti", label: "No confetti / glitter", helper: "" },
  { value: "no_pets", label: "No pets", helper: "" },
  { value: "noise_limits", label: "Noise limits / quiet hours", helper: "Please respect nearby neighbours." },
  { value: "decor_restrictions", label: "Decor restrictions", helper: "Ask before attaching anything to walls." },
  { value: "outside_catering_rules", label: "Outside catering rules", helper: "Confirm if outside caterers are allowed." },
  { value: "parking_rules", label: "Parking rules", helper: "Use designated parking areas only." },
] as const;

export type VenueRuleValue = (typeof VENUE_RULE_OPTIONS)[number]["value"];

export function getVenueRuleLabel(value: string): string {
  const found = VENUE_RULE_OPTIONS.find((o) => o.value === value);
  return found?.label || value;
}

export function normalizeVenueRules(input: unknown): string[] {
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

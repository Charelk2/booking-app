import { format } from "date-fns";
import type { EventDetails } from "@/contexts/BookingContext";

// Fields required per step index (mirrors BookingWizard)
export const bookingWizardStepFields: (keyof EventDetails)[][] = [
  ["eventDescription"],
  ["location"],
  ["date"],
  ["eventType"],
  ["guests"],
  ["venueType"],
  ["sound"],
  [],
  [], // Review step has no fields to validate for "next"
];

/**
 * Guard that checks if a proposed date is unavailable (used on step 2).
 */
export function isUnavailableDate(details: Partial<EventDetails>, unavailable: string[]): boolean {
  const d = (details as any)?.date as Date | string | undefined;
  if (!d) return false;
  const dt = typeof d === "string" ? new Date(d) : d;
  const day = format(dt, "yyyy-MM-dd");
  return unavailable.includes(day);
}

/**
 * Normalize a guest count value into a positive integer or undefined.
 */
export function normalizeGuestCount(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const num = typeof raw === "number" ? raw : parseInt(String(raw).trim() || "0", 10);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Number(num);
}

/**
 * Normalize an event type value into a trimmed string or undefined.
 */
export function normalizeEventType(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const val = raw.trim();
  return val.length ? val : undefined;
}

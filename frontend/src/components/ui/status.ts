import type { CSSProperties } from "react";
import { radii, spacing, statusPalette, type StatusTone, typography } from "@/theme/tokens";

function toneForStatus(status: string): StatusTone {
  const s = (status || "").toLowerCase();
  if (s.includes("cancelled") || s.includes("declined") || s.includes("rejected") || s.includes("withdrawn") || s.includes("expired")) {
    return "danger";
  }
  if (s.includes("confirmed") || s.includes("completed") || s.includes("accepted") || s === "paid") {
    return "success";
  }
  if (s.includes("quote") || s.includes("pending")) {
    return "warning";
  }
  return "neutral";
}

export function statusChipStyles(status: string): CSSProperties {
  const palette = statusPalette[toneForStatus(status)];
  return {
    backgroundColor: palette.bg,
    color: palette.text,
    borderColor: palette.border,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: radii.pill,
    padding: `${spacing.xs} ${spacing.sm}`,
    fontSize: typography.tiny,
    fontWeight: 600,
    lineHeight: 1.2,
  };
}

// Legacy helper kept for backwards compatibility; prefer statusChipStyles going forward.
export function statusChipClass(status: string): string {
  const tone = toneForStatus(status);
  if (tone === "danger") return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
  if (tone === "success") return "bg-green-50 text-green-700 ring-1 ring-inset ring-green-200";
  if (tone === "warning") return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  return "bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200";
}

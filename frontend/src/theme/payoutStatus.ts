import { statusPalette } from "./tokens";

export type PayoutStatusTone = "success" | "warning" | "danger" | "neutral";

export function getPayoutStageLabel(type: string): string {
  const normalized = (type || "").toLowerCase();
  if (normalized === "first50") return "First 50%";
  if (normalized === "final50") return "Final 50%";
  return "Payout";
}

export function getPayoutStatusTheme(status: string) {
  const normalized = (status || "").toLowerCase();
  if (normalized === "paid") return statusPalette.success;
  if (normalized === "queued") return statusPalette.warning;
  if (normalized === "failed" || normalized === "blocked") return statusPalette.danger;
  return statusPalette.neutral;
}

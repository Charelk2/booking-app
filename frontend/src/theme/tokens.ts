// Design tokens shared across web and (future) native surfaces.
// Keep these values platform-agnostic so they can be consumed in RN as well.
export const colors = {
  brand: {
    primary: "#0F172A", // slate-900
    dark: "#0B1224",
    light: "#1F2937", // slate-800-ish
    accent: "#111827", // slate-800
    surface: "#FFFFFF",
  },
  success: {
    bg: "#ECFDF3",
    border: "#BBF7D0",
    text: "#166534",
  },
  warning: {
    bg: "#FFFBEB",
    border: "#FDE68A",
    text: "#92400E",
  },
  danger: {
    bg: "#FEF2F2",
    border: "#FECACA",
    text: "#991B1B",
  },
  neutral: {
    bg: "#F8FAFC",
    border: "#E2E8F0",
    text: "#475569",
    strong: "#0F172A",
  },
};

export const radii = {
  pill: "9999px",
  card: "16px",
  md: "12px",
};

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
};

export const typography = {
  tiny: "11px",
  small: "13px",
  body: "14px",
  label: "12px",
};

export type StatusTone = "success" | "warning" | "danger" | "neutral";

export const statusPalette: Record<StatusTone, { bg: string; border: string; text: string }> = {
  success: { bg: colors.success.bg, border: colors.success.border, text: colors.success.text },
  warning: { bg: colors.warning.bg, border: colors.warning.border, text: colors.warning.text },
  danger: { bg: colors.danger.bg, border: colors.danger.border, text: colors.danger.text },
  neutral: { bg: colors.neutral.bg, border: colors.neutral.border, text: colors.neutral.text },
};

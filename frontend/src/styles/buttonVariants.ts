import type { CSSProperties } from "react";
import { colors, radii, spacing, typography } from "@/theme/tokens";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "link";

type ButtonVariantStyle = {
  className?: string;
  style: CSSProperties;
};

export const buttonVariants: Record<ButtonVariant, ButtonVariantStyle> = {
  primary: {
    className: "hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition",
    style: {
      backgroundColor: colors.brand.primary,
      color: "#FFFFFF",
      border: `1px solid ${colors.brand.primary}`,
    },
  },
  secondary: {
    className: "hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition",
    style: {
      backgroundColor: colors.brand.surface,
      color: colors.brand.primary,
      border: `1px solid ${colors.brand.primary}`,
    },
  },
  outline: {
    className: "hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition",
    style: {
      backgroundColor: "transparent",
      color: colors.brand.primary,
      border: `1px solid ${colors.brand.primary}`,
    },
  },
  danger: {
    className: "hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition",
    style: {
      backgroundColor: colors.danger.text,
      color: "#FFFFFF",
      border: `1px solid ${colors.danger.text}`,
    },
  },
  link: {
    className: "underline focus-visible:ring-2 focus-visible:ring-offset-2 px-0 py-0",
    style: {
      backgroundColor: "transparent",
      color: colors.brand.primary,
      border: "1px solid transparent",
    },
  },
};

export const buttonBaseStyle: CSSProperties = {
  borderRadius: radii.md,
  minHeight: "48px",
  minWidth: "48px",
  fontSize: typography.body,
  fontWeight: 600,
  padding: `${spacing.sm} ${spacing.md}`,
};

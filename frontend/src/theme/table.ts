import { colors, spacing, typography } from "./tokens";

export const tableHeaderStyle = {
  color: colors.neutral.text,
  fontSize: typography.label,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  padding: `${spacing.sm} ${spacing.md}`,
  letterSpacing: "0.04em",
};

export const tableCellStyle = {
  color: colors.neutral.strong,
  fontSize: typography.body,
  padding: `${spacing.sm} ${spacing.md}`,
};

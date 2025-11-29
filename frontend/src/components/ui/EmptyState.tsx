"use client";
import React from "react";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = "Nothing here yet",
  description = "Once there is data, it will appear here.",
  action,
  className,
}) => (
  <div className={className}>
    <div
      className="text-center"
      style={{
        borderRadius: radii.card,
        border: `1px dashed ${colors.neutral.border}`,
        padding: spacing.lg,
        backgroundColor: colors.brand.surface,
      }}
    >
      <div className="text-2xl mb-2">🗂️</div>
      <h3
        className="font-semibold"
        style={{ fontSize: "16px", color: colors.neutral.strong }}
      >
        {title}
      </h3>
      <p
        className="mt-1"
        style={{ fontSize: typography.body, color: colors.neutral.text }}
      >
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  </div>
);

export default EmptyState;

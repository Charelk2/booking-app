"use client";
import React from "react";
import clsx from "clsx";
import { colors, radii, spacing, typography } from "@/theme/tokens";

type SectionProps = {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
};

const Section: React.FC<SectionProps> = ({
  title,
  subtitle,
  action,
  children,
  className,
  headerClassName,
  contentClassName,
}) => {
  return (
    <section
      className={clsx("shadow-sm", className)}
      style={{
        borderRadius: radii.card,
        border: `1px solid ${colors.neutral.border}`,
        backgroundColor: colors.brand.surface,
      }}
    >
      {(title || subtitle || action) && (
        <div
          className={clsx("flex items-start justify-between gap-4", headerClassName)}
          style={{
            borderBottom: `1px solid ${colors.neutral.border}`,
            padding: `${spacing.md} ${spacing.lg}`,
          }}
        >
          <div>
            {title && (
              <h2
                className="font-semibold"
                style={{ fontSize: "18px", color: colors.neutral.strong }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                className="mt-1"
                style={{ fontSize: typography.body, color: colors.neutral.text }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div
        className={clsx(contentClassName)}
        style={{ padding: `${spacing.md} ${spacing.lg}` }}
      >
        {children}
      </div>
    </section>
  );
};

export default Section;

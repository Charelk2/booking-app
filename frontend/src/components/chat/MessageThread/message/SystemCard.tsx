"use client";

import * as React from "react";
import clsx from "clsx";

export type SystemCardTone = "neutral" | "success" | "warning" | "info";

export interface SystemCardAction {
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
}

export interface SystemCardProps {
  icon?: React.ReactNode;
  tone?: SystemCardTone;
  title: string;
  subtitle?: string;
  className?: string;
  primaryAction?: SystemCardAction;
  secondaryAction?: SystemCardAction;
  children?: React.ReactNode;
}

function actionClasses(variant: SystemCardAction["variant"] | undefined): string {
  switch (variant) {
    case "primary":
      return "inline-flex items-center justify-center rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-900";
    case "secondary":
      return "inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50";
    case "ghost":
      return "inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100";
    default:
      return "inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50";
  }
}

export default function SystemCard({
  icon,
  tone = "neutral",
  title,
  subtitle,
  className,
  primaryAction,
  secondaryAction,
  children,
}: SystemCardProps) {
  return (
    <div className="my-2 w-full flex justify-center">
      <div
        className={clsx(
          "mx-auto w-full max-w-2xl rounded-2xl border bg-white px-3 py-2 shadow-sm sm:px-4 sm:py-3",
          tone === "success" && "border-emerald-200 bg-emerald-50/60",
          tone === "warning" && "border-amber-200 bg-amber-50/70",
          tone === "info" && "border-indigo-200 bg-indigo-50/80",
          tone === "neutral" && "border-gray-200 bg-white",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="flex-shrink-0 grid h-8 w-8 place-items-center rounded-full bg-black text-white text-xs font-semibold">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900">{title}</div>
            {subtitle ? (
              <div className="mt-0.5 text-xs text-gray-600 leading-snug">{subtitle}</div>
            ) : null}
            {children ? <div className="mt-2">{children}</div> : null}
            {primaryAction || secondaryAction ? (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
                {secondaryAction ? (
                  <button
                    type="button"
                    className={actionClasses(secondaryAction.variant)}
                    onClick={() => {
                      try {
                        secondaryAction.onClick?.();
                      } catch {
                        // no-op
                      }
                    }}
                  >
                    {secondaryAction.label}
                  </button>
                ) : null}
                {primaryAction ? (
                  <button
                    type="button"
                    className={actionClasses(primaryAction.variant ?? "primary")}
                    onClick={() => {
                      try {
                        primaryAction.onClick?.();
                      } catch {
                        // no-op
                      }
                    }}
                  >
                    {primaryAction.label}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}


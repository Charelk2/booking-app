"use client";
import React from "react";
import clsx from "clsx";

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
    <section className={clsx("rounded-2xl border border-gray-200 bg-white shadow-sm", className)}>
      {(title || subtitle || action) && (
        <div className={clsx("flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5", headerClassName)}>
          <div>
            {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={clsx("px-6 py-5", contentClassName)}>{children}</div>
    </section>
  );
};

export default Section;


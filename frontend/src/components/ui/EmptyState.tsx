"use client";
import React from "react";

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
    <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
      <div className="text-2xl mb-2">🗂️</div>
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  </div>
);

export default EmptyState;


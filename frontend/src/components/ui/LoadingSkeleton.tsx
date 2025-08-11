"use client";
import React from "react";

type LoadingSkeletonProps = {
  lines?: number;
  className?: string;
};

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ lines = 3, className }) => {
  return (
    <div className={className} aria-busy="true" aria-live="polite" role="status">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-3 last:mb-0"
        />
      ))}
    </div>
  );
};

export default LoadingSkeleton;


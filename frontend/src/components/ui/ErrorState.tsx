"use client";
import React from "react";

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  className?: string;
};

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = "Something went wrong.",
  onRetry,
  className,
}) => (
  <div className={className}>
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="text-sm text-red-800 flex items-center justify-between">
        <span>⚠️ {message}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-3 inline-flex items-center rounded-md bg-red-600 px-3 py-1 text-white text-xs font-medium hover:bg-red-700"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  </div>
);

export default ErrorState;


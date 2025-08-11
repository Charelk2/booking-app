"use client";
import React from "react";

type IllustratedEmptyProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  variant?: "requests" | "bookings" | "services";
  className?: string;
};

const Illustration: React.FC<{ variant: NonNullable<IllustratedEmptyProps["variant"]> }> = ({ variant }) => {
  const stroke = variant === "bookings" ? "#0EA5E9" : variant === "services" ? "#10B981" : "#6366F1";
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" fill="none" aria-hidden>
      <rect x="10" y="20" width="100" height="50" rx="8" stroke={stroke} strokeWidth="2" fill="#F8FAFC" />
      <rect x="20" y="30" width="60" height="8" rx="4" fill={stroke} opacity="0.4" />
      <rect x="20" y="44" width="80" height="6" rx="3" fill={stroke} opacity="0.2" />
      <rect x="20" y="56" width="50" height="6" rx="3" fill={stroke} opacity="0.2" />
      <circle cx="95" cy="34" r="6" fill={stroke} opacity="0.5" />
    </svg>
  );
};

const IllustratedEmpty: React.FC<IllustratedEmptyProps> = ({ title, description, action, variant = "requests", className }) => {
  return (
    <div className={className}>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <Illustration variant={variant} />
        <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-1 max-w-md text-sm text-gray-500">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
};

export default IllustratedEmpty;


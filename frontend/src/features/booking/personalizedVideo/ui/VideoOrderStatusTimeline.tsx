import * as React from "react";
import Stepper from "@/components/ui/Stepper";

const STEPS = ["Paid", "In production", "Delivered", "Completed"];

function normalizeStatus(status: string | null | undefined): string {
  return String(status || "").trim().toLowerCase();
}

function StatusCard({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <div className="text-xs font-semibold text-gray-900">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-gray-600">{subtitle}</div> : null}
      </div>
    </div>
  );
}

function statusToStep(status: string): number | null {
  const s = normalizeStatus(status);
  if (s === "paid" || s === "info_pending") return 0;
  if (s === "in_production") return 1;
  if (s === "delivered") return 2;
  if (s === "completed" || s === "closed") return 3;
  if (s === "in_dispute") return 2;
  return null;
}

function formatDateLabel(raw: string): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  try {
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : new Date(v);
    if (Number.isNaN(dt.getTime())) return null;
    return new Intl.DateTimeFormat("en-ZA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(dt);
  } catch {
    return null;
  }
}

export default function VideoOrderStatusTimeline({
  status,
  deliveryByUtc,
  className,
}: {
  status: string;
  deliveryByUtc?: string | null;
  className?: string;
}) {
  const s = normalizeStatus(status);
  if (s === "cancelled" || s === "canceled") {
    return (
      <StatusCard
        className={className}
        title="Order cancelled"
        subtitle="This order was cancelled and won’t be fulfilled."
      />
    );
  }
  if (s === "refunded") {
    return (
      <StatusCard
        className={className}
        title="Order refunded"
        subtitle="This order was refunded. If you still need help, contact support in chat."
      />
    );
  }

  const currentStep = statusToStep(s);
  if (currentStep == null) return null;

  const deliveryLabel = deliveryByUtc ? formatDateLabel(deliveryByUtc) : null;

  return (
    <div className={className}>
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <div className="text-xs font-semibold text-gray-900">Order progress</div>
        {s === "in_dispute" ? (
          <div className="mt-1 text-xs text-amber-700">
            In dispute — our team will review the details.
          </div>
        ) : null}
        {deliveryLabel ? (
          <div className="mt-1 text-xs text-gray-600">
            Expected delivery by <span className="font-medium text-gray-900">{deliveryLabel}</span>
          </div>
        ) : null}
        <div className="mt-3">
          <Stepper steps={STEPS} currentStep={currentStep} variant="neutral" />
        </div>
      </div>
    </div>
  );
}

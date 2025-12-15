"use client";

import React, { Fragment, useMemo, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  XMarkIcon,
  BoltIcon,
  CheckBadgeIcon,
  PrinterIcon,
  CreditCardIcon,
  ChatBubbleBottomCenterTextIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Button, TextInput, TextArea, Spinner } from "@/components/ui";
import { PersonalizedVideoDatePicker } from "./PersonalizedVideoDatePicker";
import {
  usePersonalizedVideoOrderEngine as usePvEngine,
  BRIEF_QUESTIONS,
} from "@/features/booking/personalizedVideo/engine/engine";
import type { PvLengthChoice } from "@/features/booking/personalizedVideo/serviceMapping";
type LengthChoice = "30_45" | "60_90";
const ENABLE_PV_ORDERS =
  (process.env.NEXT_PUBLIC_ENABLE_PV_ORDERS ?? "") === "1";

// =============================================================================
// OPTIONS
// =============================================================================

const LANG_LABELS: Record<string, string> = {
  EN: "English",
  AF: "Afrikaans",
};

// =============================================================================
// UTILITIES
// =============================================================================

function formatCurrency(val: number, currency = "ZAR", locale = "en-ZA") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number.isFinite(val) ? val : 0);
}

function toIsoDateUtc(day: string): string {
  // day: YYYY-MM-DD -> 00:00:00Z
  const [y, m, d] = day.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0));
  return dt.toISOString();
}

// =============================================================================
// STEP 1 — BOOKING WIZARD (Sheet)
// =============================================================================

interface WizardProps {
  artistId: number;
  isOpen: boolean;
  onClose: () => void;
  basePriceZar?: number;
  addOnLongZar?: number;
  serviceId?: number;
  defaultLengthChoice?: PvLengthChoice;
  supportedLanguages?: string[];
  defaultLanguage?: string;
}

export default function BookinWizardPersonilsedVideo({
  artistId,
  isOpen,
  onClose,
  basePriceZar = 850,
  addOnLongZar = 250,
  serviceId,
  defaultLengthChoice,
  supportedLanguages,
  defaultLanguage,
}: WizardProps) {
  const router = useRouter();

  const { state, actions } = usePvEngine({
    artistId,
    serviceId,
    basePriceZar,
    addOnLongZar,
    onDraftCreated: (orderId, isDemo) => {
      // close sheet and route
      onClose();
      router.push(`/video-orders/${orderId}/pay${isDemo ? "?sim=1" : ""}`);
    },
  });

  const { draft, pricing, status, unavailableDates } = state;

  // Apply defaults from service config when provided
  useEffect(() => {
    if (defaultLengthChoice) {
      actions.updateDraftField("lengthChoice", defaultLengthChoice as LengthChoice);
    }
    if (defaultLanguage) {
      actions.updateDraftField("language", defaultLanguage as any);
    }
  }, [defaultLengthChoice, defaultLanguage, actions]);

  const form = {
    deliveryBy: draft.deliveryBy,
    setDeliveryBy: (value: string) => actions.updateDraftField("deliveryBy", value),
    lengthChoice: draft.lengthChoice as LengthChoice,
    setLengthChoice: (value: LengthChoice) => actions.updateDraftField("lengthChoice", value),
    language: draft.language,
    setLanguage: (value: string) => actions.updateDraftField("language", value as any),
  };

  const minDate = useMemo(() => new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10), []);

  const languageOptions = useMemo(() => {
    const codes = supportedLanguages && supportedLanguages.length > 0 ? supportedLanguages : ["EN", "AF"];
    return codes.map((code) => ({
      v: code,
      l: LANG_LABELS[code] || code,
    }));
  }, [supportedLanguages]);

  const availabilityUi = useMemo(() => {
    if (!form.deliveryBy) return { tone: "muted" as const, label: "" };
    if (status.checking) return { tone: "loading" as const, label: "Checking availability…" };
    if (status.available === true) return { tone: "ok" as const, label: "Available" };
    if (status.available === false) return { tone: "bad" as const, label: "Not available for that date" };
    return { tone: "muted" as const, label: "Availability unknown (we’ll still try)" };
  }, [form.deliveryBy, status.checking, status.available]);

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" />
        </Transition.Child>

        {/* Bottom sheet (mobile) / centered modal (desktop) */}
        <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-6 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-6 sm:translate-y-0 sm:scale-95"
          >
            <Dialog.Panel className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[100dvh] sm:max-h-[90vh]">
              {/* Mobile handle */}
              <div className="sm:hidden flex justify-center pt-3">
                <div className="h-1.5 w-10 rounded-full bg-gray-200" />
              </div>

              {/* Header */}
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Dialog.Title className="text-base sm:text-lg font-semibold text-gray-900">
                      Book a personalised video
                    </Dialog.Title>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 rounded-full p-2 hover:bg-gray-50 text-gray-500 hover:text-gray-700"
                    aria-label="Close"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5">
                <div className="space-y-6">
                  {/* Delivery date */}
                  <section className="space-y-2">
                    <h3 className="sr-only">Delivery date</h3>

                    <PersonalizedVideoDatePicker
                      value={form.deliveryBy}
                      minDateIso={minDate}
                      unavailableDates={unavailableDates}
                      onChange={form.setDeliveryBy}
                    />

                    <div className="min-h-[1.25rem] text-xs">
                      {availabilityUi.tone === "loading" && (
                        <span className="inline-flex items-center gap-2 text-gray-600">
                          <Spinner size="sm" />
                          {availabilityUi.label}
                        </span>
                      )}
                      {availabilityUi.tone === "ok" && (
                        <span className="inline-flex items-center gap-2 text-emerald-700 font-medium">
                          <CheckBadgeIcon className="h-4 w-4" />
                          {availabilityUi.label}
                        </span>
                      )}
                      {availabilityUi.tone === "bad" && (
                        <span className="inline-flex items-center gap-2 text-red-600 font-medium">
                          <BoltIcon className="h-4 w-4" />
                          {availabilityUi.label}
                        </span>
                      )}
                      {availabilityUi.tone === "muted" && (
                        availabilityUi.label ? (
                          <span className="text-gray-500">{availabilityUi.label}</span>
                        ) : null
                      )}
                    </div>
                  </section>

                  {/* Options */}
                  <section>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      {/* Video length */}
                      <div>
                        <label className="block text-sm font-medium text-gray-900">
                          Video length
                        </label>
                        <div className="mt-2 space-y-1">
                          {[
                            {
                              v: "30_45" as LengthChoice,
                              l: "30–45s",
                              badge: "Most popular",
                              priceLabel: "Standard",
                            },
                            {
                              v: "60_90" as LengthChoice,
                              l: "60–90s",
                              priceLabel:
                                addOnLongZar > 0 ? `+ ${formatCurrency(addOnLongZar)}` : "No extra cost",
                            },
                          ].map((opt) => {
                            const active = form.lengthChoice === opt.v;
                            return (
                              <button
                                key={opt.v}
                                type="button"
                                onClick={() => form.setLengthChoice(opt.v)}
                                className={[
                                  "w-full rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10",
                                  active ? "bg-gray-100" : "hover:bg-gray-50",
                                ].join(" ")}
                                aria-pressed={active}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <div className="text-sm font-semibold text-gray-900">
                                        {opt.l}
                                      </div>
                                      {opt.badge ? (
                                        <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white">
                                          {opt.badge}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-xs font-semibold text-gray-700">
                                    {opt.priceLabel}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Language */}
                      <div>
                        <label className="block text-sm font-medium text-gray-900">
                          Language
                        </label>
                        <div
                          className={[
                            "mt-2 grid gap-1",
                            languageOptions.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3",
                          ].join(" ")}
                        >
                          {languageOptions.map((l) => {
                            const active = form.language === l.v;
                            return (
                              <button
                                key={l.v}
                                type="button"
                                onClick={() => form.setLanguage(l.v)}
                                className={[
                                  "rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10",
                                  active
                                    ? "bg-gray-100 text-gray-900"
                                    : "hover:bg-gray-50 text-gray-800",
                                ].join(" ")}
                                aria-pressed={active}
                              >
                                {l.l}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">No charge yet.</span> You’ll
                      review the full total and can add a promo code on the next screen.
                    </p>
                  </section>
                </div>
              </div>

              {/* Sticky footer */}
              <div
                className="border-t border-gray-100 bg-white px-4 sm:px-6 pt-4"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <div className="text-sm text-gray-600">
                        {ENABLE_PV_ORDERS ? "Estimated provider total" : "Estimated total"}
                      </div>
                      <div className="text-xl font-bold text-gray-900">{formatCurrency(pricing.total)}</div>
                      {pricing.discount > 0 && (
                        <div className="text-xs font-medium text-emerald-700">
                          ({formatCurrency(pricing.discount)} off)
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      Base {formatCurrency(pricing.basePriceZar)}
                      {pricing.priceAddOn > 0 ? ` • Length ${formatCurrency(pricing.priceAddOn)}` : ""}
                      {pricing.rushFee > 0 ? ` • Rush ${formatCurrency(pricing.rushFee)}` : ""}
                      {pricing.discount > 0 ? ` • Discount −${formatCurrency(pricing.discount)}` : ""}
                      {ENABLE_PV_ORDERS ? " • Fees/VAT shown on next screen" : ""}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    {status.disabledReason && (
                      <div className="sm:hidden text-xs text-gray-500">{status.disabledReason}</div>
                    )}

                    <Button
                      onClick={actions.createOrUpdateDraft}
                      disabled={!status.canContinue}
                      className="w-full sm:w-auto"
                      title={status.disabledReason || undefined}
                    >
                      {state.flags.creatingDraft ? "Creating…" : "Continue to payment"}
                    </Button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="hidden sm:inline-flex px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {!status.canContinue && status.disabledReason && (
                  <div className="hidden sm:block mt-2 text-xs text-gray-500">{status.disabledReason}</div>
                )}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

// =============================================================================
// STEP 2 — PAYMENT PAGE
// =============================================================================

export function VideoPaymentPage({ orderId }: { orderId: number }) {
  const { state, actions } = usePvEngine({
    artistId: 0,
    basePriceZar: 0,
    addOnLongZar: 0,
    orderId,
  });

  const { orderSummary, payment } = state;
  const { reloadOrderSummary, applyPromoCode, startPayment } = actions;
  const [promoCode, setPromoCode] = React.useState("");
  const [promoStatus, setPromoStatus] = React.useState<"idle" | "applied" | "error">("idle");

  const isInitialLoading = payment.loading && !orderSummary;
  if (isInitialLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!orderSummary) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="text-red-600 font-medium">Unable to load order.</div>
          {payment.error && <div className="mt-2 text-sm text-gray-600">{payment.error}</div>}
          <div className="mt-4 flex gap-2">
            <Button onClick={reloadOrderSummary}>Try again</Button>
            <Button variant="secondary" onClick={() => window.history.back()}>
              Go back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const canPaystack = payment.canPay;
  const clientTotal =
    typeof orderSummary.clientTotalInclVat === "number" &&
    Number.isFinite(orderSummary.clientTotalInclVat) &&
    orderSummary.clientTotalInclVat > 0
      ? orderSummary.clientTotalInclVat
      : null;
  const totalToPay =
    ENABLE_PV_ORDERS && clientTotal !== null ? clientTotal : orderSummary.total;
  const canStartPayment = canPaystack || !ENABLE_PV_ORDERS;
  const canApplyPromo =
    (String(orderSummary.status || "").toLowerCase() === "awaiting_payment" ||
      String(orderSummary.status || "").toLowerCase() === "draft") &&
    !payment.loading;

  return (
    <div className="min-h-[100dvh] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-xl shadow-gray-200/50">
            <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CreditCardIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">Complete payment</h1>
              <p className="text-sm text-gray-500">Order #{orderId}</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Delivery by</span>
              <span className="font-medium text-gray-900">
                {new Date(orderSummary.deliveryByUtc).toLocaleDateString()}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <span className="text-gray-500">Length</span>
              <span className="font-medium text-gray-900">~{orderSummary.lengthSec}s</span>
            </div>

            <div className="mt-3 border-t border-gray-200 pt-3">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Base</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(orderSummary.priceBase)}
                </span>
              </div>
              {orderSummary.priceAddons > 0 && (
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-gray-500">Length add-on</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(orderSummary.priceAddons)}
                  </span>
                </div>
              )}
              {orderSummary.priceRush > 0 && (
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-gray-500">Rush</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(orderSummary.priceRush)}
                  </span>
                </div>
              )}
              {orderSummary.discount > 0 && (
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-gray-500">Discount</span>
                  <span className="font-medium text-emerald-700">
                    −{formatCurrency(orderSummary.discount)}
                  </span>
                </div>
              )}

              <div className="mt-3 flex justify-between text-base">
                <span className="font-semibold text-gray-900">
                  {ENABLE_PV_ORDERS && clientTotal !== null ? "Provider total" : "Total"}
                </span>
                <span className="font-bold text-gray-900">
                  {formatCurrency(orderSummary.total)}
                </span>
              </div>
              {ENABLE_PV_ORDERS && clientTotal !== null && (
                <div className="mt-2 flex justify-between text-base">
                  <span className="font-semibold text-gray-900">
                    Total to pay (incl fees + VAT)
                  </span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(clientTotal)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <TextInput
                    label="Promo code"
                    value={promoCode}
                    onChange={(e: any) => {
                      setPromoCode(e.target.value);
                      setPromoStatus("idle");
                    }}
                    placeholder="SAVE10"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canApplyPromo || !promoCode.trim()}
                  onClick={async () => {
                    const ok = await applyPromoCode(promoCode);
                    setPromoStatus(ok ? "applied" : "error");
                  }}
                  className="h-11"
                >
                  Apply
                </Button>
              </div>
              {promoStatus === "applied" && orderSummary.discount > 0 && (
                <div className="mt-2 text-xs font-medium text-emerald-700">Promo applied.</div>
              )}
              {promoStatus === "error" && payment.error && (
                <div className="mt-2 text-xs font-medium text-red-600">{payment.error}</div>
              )}
            </div>
          </div>

          <div className="mt-6">
            <Button
              onClick={startPayment}
              variant={canStartPayment ? "primary" : "secondary"}
              disabled={!canStartPayment || payment.loading}
              className="w-full h-11 text-base"
            >
              {canPaystack
                ? "Pay"
                : ENABLE_PV_ORDERS
                ? "Paystack not configured"
                : "Simulate payment (demo)"}{" "}
              {formatCurrency(totalToPay)}
            </Button>
          </div>

          {payment.error && promoStatus !== "error" && (
            <div className="mt-3 text-xs font-medium text-red-600">{payment.error}</div>
          )}

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
            <ShieldCheckIcon className="h-4 w-4" />
            <span>
              {canPaystack
                ? "Payments processed securely."
                : ENABLE_PV_ORDERS
                ? "Payments are unavailable until Paystack is configured."
                : "Payment provider not configured (demo mode)."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// STEP 3 — BRIEF PAGE
// =============================================================================

export function VideoChatBrief({ orderId, threadId }: { orderId: number; threadId?: number }) {
  const { user } = useAuth();
  const { state, actions } = usePvEngine({
    artistId: 0,
    basePriceZar: 0,
    addOnLongZar: 0,
    orderId,
    threadId,
  });

  const { brief, orderSummary } = state;
  const { updateAnswer, submitBrief } = actions;

  const viewerId = Number(user?.id ?? 0) || 0;
  const buyerId = Number(orderSummary?.buyerId ?? 0) || 0;
  const viewerType = String(user?.user_type || "").toLowerCase();
  const assumeReadOnly = viewerType === "service_provider";
  const canEditBrief = Boolean(
    orderSummary ? viewerId > 0 && buyerId > 0 && viewerId === buyerId : !assumeReadOnly,
  );

  const answers = brief.answers;
  const saveState = brief.saveState;
  const progress = brief.progress;
  const questions = BRIEF_QUESTIONS;
  const deliveryLabel = useMemo(() => {
    const raw = orderSummary?.deliveryByUtc;
    if (!raw) return null;
    try {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) return null;
      return new Intl.DateTimeFormat("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(d);
    } catch {
      return null;
    }
  }, [orderSummary?.deliveryByUtc]);

  const saveLabel = useMemo(() => {
    if (!canEditBrief) return "Read-only";
    if (saveState === "saving") return "Saving…";
    if (saveState === "saved") return "Saved";
    if (saveState === "error") return "Offline — will retry";
    return "Autosave on";
  }, [saveState, canEditBrief]);

  const percent = progress.total > 0 ? Math.round((progress.answered / progress.total) * 100) : 0;

  return (
    <div className="min-h-[100dvh] mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-gray-100 pb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Video brief</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
            <span>Order #{orderId}</span>
            {deliveryLabel ? (
              <>
                <span aria-hidden className="text-gray-300">•</span>
                <span>
                  Delivery by <span className="font-medium text-gray-800">{deliveryLabel}</span>
                </span>
              </>
            ) : null}
            <span aria-hidden className="text-gray-300">•</span>
            <span className="font-medium text-emerald-700">
              {progress.answered}/{progress.total} completed
            </span>
            <span aria-hidden className="text-gray-300">•</span>
            <span className={saveState === "error" ? "text-amber-700 font-medium" : "text-gray-500"}>{saveLabel}</span>
          </div>

          <div className="mt-3">
            <div className="w-full h-2 rounded bg-gray-100" aria-hidden="true">
              <div className="h-2 rounded bg-black" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>

        <button
          onClick={() => typeof window !== "undefined" && window.print()}
          className="no-print inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 self-start sm:self-auto"
          type="button"
        >
          <PrinterIcon className="h-4 w-4" />
          Print
        </button>
      </div>

      {/* Guidance */}
      {canEditBrief ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
          Tip: Keep it simple — the artist can improvise if you give a few strong personal details.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
          This brief is read-only for the artist.
        </div>
      )}

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q) => (
          <div
            key={q.key}
            className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <label className="block text-sm font-semibold text-gray-900">{q.label}</label>
              {answers[q.key] != null && String(answers[q.key]).trim?.() ? (
                <span className="text-xs font-medium text-emerald-700">Answered</span>
              ) : (
                <span className="text-xs text-gray-400">Optional</span>
              )}
            </div>

            {"helper" in q && q.helper ? (
              <p className="mt-1 text-xs text-gray-500">{q.helper}</p>
            ) : null}

            {q.type === "text" ? (
              canEditBrief ? (
                <div className="mt-3">
                  <TextArea
                    rows={q.rows ?? 3}
                    className="w-full resize-none rounded-xl border-gray-200 text-sm focus:border-black focus:ring-black"
                    placeholder={q.placeholder || "Type here…"}
                    value={answers[q.key] || ""}
                    onChange={(e: any) => updateAnswer(q.key, e.target.value)}
                    onBlur={() => updateAnswer(q.key, answers[q.key] || "", { immediate: true })}
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap">
                  {String(answers[q.key] || "").trim() ? String(answers[q.key]) : "—"}
                </div>
              )
            ) : canEditBrief ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const active = answers[q.key] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => updateAnswer(q.key, opt, { immediate: true })}
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-medium border transition",
                        active
                          ? "border-black bg-black text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                      ].join(" ")}
                      aria-pressed={active}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-800">
                {String(answers[q.key] || "").trim() ? (
                  <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-800">
                    {String(answers[q.key])}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sticky action bar */}
      {canEditBrief ? (
        <div className="no-print sticky bottom-0 z-10">
          <div
            className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white/90 backdrop-blur px-3 py-2 shadow-xl flex items-center gap-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-500">Autosave on • You can come back anytime</div>
              <div className="text-sm font-medium text-gray-900">
                Progress: {progress.answered}/{progress.total}
              </div>
            </div>

            <Button onClick={submitBrief} className="shrink-0">
              <ChatBubbleBottomCenterTextIcon className="h-4 w-4 mr-2" />
              Mark complete
            </Button>
          </div>
        </div>
      ) : null}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          textarea,
          input {
            border: none !important;
            padding: 0 !important;
            box-shadow: none !important;
            resize: none !important;
          }
        }
      `}</style>
    </div>
  );
}

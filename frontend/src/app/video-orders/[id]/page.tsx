"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import { Spinner } from "@/components/ui";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { videoOrderApiClient, type VideoOrder } from "@/features/booking/personalizedVideo/engine/apiClient";
import VideoOrderStatusTimeline from "@/features/booking/personalizedVideo/ui/VideoOrderStatusTimeline";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";

const SidebarLink = ({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) => (
  <Link
    href={href}
    className={`block w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
      active ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`}
  >
    {label}
  </Link>
);

const ENABLE_PV_ORDERS =
  (process.env.NEXT_PUBLIC_ENABLE_PV_ORDERS ?? "") === "1";

export default function VideoOrderPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const id = Number(params.id);
  const [loading, setLoading] = React.useState(true);
  const [order, setOrder] = React.useState<VideoOrder | null>(null);
  const [threadId, setThreadId] = React.useState<string | number | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id || Number.isNaN(id)) return;
    let cancelled = false;
    setLoading(true);
    videoOrderApiClient
      .getOrder(id)
      .then((o) => {
        if (!cancelled) setOrder(o);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  React.useEffect(() => {
    if (!id || typeof window === "undefined") return;
    try {
      const tid = window.localStorage.getItem(`vo-thread-${id}`);
      if (tid) {
        setThreadId(tid);
      } else if (ENABLE_PV_ORDERS) {
        setThreadId(id);
      } else {
        setThreadId(null);
      }
    } catch {
      setThreadId(ENABLE_PV_ORDERS ? id : null);
    }
  }, [id]);

  if (!id || Number.isNaN(id)) {
    return (
      <MainLayout>
        <div className="p-6 text-red-600">Invalid order id</div>
      </MainLayout>
    );
  }

  const status = String(order?.status || "").toLowerCase();
  const needsPayment = status === "awaiting_payment";
  const needsBrief = status === "paid" || status === "info_pending";
  const inProduction = status === "in_production";
  const delivered = status === "delivered";
  const completed = status === "completed" || status === "closed";
  const cancelled = status === "cancelled" || status === "canceled";
  const refunded = status === "refunded";
  const inDispute = status === "in_dispute";

  const viewerIsProvider = !authLoading && user?.user_type === "service_provider";
  const viewerReady = !authLoading && !!user;
  const viewerIsClient = !authLoading && user?.user_type === "client";
  const ordersHref = viewerIsClient ? "/dashboard/client?tab=orders" : "/dashboard/artist";

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-12 md:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          {viewerIsClient ? (
            <aside className="hidden w-64 shrink-0 md:block md:sticky md:top-[var(--sp-sticky-top)] md:self-start">
              <div className="space-y-6">
                <div className="px-1">
                  <p className="text-xs font-semibold text-gray-500">My Account</p>
                </div>
                <nav className="space-y-1">
                  <SidebarLink href="/dashboard/client?tab=orders" label="Orders" active />
                  <SidebarLink href="/dashboard/client?tab=requests" label="Requests" />
                  <SidebarLink href="/dashboard/client?tab=invoices" label="Invoices" />
                  <SidebarLink href="/dashboard/client?tab=disputes" label="Disputes" />
                  <SidebarLink href="/dashboard/client?tab=reviews" label="Reviews" />
                  <SidebarLink href="/dashboard/client?tab=my_list" label="My List" />
                </nav>
              </div>
            </aside>
          ) : null}

          <main className="min-w-0 flex-1 space-y-4">
            {viewerIsClient ? (
              <nav className="text-sm text-gray-500">
                <Link href="/dashboard/client?tab=orders" className="hover:underline">
                  My Account
                </Link>{" "}
                /{" "}
                <Link href="/dashboard/client?tab=orders" className="hover:underline">
                  Orders
                </Link>{" "}
                / <span className="text-gray-700">Order Detail</span>
              </nav>
            ) : null}

            <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900">Order Detail</h1>
                  <p className="mt-1 text-sm text-gray-600">Personalised Video • Order #{id}</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Link
                    href={ordersHref}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    View all orders
                  </Link>
                </div>
              </div>

              {loading ? (
                <div className="py-10 flex justify-center">
                  <Spinner />
                </div>
              ) : !order ? (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  Unable to load order.
                </div>
              ) : (
                <>
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-gray-200 p-4">
                      <p className="text-sm font-semibold text-gray-900">Order</p>
                      <p className="mt-2 text-xs text-gray-500">
                        Ordered{" "}
                        {order.created_at_utc
                          ? format(new Date(order.created_at_utc), "d MMM yyyy")
                          : "—"}
                        {" • "}Paid{" "}
                        {order.paid_at_utc ? format(new Date(order.paid_at_utc), "d MMM yyyy") : "—"}
                      </p>
                      <p className="mt-3 text-xs text-gray-500">
                        Status:{" "}
                        <span className="font-semibold text-gray-900 capitalize">
                          {status.replace(/_/g, " ")}
                        </span>
                      </p>
                      <p className="mt-3 text-xs text-gray-500">
                        Delivery by{" "}
                        <span className="font-semibold text-gray-900">
                          {order.delivery_by_utc
                            ? format(new Date(order.delivery_by_utc), "d MMM yyyy")
                            : "—"}
                        </span>
                      </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <p className="text-sm font-semibold text-gray-900">Order Summary</p>
                      <div className="mt-3 flex items-center justify-between text-sm text-gray-700">
                        <span>Total</span>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(Number(order.total || 0))}
                        </span>
                      </div>
                      <div className="mt-4">
                        <VideoOrderStatusTimeline status={status} deliveryByUtc={order.delivery_by_utc} />
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <p className="text-sm font-semibold text-gray-900">Next Steps</p>

                      {cancelError ? (
                        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                          {cancelError}
                        </div>
                      ) : null}

                      {cancelled ? (
                        <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                          This order was cancelled.
                        </div>
                      ) : null}

                      {refunded ? (
                        <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                          This order was refunded.
                        </div>
                      ) : null}

                      {inDispute ? (
                        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                          A dispute is open for this order. Our team will review the details.
                        </div>
                      ) : null}

                      {(delivered || completed) ? (
                        <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                          Delivered. Check chat for the delivery message.
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-col gap-2">
                        {needsPayment && (
                          <Button
                            className="w-full"
                            onClick={() => router.push(`/video-orders/${id}/pay`)}
                            disabled={cancelSubmitting}
                          >
                            Complete payment
                          </Button>
                        )}
                        {needsPayment && !viewerIsProvider && (
                          <Button
                            className="w-full"
                            variant="secondary"
                            disabled={cancelSubmitting}
                            onClick={async () => {
                              if (typeof window !== "undefined") {
                                const ok = window.confirm("Cancel this order?");
                                if (!ok) return;
                              }
                              setCancelSubmitting(true);
                              setCancelError(null);
                              try {
                                await videoOrderApiClient.updateStatus(id, "cancelled");
                                const refreshed = await videoOrderApiClient.getOrder(id);
                                if (refreshed) {
                                  setOrder(refreshed);
                                } else {
                                  setCancelError("Unable to cancel order. Please try again.");
                                }
                              } catch {
                                setCancelError("Unable to cancel order. Please try again.");
                              } finally {
                                setCancelSubmitting(false);
                              }
                            }}
                          >
                            {cancelSubmitting ? "Cancelling…" : "Cancel order"}
                          </Button>
                        )}
                        {needsBrief && (
                          <Button
                            className="w-full"
                            onClick={() => router.push(`/video-orders/${id}/brief`)}
                          >
                            {!viewerReady
                              ? "View brief"
                              : viewerIsProvider
                              ? "View brief"
                              : "Complete brief"}
                          </Button>
                        )}
                        {ENABLE_PV_ORDERS && viewerIsProvider && inProduction && (
                          <Button
                            className="w-full"
                            variant="secondary"
                            onClick={() => router.push(`/video-orders/${id}/deliver`)}
                          >
                            Deliver video
                          </Button>
                        )}
                        {ENABLE_PV_ORDERS && viewerIsProvider && (delivered || completed) && (
                          <Button
                            className="w-full"
                            variant="secondary"
                            onClick={() => router.push(`/video-orders/${id}/deliver`)}
                          >
                            View video
                          </Button>
                        )}

                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (threadId) {
                              router.push(`/inbox?requestId=${threadId}`);
                            } else {
                              router.push("/inbox");
                            }
                          }}
                          className="w-full"
                        >
                          Open chat
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </MainLayout>
  );
}

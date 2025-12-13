"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { Spinner } from "@/components/ui";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { videoOrderApiClient, type VideoOrder } from "@/features/booking/personalizedVideo/engine/apiClient";

const ENABLE_PV_ORDERS =
  (process.env.NEXT_PUBLIC_ENABLE_PV_ORDERS ?? "") === "1";

export default function VideoOrderPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const id = Number(params.id);
  const [loading, setLoading] = React.useState(true);
  const [order, setOrder] = React.useState<VideoOrder | null>(null);
  const [threadId, setThreadId] = React.useState<string | number | null>(null);

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

  const viewerIsProvider = user?.user_type === "service_provider";

  return (
    <MainLayout>
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900">Video order</h1>
          <p className="mt-1 text-sm text-gray-600">Order #{id}</p>

          {loading ? (
            <div className="mt-6 flex justify-center">
              <Spinner />
            </div>
          ) : !order ? (
            <div className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              Unable to load order.
            </div>
          ) : (
            <>
              <div className="mt-4 text-xs text-gray-500">
                Status:{" "}
                <span className="font-semibold">{status.replace(/_/g, " ")}</span>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                {needsPayment && (
                  <Button
                    className="w-full"
                    onClick={() => router.push(`/video-orders/${id}/pay`)}
                  >
                    Complete payment
                  </Button>
                )}
                {needsBrief && (
                  <Button
                    className="w-full"
                    onClick={() => router.push(`/video-orders/${id}/brief`)}
                  >
                    {viewerIsProvider ? "View brief" : "Complete brief"}
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
                {(delivered || completed) && (
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                    Delivered. Check chat for the delivery message.
                  </div>
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
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

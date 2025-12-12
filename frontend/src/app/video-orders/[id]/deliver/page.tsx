"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { Button, TextArea, TextInput, Spinner } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { videoOrderApiClient } from "@/features/booking/personalizedVideo/engine/apiClient";

const ENABLE_PV_ORDERS =
  (process.env.NEXT_PUBLIC_ENABLE_PV_ORDERS ?? "") === "1";

export default function VideoOrderDeliverPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const id = Number(params.id);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [deliveryUrl, setDeliveryUrl] = React.useState("");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!id || Number.isNaN(id)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    videoOrderApiClient
      .getOrder(id)
      .then((order) => {
        if (cancelled) return;
        setStatus(String(order?.status || "").toLowerCase() || null);
        setLoading(false);
        if (!order) setError("Unable to load order.");
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setError("Unable to load order.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id || Number.isNaN(id)) {
    return (
      <MainLayout>
        <div className="p-6 text-red-600">Invalid order id</div>
      </MainLayout>
    );
  }

  if (!ENABLE_PV_ORDERS) {
    return (
      <MainLayout>
        <div className="p-6 text-gray-700">Delivery is not enabled.</div>
      </MainLayout>
    );
  }

  const viewerIsProvider = user?.user_type === "service_provider";

  return (
    <MainLayout>
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900">Deliver video</h1>
          <p className="mt-1 text-sm text-gray-600">Order #{id}</p>

          {loading ? (
            <div className="mt-6 flex justify-center">
              <Spinner />
            </div>
          ) : (
            <>
              {status && (
                <div className="mt-4 text-xs text-gray-500">
                  Current status:{" "}
                  <span className="font-semibold">{status.replace(/_/g, " ")}</span>
                </div>
              )}

              {!viewerIsProvider && (
                <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  Only the artist can deliver this order.
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-6 space-y-4">
                <TextInput
                  label="Delivery link"
                  value={deliveryUrl}
                  onChange={(e: any) => setDeliveryUrl(e.target.value)}
                  placeholder="https://…"
                />
                <TextArea
                  label="Message (optional)"
                  value={note}
                  onChange={(e: any) => setNote(e.target.value)}
                  placeholder="Any notes for the client…"
                  rows={4}
                />
              </div>

              <div className="mt-6 flex gap-2">
                <Button
                  onClick={async () => {
                    if (!viewerIsProvider) return;
                    setSubmitting(true);
                    setError(null);
                    try {
                      const res = await videoOrderApiClient.deliverOrder(id, {
                        delivery_url: deliveryUrl.trim() || undefined,
                        note: note.trim() || undefined,
                      });
                      if (!res) {
                        setError("Delivery failed. Please try again.");
                        setSubmitting(false);
                        return;
                      }
                      router.push(`/inbox?requestId=${id}`);
                    } catch {
                      setError("Delivery failed. Please try again.");
                      setSubmitting(false);
                    }
                  }}
                  disabled={submitting || !viewerIsProvider}
                >
                  {submitting ? "Delivering…" : "Mark as delivered"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/inbox?requestId=${id}`)}
                >
                  Back to chat
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}


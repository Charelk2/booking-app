"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { BottomSheet, Button, TextArea, TextInput, Spinner, Toast } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { videoOrderApiClient } from "@/features/booking/personalizedVideo/engine/apiClient";
import { uploadMessageAttachment } from "@/lib/api";

const ENABLE_PV_ORDERS =
  (process.env.NEXT_PUBLIC_ENABLE_PV_ORDERS ?? "") === "1";

export default function VideoOrderDeliverPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const id = Number(params.id);
  const [loading, setLoading] = React.useState(true);
  const [order, setOrder] = React.useState<any | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [deliveryUrl, setDeliveryUrl] = React.useState("");
  const [note, setNote] = React.useState("");
  const [uploadPct, setUploadPct] = React.useState<number>(0);
  const [deliveryFile, setDeliveryFile] = React.useState<File | null>(null);
  const [existingAttachmentUrl, setExistingAttachmentUrl] = React.useState<string | null>(null);
  const [existingAttachmentMeta, setExistingAttachmentMeta] = React.useState<any | null>(null);
  const [revisionOpen, setRevisionOpen] = React.useState(false);
  const [revisionMessage, setRevisionMessage] = React.useState("");
  const [revisionError, setRevisionError] = React.useState<string | null>(null);
  const [revisionSubmitting, setRevisionSubmitting] = React.useState(false);
  const revisionFieldRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!revisionOpen) return;
    setRevisionMessage("");
    setRevisionError(null);
  }, [revisionOpen]);

  React.useEffect(() => {
    if (!id || Number.isNaN(id)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    videoOrderApiClient
      .getOrder(id)
      .then((order) => {
        if (cancelled) return;
        setOrder(order || null);
        setStatus(String(order?.status || "").toLowerCase() || null);
        setDeliveryUrl(String(order?.delivery_url || "").trim());
        setNote(String(order?.delivery_note || "").trim());
        const attUrl = String(order?.delivery_attachment_url || "").trim();
        setExistingAttachmentUrl(attUrl ? attUrl : null);
        setExistingAttachmentMeta(order?.delivery_attachment_meta || null);
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

  const viewerId = user?.id ? Number(user.id) : null;
  const viewerIsProvider = (() => {
    if (viewerId && order) return viewerId === Number(order?.artist_id || 0);
    return user?.user_type === "service_provider";
  })();
  const viewerIsClient = (() => {
    if (viewerId && order) return viewerId === Number(order?.buyer_id || 0);
    return !viewerIsProvider;
  })();
  const isDelivered = String(status || "").toLowerCase() === "delivered";
  const revisionsIncluded = (() => {
    const raw = (order as any)?.revisions_included;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(10, Math.trunc(n)));
  })();
  const revisionRequestsCount = Array.isArray((order as any)?.revision_requests)
    ? (order as any).revision_requests.length
    : 0;
  const revisionsRemaining = Math.max(0, revisionsIncluded - revisionRequestsCount);

  return (
    <MainLayout>
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900">
            {viewerIsProvider
              ? isDelivered
                ? "Delivery"
                : "Deliver video"
              : isDelivered
                ? "View video"
                : "Video delivery"}
          </h1>
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

              {error && (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {viewerIsProvider ? (
                <>
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
                    <div>
                      <label className="block text-sm font-medium text-gray-900">
                        Delivery attachment (optional)
                      </label>
                      <div className="mt-2 space-y-2">
                        {existingAttachmentUrl ? (
                          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                            <a
                              href={existingAttachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 truncate text-sm font-medium text-gray-900 hover:underline"
                            >
                              {String(existingAttachmentMeta?.original_filename || "View attachment")}
                            </a>
                            <Button
                              variant="secondary"
                              onClick={async () => {
                                if (!viewerIsProvider) return;
                                setSubmitting(true);
                                setError(null);
                                try {
                                  const res = await videoOrderApiClient.deliverOrder(id, {
                                    attachment_url: null,
                                    attachment_meta: null,
                                  });
                                  if (!res) {
                                    setError("Failed to update delivery. Please try again.");
                                    setSubmitting(false);
                                    return;
                                  }
                                  setOrder(res as any);
                                  setExistingAttachmentUrl(null);
                                  setExistingAttachmentMeta(null);
                                  setSubmitting(false);
                                } catch {
                                  setError("Failed to update delivery. Please try again.");
                                  setSubmitting(false);
                                }
                              }}
                              disabled={submitting || !viewerIsProvider}
                            >
                              Remove
                            </Button>
                          </div>
                        ) : null}

                        <input
                          type="file"
                          accept="video/*,image/*,audio/*,.pdf,.zip,.rar"
                          className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-white hover:bg-gray-50 focus:outline-none"
                          onChange={(e: any) => {
                            const f = (e.target?.files && e.target.files[0]) || null;
                            setDeliveryFile(f);
                          }}
                          disabled={!viewerIsProvider || submitting}
                        />
                        {deliveryFile ? (
                          <div className="text-xs text-gray-500">
                            Selected:{" "}
                            <span className="font-medium text-gray-700">{deliveryFile.name}</span>
                          </div>
                        ) : null}
                        {submitting && uploadPct > 0 ? (
                          <div className="text-xs text-gray-500">Uploading… {uploadPct}%</div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex gap-2">
                    <Button
                      onClick={async () => {
                        if (!viewerIsProvider) return;
                        setSubmitting(true);
                        setError(null);
                        setUploadPct(0);
                        try {
                          let attachmentUrl: string | null = null;
                          let attachmentMeta: any | null = null;
                          if (deliveryFile) {
                            const uploaded = await uploadMessageAttachment(
                              id,
                              deliveryFile,
                              (evt: any) => {
                                try {
                                  const total = Number(evt?.total || 0) || 0;
                                  const loaded = Number(evt?.loaded || 0) || 0;
                                  if (total > 0) {
                                    const pct = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
                                    setUploadPct(pct);
                                  }
                                } catch {}
                              },
                            );
                            attachmentUrl = String(uploaded?.data?.url || "").trim() || null;
                            attachmentMeta = (uploaded as any)?.data?.metadata || null;
                          }

                          const res = await videoOrderApiClient.deliverOrder(id, {
                            delivery_url: deliveryUrl.trim() || null,
                            note: note.trim() || null,
                            ...(attachmentUrl
                              ? { attachment_url: attachmentUrl, attachment_meta: attachmentMeta }
                              : {}),
                          });
                          if (!res) {
                            setError("Delivery failed. Please try again.");
                            setSubmitting(false);
                            return;
                          }
                          setOrder(res as any);
                          setStatus(String((res as any)?.status || "").toLowerCase() || null);
                          setDeliveryFile(null);
                          setExistingAttachmentUrl(String((res as any)?.delivery_attachment_url || "").trim() || null);
                          setExistingAttachmentMeta((res as any)?.delivery_attachment_meta || null);
                          setSubmitting(false);
                          router.push(`/inbox?requestId=${id}`);
                        } catch {
                          setError("Delivery failed. Please try again.");
                          setSubmitting(false);
                        }
                      }}
                      disabled={submitting || !viewerIsProvider}
                    >
                      {submitting ? "Saving…" : isDelivered ? "Save changes" : "Mark as delivered"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => router.push(`/inbox?requestId=${id}`)}
                    >
                      Back to chat
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {!isDelivered ? (
                    <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                      Your video hasn’t been delivered yet.
                    </div>
                  ) : (
                    <div className="mt-6 space-y-4">
                      {deliveryUrl.trim() ? (
                        <a
                          href={deliveryUrl.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 no-underline hover:bg-gray-50 hover:no-underline"
                        >
                          Open delivery link
                        </a>
                      ) : null}
                      {existingAttachmentUrl ? (
                        <a
                          href={existingAttachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 no-underline hover:bg-gray-50 hover:no-underline"
                        >
                          Download attachment
                        </a>
                      ) : null}
                      {note.trim() ? (
                        <div className="rounded-xl bg-gray-50 p-4">
                          <div className="text-xs font-semibold text-gray-900">Note</div>
                          <div className="mt-1 whitespace-pre-line text-sm text-gray-700">
                            {note.trim()}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                    {viewerIsClient && isDelivered && revisionsRemaining > 0 ? (
                      <Button onClick={() => setRevisionOpen(true)} disabled={revisionSubmitting}>
                        Ask for revision
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      onClick={() => router.push(`/inbox?requestId=${id}`)}
                    >
                      Back to chat
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {viewerIsClient ? (
        <BottomSheet
          open={revisionOpen}
          onClose={() => setRevisionOpen(false)}
          initialFocus={revisionFieldRef}
          desktopCenter
          panelClassName="md:max-w-md md:mx-auto"
          title="Request a revision"
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const msg = revisionMessage.trim();
              if (!msg) {
                setRevisionError("Please describe what you’d like revised.");
                return;
              }
              setRevisionSubmitting(true);
              setRevisionError(null);
              try {
                const updated = await videoOrderApiClient.requestRevision(id, msg);
                if (updated) setOrder(updated as any);
                setRevisionOpen(false);
                Toast.success("Revision request sent");
              } catch (err: any) {
                setRevisionError(err?.message || "Unable to request a revision");
              } finally {
                setRevisionSubmitting(false);
              }
            }}
            className="flex flex-col p-4 max-h-[90vh] md:max-h-none min-h-0"
          >
            <h2 className="text-lg font-semibold text-gray-900">Ask for a revision</h2>
            <p className="mt-1 text-sm text-gray-600">
              {revisionsRemaining} revision{revisionsRemaining === 1 ? "" : "s"} remaining.
            </p>
            <div className="mt-4 flex-1 overflow-y-auto">
              <TextArea
                ref={revisionFieldRef}
                label="What should be changed?"
                value={revisionMessage}
                onChange={(e: any) => setRevisionMessage(e.target.value)}
                rows={6}
                error={revisionError || undefined}
                placeholder="Tell the provider what you’d like updated (tone, wording, missing details, etc.)"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRevisionOpen(false)}
                disabled={revisionSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={revisionSubmitting}>
                Send request
              </Button>
            </div>
          </form>
        </BottomSheet>
      ) : null}
    </MainLayout>
  );
}

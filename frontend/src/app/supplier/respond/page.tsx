"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { supplierRespondToOutreach } from "@/lib/api";

export default function SupplierRespondPage() {
  const search = useSearchParams();
  const router = useRouter();
  const bookingId = useMemo(() => Number(search.get("booking_id") || 0), [search]);
  const serviceId = useMemo(() => Number(search.get("service_id") || 0), [search]);
  const token = useMemo(() => String(search.get("token") || ""), [search]);
  const [price, setPrice] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkOk, setLinkOk] = useState<boolean>(true);

  const canSubmit = bookingId > 0 && serviceId > 0 && token.length > 0;

  useEffect(() => {
    if (!canSubmit) setError("Missing or invalid link parameters.");
    // Validate link/token ahead of time by probing the respond endpoint with a
    // deliberate 422: ACCEPT without a price should only succeed to the point
    // of validation when the token is valid and the request is still pending.
    const validate = async () => {
      if (!canSubmit) return;
      setBusy(true);
      try {
        const res = await supplierRespondToOutreach(bookingId, serviceId, { action: "ACCEPT", lock_token: token });
        // Some non-SENT states return 200 with a status field
        const st = (res?.data as any)?.status;
        if (typeof st === 'string' && st && st.toLowerCase() !== 'sent') {
          setLinkOk(false);
          setStatus(st.toLowerCase());
          setError(st.toLowerCase() === 'expired' ? 'This link has expired.' : `This request is already ${st}.`);
        } else {
          setLinkOk(true);
        }
      } catch (e: any) {
        const code = Number(e?.response?.status || 0);
        if (code === 422) {
          // Valid link/token; price missing expected
          setLinkOk(true);
          setError('');
        } else if (code === 403 || code === 404) {
          setLinkOk(false);
          setError('This link is invalid or has expired.');
        } else {
          // Unknown; keep form enabled but show hint
          setLinkOk(true);
          setError(e?.message || 'Unable to validate the link right now.');
        }
      } finally {
        setBusy(false);
      }
    };
    validate();
  }, [canSubmit]);

  const mapApiError = (e: any) => {
    try {
      const code = Number(e?.response?.status || 0);
      setStatusCode(Number.isFinite(code) ? code : null);
      if (code === 403) return "This link is invalid or has expired.";
      if (code === 404) return "This request was not found or has already expired.";
      if (code === 422) return "Please provide a valid firm price.";
      // backend may return structured detail
      const msg = e?.response?.data?.detail?.message || e?.response?.data?.detail || e?.message;
      return typeof msg === 'string' && msg ? msg : "Unable to complete the request.";
    } catch {
      return "Unable to complete the request.";
    }
  };

  const accept = async () => {
    setError("");
    setStatusCode(null);
    if (!canSubmit) return;
    const value = parseFloat(price || "0");
    if (!Number.isFinite(value) || value <= 0) {
      setError("Please enter a valid price.");
      return;
    }
    setBusy(true);
    try {
      await supplierRespondToOutreach(bookingId, serviceId, { action: "ACCEPT", price: value, lock_token: token });
      setStatus("accepted");
    } catch (e: any) {
      setError(mapApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setError("");
    setStatusCode(null);
    if (!canSubmit) return;
    setBusy(true);
    try {
      await supplierRespondToOutreach(bookingId, serviceId, { action: "DECLINE", lock_token: token });
      setStatus("declined");
    } catch (e: any) {
      setError(mapApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-lg mx-auto mt-10 p-6 bg-white rounded-lg shadow">
        <h1 className="text-xl font-semibold mb-2">Respond to sound request</h1>
        {!canSubmit && (
          <p className="text-sm text-red-600">{error || "This link is missing required parameters."}</p>
        )}
        {canSubmit && !status && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Firm price (ZAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2"
                placeholder="e.g. 3500"
                disabled={!linkOk}
              />
              <p className="text-xs text-gray-500 mt-1">Enter your total price for this booking.</p>
            </div>
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
                {error}
                {statusCode && <span className="ml-1 text-xs text-red-500">(HTTP {statusCode})</span>}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={accept}
                disabled={busy || !linkOk}
                className="inline-flex items-center justify-center rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {busy ? "Submitting…" : "Accept"}
              </button>
              <button
                type="button"
                onClick={decline}
                disabled={busy || !linkOk}
                className="inline-flex items-center justify-center rounded border px-4 py-2 disabled:opacity-50"
              >
                {busy ? "Submitting…" : "Decline"}
              </button>
            </div>
          </div>
        )}
        {status === "accepted" && (
          <div className="text-green-700">Thank you — your firm price has been submitted.</div>
        )}
        {status === "declined" && (
          <div className="text-gray-700">You have declined this request.</div>
        )}
      </div>
    </MainLayout>
  );
}

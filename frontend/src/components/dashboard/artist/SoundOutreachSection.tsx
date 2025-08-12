"use client";
import React, { useEffect, useState } from "react";
import Section from "@/components/ui/Section";
import { getSoundOutreach, retrySoundOutreach } from "@/lib/api";

type Props = {
  bookingId: number;
  eventCity?: string | null;
};

const SoundOutreachSection: React.FC<Props> = ({ bookingId, eventCity }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSoundOutreach(bookingId);
      setRows(res.data);
    } catch (e: any) {
      setError(e?.message || "Failed to load outreach");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, [bookingId]);

  const handleRetry = async () => {
    try {
      await retrySoundOutreach(bookingId, { event_city: eventCity || undefined });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Retry failed");
    }
  };

  return (
    <Section title="Sound Outreach" subtitle="Track supplier responses and re-outreach if needed" className="mb-10">
      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loading && rows.length === 0 && (
        <div className="text-sm text-gray-600">No outreach yet.</div>
      )}
      {!loading && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-gray-900">{r.supplier_public_name || `Service #${r.supplier_service_id}`}</div>
                <div className="text-xs text-gray-600">{r.status.toUpperCase()}</div>
              </div>
              <div className="text-xs text-gray-500">
                {r.expires_at ? `Expires ${new Date(r.expires_at).toLocaleString()}` : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        <button onClick={handleRetry} className="inline-flex items-center rounded-md bg-brand-dark px-3 py-1.5 text-white text-sm hover:bg-brand-secondary">Re-outreach to backups</button>
      </div>
    </Section>
  );
};

export default SoundOutreachSection;


"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SafeImage from "@/components/ui/SafeImage";
import { BLUR_PLACEHOLDER } from "@/lib/blurPlaceholder";
import Link from "next/link";
import { format } from "date-fns";
import {
  CalendarDays,
  MapPin,
  ReceiptText,
  CheckCircle2,
  Loader2,
  Music4,
  UploadCloud,
  Trash2,
  AlertTriangle,
  Users,
  Mail,
  Phone,
  Globe,
  FileText,
} from "lucide-react";

// Removed MUI components in favor of Tailwind classes

import { useAuth } from "@/contexts/AuthContext";
import SavedPill from "@/components/ui/SavedPill";
import useSavedHint from "@/hooks/useSavedHint";
import type { EventPrep, Booking } from "@/types";
import {
  getEventPrep,
  updateEventPrep,
  getBookingDetails,
  getRider,
  uploadBookingAttachment,
  getEventPrepAttachments,
  addEventPrepAttachment,
  deleteEventPrepAttachment,
} from "@/lib/api";
import { getMessagesForBookingRequest } from "@/lib/api";
import { parseBookingDetailsFromMessage } from "@/lib/chat/bookingDetails";
import { BOOKING_DETAILS_PREFIX } from "@/lib/constants";

/* ────────────────────────────────────────────────────────────────────────────
   Lucide icon wrappers (prevents TS 2786 JSX issues)
   ────────────────────────────────────────────────────────────────────────── */
type IconProps = React.SVGProps<SVGSVGElement>;
const wrapIcon = (Comp: any) =>
  function IconWrapped(props: IconProps) {
    const C = Comp as any;
    return <C {...props} />;
  };

const CalendarDaysIcon = wrapIcon(CalendarDays);
const MapPinIcon = wrapIcon(MapPin);
const ReceiptTextIcon = wrapIcon(ReceiptText);
const CheckCircle2Icon = wrapIcon(CheckCircle2);
const Loader2Icon = wrapIcon(Loader2);
const Music4Icon = wrapIcon(Music4);
const UploadCloudIcon = wrapIcon(UploadCloud);
const Trash2Icon = wrapIcon(Trash2);
const AlertTriangleIcon = wrapIcon(AlertTriangle);
const UsersIcon = wrapIcon(Users);
const MailIcon = wrapIcon(Mail);
const PhoneIcon = wrapIcon(Phone);
const GlobeIcon = wrapIcon(Globe);
const FileTextIcon = wrapIcon(FileText);

/* ────────────────────────────────────────────────────────────────────────────
   Minimal local type used in this file
   ────────────────────────────────────────────────────────────────────────── */
type EventPrepAttachment = { id: number; file_url: string };

/* ────────────────────────────────────────────────────────────────────────────
   Utilities
   ────────────────────────────────────────────────────────────────────────── */
const toHHMM = (v?: string | null) => (v ? String(v).slice(0, 5) : "");
const ZAR = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

const timeToMinutes = (val?: string | null): number => {
  if (!val) return NaN;
  const s = String(val).trim();
  const parts = s.split(":");
  if (parts.length < 2) return NaN;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
};

const formatDuration = (startMin: number, endMin: number) => {
  if (isNaN(startMin) || isNaN(endMin) || endMin <= startMin) return null;
  const d = endMin - startMin;
  const h = Math.floor(d / 60);
  const m = d % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(" ") || null;
};

// Persist specific time fields locally so quick navs don’t lose edits
const TIME_FIELDS: (keyof EventPrep | "soundcheck_end_time")[] = [
  "loadin_start",
  "loadin_end",
  "soundcheck_time",
  "guests_arrival_time",
  "performance_start_time",
  "performance_end_time",
  "soundcheck_end_time",
];
const localTimesKey = (bookingId: number) => `event_prep_times:${bookingId}`;
function readLocalTimes(bookingId: number): Partial<EventPrep & { soundcheck_end_time: string }> {
  try {
    const raw = localStorage.getItem(localTimesKey(bookingId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeLocalTimes(bookingId: number, data: Partial<EventPrep & { soundcheck_end_time: string }>) {
  try {
    const current = readLocalTimes(bookingId);
    const next = { ...current };
    for (const k of TIME_FIELDS) {
      if (k in data) (next as any)[k] = (data as any)[k];
    }
    localStorage.setItem(localTimesKey(bookingId), JSON.stringify(next));
  } catch {
    // ignore
  }
}

// Note: previously we encoded soundcheck end inside schedule_notes as a tag.
// This behavior has been removed per request. We now keep end time only locally.

// Persist selected non-time fields locally so they survive reloads even if
// backend doesn't store them yet.
const CONTACT_FIELDS: (keyof EventPrep | "venue_name")[] = [
  "additional_contact_name" as any,
  "additional_contact_phone" as any,
  "venue_name" as any,
];
const localInfoKey = (bookingId: number) => `event_prep_info:${bookingId}`;
function readLocalInfo(bookingId: number): Partial<EventPrep> {
  try {
    const raw = localStorage.getItem(localInfoKey(bookingId));
    return raw ? (JSON.parse(raw) as Partial<EventPrep>) : {};
  } catch {
    return {};
  }
}
function writeLocalInfo(bookingId: number, data: Partial<EventPrep>) {
  try {
    const current = readLocalInfo(bookingId);
    const next = { ...current } as any;
    for (const k of CONTACT_FIELDS) {
      if (k in data) (next as any)[k] = (data as any)[k];
    }
    localStorage.setItem(localInfoKey(bookingId), JSON.stringify(next));
  } catch {
    // ignore
  }
}

// Persist a mapping of attachment URL -> original filename so we can show a
// friendly label instead of a storage GUID.
const attachmentNamesKey = (bookingId: number) => `event_prep_attachment_names:${bookingId}`;
const attachmentUploadersKey = (bookingId: number) => `event_prep_attachment_uploaders:${bookingId}`;
function readAttachmentNames(bookingId: number): Record<string, string> {
  try {
    const raw = localStorage.getItem(attachmentNamesKey(bookingId));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function writeAttachmentName(bookingId: number, url: string, originalName: string) {
  try {
    const map = readAttachmentNames(bookingId);
    map[url] = originalName;
    localStorage.setItem(attachmentNamesKey(bookingId), JSON.stringify(map));
  } catch {
    // ignore
  }
}

function readAttachmentUploaders(bookingId: number): Record<string, 'client' | 'service_provider'> {
  try {
    const raw = localStorage.getItem(attachmentUploadersKey(bookingId));
    return raw ? (JSON.parse(raw) as Record<string, 'client' | 'service_provider'>) : {};
  } catch {
    return {};
  }
}
function writeAttachmentUploader(bookingId: number, url: string, role: 'client' | 'service_provider') {
  try {
    const map = readAttachmentUploaders(bookingId);
    map[url] = role;
    localStorage.setItem(attachmentUploadersKey(bookingId), JSON.stringify(map));
  } catch {
    // ignore
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Data hook
   ────────────────────────────────────────────────────────────────────────── */
function useEventPrep(bookingId: number) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [ep, setEp] = useState<EventPrep | null>(null);
  const [riderUrl, setRiderUrl] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<EventPrepAttachment[]>([]);
  const [soundcheckEnd, setSoundcheckEnd] = useState<string>("");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { saving, saved, startSaving, doneSaving, stopSaving } = useSavedHint();
  const pendingPatchRef = useRef<Partial<EventPrep>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [b, e] = await Promise.all([
          getBookingDetails(bookingId).then((r) => r.data),
          getEventPrep(bookingId),
        ]);
        if (!mounted) return;

        setBooking(b);

        // Merge server with any local time cache
        const localTimes = readLocalTimes(bookingId);
        // Merge server with any local info cache (contacts/venue)
        const localInfo = readLocalInfo(bookingId);
        const merged: EventPrep = { ...(e as EventPrep) };
        let needsServerUpdate = false;
        for (const k of TIME_FIELDS) {
          const sv = (merged as any)[k];
          const lv = (localTimes as any)[k];
          if ((!sv || String(sv).trim() === "") && lv) {
            (merged as any)[k] = lv;
            needsServerUpdate = true;
          }
        }
        for (const k of CONTACT_FIELDS) {
          const sv = (merged as any)[k];
          const lv = (localInfo as any)[k];
          if ((!sv || String(sv).trim?.() === "") && lv) {
            (merged as any)[k] = lv;
            needsServerUpdate = true;
          }
        }
        setEp(merged);

        const scEndLocal = localTimes.soundcheck_end_time || "";
        setSoundcheckEnd(toHHMM(scEndLocal));

        if (needsServerUpdate) {
          updateEventPrep(bookingId, merged).catch(() => {});
        }

        getEventPrepAttachments(bookingId)
          .then(({ data }) => mounted && setAttachments(data || []))
          .catch(() => mounted && setAttachments([]));

        if (b?.service?.id) {
          getRider(b.service.id)
            .then((r) => mounted && setRiderUrl(r.data?.pdf_url || null))
            .catch(() => mounted && setRiderUrl(null));
        }
      } catch (err) {
        console.error("Failed to load event prep:", err);
      }
    })();

    return () => {
      mounted = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [bookingId]);

  const patch = useCallback(
    (p: Partial<EventPrep>) => {
      setEp((prev) => ({ ...(prev as EventPrep), ...p }));
      startSaving();
      writeLocalTimes(bookingId, p);
      writeLocalInfo(bookingId, p);

      if (saveTimer.current) clearTimeout(saveTimer.current);
      pendingPatchRef.current = { ...pendingPatchRef.current, ...p };

      saveTimer.current = setTimeout(async () => {
        const payload = pendingPatchRef.current;
        pendingPatchRef.current = {};
        if (!payload || Object.keys(payload).length === 0) {
          stopSaving();
          return;
        }
        try {
          const fresh = await updateEventPrep(bookingId, payload as any);
          setEp((prev) => ({ ...(prev as EventPrep), ...(fresh as EventPrep) }));
          doneSaving();
        } catch (err) {
          console.error("Save failed:", err);
          stopSaving();
        }
      }, 800);
    },
    [bookingId, startSaving, doneSaving, stopSaving]
  );

  const uploadAttachment = useCallback(
    async (file: File, onProgress?: (pct: number) => void): Promise<EventPrepAttachment | void> => {
      startSaving();
      try {
        const formData = new FormData();
        formData.append("file", file);
        const { data: up } = await uploadBookingAttachment(formData, (evt) => {
          if (!onProgress || !evt.total) return;
          const pct = Math.round((evt.loaded * 100) / evt.total);
          onProgress(pct);
        });
        if (up?.url) {
          const { data: created } = await addEventPrepAttachment(bookingId, up.url);
          // Remember the original filename for display
          try { writeAttachmentName(bookingId, created.file_url, file.name || "file"); } catch {}
          setAttachments((prev) => [...prev, created]);
          doneSaving();
          return created as EventPrepAttachment;
        }
        doneSaving();
      } catch (err) {
        console.error('Upload failed:', err);
        stopSaving();
        throw err;
      }
    },
    [bookingId, startSaving, doneSaving, stopSaving]
  );

  const deleteAttachment = useCallback(
    async (id: number) => {
      setAttachments((prev) => {
        const target = prev.find((a) => a.id === id);
        if (target) {
          // Remove stored name/uploader mapping on delete
          try {
            const names = readAttachmentNames(bookingId);
            if (names[target.file_url]) {
              delete names[target.file_url];
              localStorage.setItem(attachmentNamesKey(bookingId), JSON.stringify(names));
            }
            const upMap = readAttachmentUploaders(bookingId);
            if (upMap[target.file_url]) {
              delete upMap[target.file_url];
              localStorage.setItem(attachmentUploadersKey(bookingId), JSON.stringify(upMap));
            }
          } catch {}
        }
        return prev.filter((a) => a.id !== id);
      });
      try {
        await deleteEventPrepAttachment(bookingId, id);
      } catch (err) {
        console.error("Failed to delete attachment:", err);
      }
    },
    [bookingId]
  );

  return {
    booking,
    ep,
    riderUrl,
    attachments,
    saving,
    saved,
    patch,
    uploadAttachment,
    deleteAttachment,
    soundcheckEnd,
    setSoundcheckEnd,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Timeline (MUI, always visible & editable)
   ────────────────────────────────────────────────────────────────────────── */
function RoleTitle({ text, role }: { text: string; role: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm font-semibold text-gray-900">{text}</div>
      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
        {role}
      </span>
    </div>
  );
}

function TimeField({
  value,
  onChange,
  "aria-label": ariaLabel,
  className,
}: {
  value: string | undefined | null;
  onChange: (v: string) => void;
  "aria-label"?: string;
  className?: string;
}) {
  const safeValue = toHHMM(value) || "";
  return (
    <input
      type="time"
      step={60}
      aria-label={ariaLabel || "time"}
      value={safeValue}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ||
        "w-24 rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-400 px-2 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
      }
    />
  );
}

function StartEndRow({
  start,
  end,
  onStart,
  onEnd,
  showDuration = true,
}: {
  start: string | null | undefined;
  end: string | null | undefined;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  showDuration?: boolean;
}) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  const duration = showDuration ? formatDuration(s, e) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TimeField value={start} onChange={onStart} aria-label="Start time" />
      <span className="text-gray-400">—</span>
      <TimeField value={end} onChange={onEnd} aria-label="End time" />
      {duration && (
        <span className="ml-1 inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">({duration})</span>
      )}
    </div>
  );
}

function SingleTimeRow({
  time,
  onTime,
}: {
  time: string | null | undefined;
  onTime: (v: string) => void;
}) {
  return <TimeField value={time} onChange={onTime} aria-label="Time" />;
}

function EventTimeline({
  ep,
  patch,
  bookingId,
  soundcheckEnd,
  setSoundcheckEnd,
  roleNotes,
}: {
  ep: EventPrep;
  patch: (p: Partial<EventPrep>) => void;
  bookingId: number;
  soundcheckEnd: string;
  setSoundcheckEnd: (v: string) => void;
  roleNotes: { loadin: string; soundcheck: string; guests: string; performance: string };
}) {
  return (
    <section aria-label="Event timeline">
      <h3 className="text-base font-semibold text-gray-900 ">Event Timeline</h3>
      <p className="mt-1 text-xs text-gray-500">All times are local.</p>

      <div className="relative mt-4 pl-8">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" aria-hidden />

        <div className="space-y-5">
          {/* Arrival & Setup */}
          <div className="relative flex items-start gap-3">
            <div className="absolute left-4 -top-4 h-4 w-px bg-gray-200" aria-hidden />
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gray-100 ring-1 ring-gray-200 text-gray-600">
              <CalendarDaysIcon width={14} height={14} />
            </div>
            <div className="flex-1">
              <RoleTitle text="Arrival & Setup" role={roleNotes.loadin} />
              <div className="mt-2">
                <StartEndRow
                  start={ep.loadin_start || null}
                  end={ep.loadin_end || null}
                  onStart={(v) => patch({ loadin_start: v })}
                  onEnd={(v) => patch({ loadin_end: v })}
                />
              </div>
            </div>
          </div>

          {/* Soundcheck */}
          <div className="relative flex items-start gap-3">
            <div className="absolute left-4 -top-4 h-4 w-px bg-gray-200" aria-hidden />
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gray-100 ring-1 ring-gray-200 text-gray-600">
              <Music4Icon width={14} height={14} />
            </div>
            <div className="flex-1">
              <RoleTitle text="Soundcheck" role={roleNotes.soundcheck} />
              <div className="mt-2">
                <StartEndRow
                  start={ep.soundcheck_time || null}
                  end={soundcheckEnd || null}
                  onStart={(v) => patch({ soundcheck_time: v })}
                  onEnd={(v) => {
                    setSoundcheckEnd(v);
                    writeLocalTimes(bookingId, { soundcheck_end_time: v });
                  }}
                />
              </div>
            </div>
          </div>

          {/* Guests Arrive (single time) */}
          <div className="relative flex items-start gap-3">
            <div className="absolute left-4 -top-4 h-4 w-px bg-gray-200" aria-hidden />
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gray-100 ring-1 ring-gray-200 text-gray-600">
              <UsersIcon width={14} height={14} />
            </div>
            <div className="flex-1">
              <RoleTitle text="Guests Arrive" role={roleNotes.guests} />
              <div className="mt-2">
                <SingleTimeRow time={ep.guests_arrival_time || null} onTime={(v) => patch({ guests_arrival_time: v })} />
              </div>
            </div>
          </div>

          {/* Performance (notes only) */}
          <div className="relative flex items-start gap-3">
            <div className="absolute left-4 -top-4 h-4 w-px bg-gray-200" aria-hidden />
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gray-100 ring-1 ring-gray-200 text-gray-600">
              <ReceiptTextIcon width={14} height={14} />
            </div>
            <div className="flex-1">
              <RoleTitle text="Performance" role={roleNotes.performance} />
              <div className="mt-2">
                <textarea
                  className="min-h-[96px] w-full rounded-md bg-white border border-gray-300 text-gray-900 placeholder-gray-400 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  placeholder="e.g., Two 45-min sets with a 15-min break. Speeches around 20:30."
                  value={ep.schedule_notes || ""}
                  onChange={(e) => patch({ schedule_notes: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Attachment Uploader (MUI surfaces & controls)
   ────────────────────────────────────────────────────────────────────────── */
function AttachmentUploader({
  onUpload,
  attachments,
  onDelete,
  bookingId,
  isProvider,
}: {
  onUpload: (file: File, onProgress?: (pct: number) => void) => Promise<EventPrepAttachment | void> | void;
  attachments: EventPrepAttachment[];
  onDelete: (id: number) => Promise<void> | void;
  bookingId: number;
  isProvider: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);
  const [currentName, setCurrentName] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      setUploading(true);
      setJustUploaded(false);
      setCurrentName(file.name || "file");
      const created = await onUpload(file, (pct?: number) => {
        if (typeof pct === 'number') setProgress(pct);
      });
      try {
        const url = (created as any)?.file_url as string | undefined;
        if (url) writeAttachmentUploader(bookingId, url, isProvider ? 'service_provider' : 'client');
      } catch {}
      setJustUploaded(true);
      setTimeout(() => setJustUploaded(false), 1500);
    } finally {
      setUploading(false);
      setCurrentName("");
      setProgress(0);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const onPick = () => { if (!uploading) inputRef.current?.click(); };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0]);

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const fileName = (url: string) => {
    try {
      const u = new URL(url);
      return decodeURIComponent(u.pathname.split("/").pop() || url);
    } catch {
      return decodeURIComponent(url.split("/").pop() || url);
    }
  };

  const displayName = (url: string) => {
    try {
      const names = readAttachmentNames(bookingId);
      return names[url] || fileName(url);
    } catch {
      return fileName(url);
    }
  };

  const attachmentUploaderRole = (url: string): 'client' | 'service_provider' | null => {
    const serverRole = null as any; // might be present on the attachment object itself; handled below per-item
    if (serverRole) return serverRole;
    try {
      const up = readAttachmentUploaders(bookingId);
      return (up[url] as any) || null;
    } catch {
      return null;
    }
  };

  return (
    <div
      className={`rounded-xl border border-gray-200 ${isDragging ? 'bg-gray-50' : 'bg-white'} p-3 transition-colors`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      {(uploading || justUploaded) && (
        <div className="mb-2 flex items-center justify-center gap-2 text-sm">
          {uploading ? (
            <>
              <Loader2Icon width={16} height={16} className="animate-spin text-gray-600" />
              <span className="text-gray-700">Uploading {currentName}…</span>
            </>
          ) : (
            <>
              <CheckCircle2Icon width={16} height={16} className="text-emerald-600" />
              <span className="text-emerald-700">Uploaded</span>
            </>
          )}
        </div>
      )}
      <div className="flex flex-col items-center gap-2 text-gray-700">
        <UploadCloudIcon className="opacity-75" width={28} height={28} />
        <div className="text-sm text-gray-600">
          <button type="button" onClick={onPick} disabled={uploading} className={`font-semibold underline decoration-gray-400 underline-offset-2 ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}>
            Click to upload
          </button>
          <span className="ml-1">or drag & drop</span>
        </div>
        <div className="text-xs text-gray-500">PDFs or Images</div>
        <input ref={inputRef} type="file" hidden onChange={onChange} accept="application/pdf,image/*" />
      </div>

      {(attachments.length > 0 || uploading) && (
        <div className="mt-3 border-t border-gray-200 pt-2">
          <ul className="divide-y divide-gray-100">
            {uploading && (
              <li className="flex items-center justify-between py-2 text-sm opacity-80">
                <span className="truncate text-gray-900">{currentName || 'Uploading…'}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">{progress}%</span>
                  <Loader2Icon width={16} height={16} className="animate-spin text-gray-600" />
                </div>
              </li>
            )}
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="truncate text-gray-900 hover:underline">
                  {displayName(a.file_url)}
                </a>
                <div className="flex items-center gap-2">
                  {/* Checkmark for uploaded file */}
                  <CheckCircle2Icon width={16} height={16} className="text-emerald-600" aria-hidden="true" />
                  {(() => {
                    // Determine if current user can delete this attachment
                    const serverRole = (a as any).uploaded_by_role as 'client' | 'service_provider' | undefined;
                    const localRole = attachmentUploaderRole(a.file_url);
                    const uploaderRole = serverRole || localRole || null;
                    const meRole = isProvider ? 'service_provider' : 'client';
                    const canDelete = !uploaderRole || uploaderRole === meRole;
                    return (
                      <button
                        type="button"
                        aria-label="delete attachment"
                        onClick={() => canDelete && onDelete(a.id)}
                        disabled={!canDelete}
                        className={`inline-flex items-center rounded border border-gray-300 bg-white px-2 py-1 text-xs ${canDelete ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
                        title={canDelete ? 'Delete attachment' : 'You cannot delete this file'}
                      >
                        <Trash2Icon width={16} height={16} className="opacity-70" />
                      </button>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Button helper for safe external links (fixes TS on href/target/rel)
   ────────────────────────────────────────────────────────────────────────── */
function LinkButton({ children, href, icon, disabledWhenEmpty = true, className }: { children: React.ReactNode; href?: string; icon?: React.ReactNode; disabledWhenEmpty?: boolean; className?: string }) {
  const disabled = disabledWhenEmpty && !href;
  if (!href) {
    return (
      <button type="button" disabled className={`inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-500 opacity-60 ${className || ''}`}>
        {icon}
        {children}
      </button>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 ${className || ''}`}
    >
      {icon}
      {children}
    </a>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Main Component (MUI across the whole page) — NO Grid2 needed
   ────────────────────────────────────────────────────────────────────────── */
export default function EventPrepForm({ bookingId }: { bookingId: number }) {
  const { user } = useAuth();
  const isProvider = user?.user_type === "service_provider";
  const rolePill = isProvider ? "Client" : "You";

  // Local-only extras for People & Place: event type and guest count
  const [eventTypeExtra, setEventTypeExtra] = useState<string>("");
  const [guestsExtra, setGuestsExtra] = useState<string>("");
  const extrasKey = useMemo(() => `event_prep_extras:${bookingId}`,[bookingId]);
  const readExtras = useCallback(() => {
    try { const raw = localStorage.getItem(extrasKey); return raw ? JSON.parse(raw) as { event_type?: string; guests?: string } : {}; } catch { return {}; }
  }, [extrasKey]);
  const writeExtras = useCallback((data: { event_type?: string; guests?: string }) => {
    try {
      const cur = readExtras();
      const next = { ...cur, ...data };
      localStorage.setItem(extrasKey, JSON.stringify(next));
    } catch {}
  }, [extrasKey, readExtras]);

  const {
    booking,
    ep,
    riderUrl,
    attachments,
    saving,
    saved,
    patch,
    uploadAttachment,
    deleteAttachment,
    soundcheckEnd,
    setSoundcheckEnd,
  } = useEventPrep(bookingId);

  // When server has values already, hydrate local extras
  useEffect(() => {
    if (!ep) return;
    if (!eventTypeExtra && (ep as any).event_type) {
      setEventTypeExtra(String((ep as any).event_type || ''));
    }
    if (!guestsExtra && (ep as any).guests_count != null) {
      setGuestsExtra(String((ep as any).guests_count || ''));
    }
  }, [ep]);

  // Prefill extras from Booking Wizard details embedded in the first booking-details
  // system message. Do not fallback to service category; we want the user's chosen type.
  useEffect(() => {
    if (!booking) return;
    // Load persisted extras (user-edited values win)
    const saved = readExtras();
    if (saved.event_type) setEventTypeExtra(saved.event_type);
    if (saved.guests) setGuestsExtra(saved.guests);

    // Try parse from booking thread system booking-details message
    const brId = booking.booking_request_id;
    if (brId) {
      getMessagesForBookingRequest(brId, { mode: 'lite', limit: 500 }).then((res) => {
        const msgs = res.data.items as any[];
        const sys = msgs.find((m) => {
          if (String(m.message_type).toUpperCase() !== 'SYSTEM' || typeof m.content !== 'string') return false;
          const c = m.content.trim();
          // Prefer canonical prefix; fall back to legacy bracket label
          return c.startsWith(BOOKING_DETAILS_PREFIX) || /\[\s*BOOKING\s+DETAILS\s*\]/i.test(c);
        });
        if (sys) {
          // Normalize legacy bracket header by replacing with canonical prefix for parsing
          const normalized = (sys.content as string).replace(/\[\s*BOOKING\s+DETAILS\s*\]\s*/i, BOOKING_DETAILS_PREFIX);
          const parsed = parseBookingDetailsFromMessage(normalized);
          if (!saved.event_type && parsed.eventType) {
            setEventTypeExtra(parsed.eventType);
            writeExtras({ event_type: parsed.eventType });
            try { patch({ event_type: parsed.eventType } as any); } catch {}
          }
          if (!saved.guests && parsed.guests) {
            const g = String(parsed.guests).replace(/[^0-9]/g, '');
            setGuestsExtra(g);
            writeExtras({ guests: g });
            try { const n = g ? Number(g) : null; patch({ guests_count: (n as any) } as any); } catch {}
          }
        }
      }).catch(() => {});
    }
  }, [booking, readExtras, writeExtras]);

  const progress = useMemo(() => {
    const done = ep?.progress_done ?? 0;
    const total = ep?.progress_total ?? 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }, [ep]);

  if (!ep || !booking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-white/70">
        <Loader2Icon width={20} height={20} /> Loading…
      </div>
    );
  }

  // Derived content
  const eventDate = booking.start_time ? new Date(booking.start_time) : null;
  const soundNeeded = Boolean((ep as any)?.is_sound_required ?? (booking as any)?.requires_sound ?? false);
  const techOwner = ep.tech_owner === "artist" ? "Artist brings PA" : "Venue system";
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
  // Build receipt URL: prefer booking.payment_id; else fallback to localStorage (mock payments)
  let receiptUrl: string | undefined = booking.payment_id ? `${apiBase}/api/v1/payments/${booking.payment_id}/receipt` : undefined;
  if (!receiptUrl && booking.booking_request_id) {
    try {
      const stored = localStorage.getItem(`receipt_url:br:${booking.booking_request_id}`);
      if (stored) receiptUrl = stored;
    } catch {}
  }
  const icsUrl = `${apiBase}/api/v1/bookings/${bookingId}/calendar.ics`;
  const venueAddress = ep.venue_address || (booking?.service as any)?.artist?.location || "";
  const mapsUrl = venueAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}` : undefined;
  const heroImage =
    booking?.service?.media_url ||
    booking?.service?.service_provider?.cover_photo_url ||
    booking?.service?.service_provider?.profile_picture_url ||
    "";

  const roleNotes = {
    loadin: isProvider ? "You" : "Artist",
    soundcheck: isProvider ? "You" : "Artist",
    guests: isProvider ? "Client" : "You",
    performance: isProvider ? "Client" : "You",
  };

  // Contact details for Quick Links (prefer provider's configured contact details if present)
  const providerUserId = (booking?.service as any)?.artist?.user?.id
    || (booking?.service as any)?.artist?.user_id
    || null;
  let contactEmail = (booking?.service as any)?.artist?.contact_email
    || (booking?.service as any)?.artist?.user?.email
    || '';
  let contactPhone = (booking?.service as any)?.artist?.contact_phone
    || (booking?.service as any)?.artist?.user?.phone_number
    || '';
  let contactWebsite = (booking?.service as any)?.artist?.contact_website
    || (booking?.service as any)?.artist?.portfolio_urls?.[0]
    || '';
  try {
    if (providerUserId) {
      const local = JSON.parse(localStorage.getItem(`sp:contact:${providerUserId}`) || '{}');
      if (!contactEmail && local.email) contactEmail = local.email;
      if (!contactPhone && local.phone) contactPhone = local.phone;
      if (!contactWebsite && local.website) contactWebsite = local.website;
    }
  } catch {}
  const telHref = contactPhone ? `tel:${contactPhone.replace(/\s+/g,'')}` : undefined;
  const mailHref = contactEmail ? `mailto:${contactEmail}` : undefined;
  const webHref = contactWebsite ? (contactWebsite.startsWith('http') ? contactWebsite : `https://${contactWebsite}`) : undefined;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 text-gray-900">
      {/* Sticky Header */}
      <div className="sticky md:top-[72px] z-40 mb-4 rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-bold">{booking.service?.title || "Event Preparation"} - {eventDate ? format(eventDate, "EEE, d MMM yyyy") : "Date TBA"}</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-1.5 w-44 rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-gray-900" style={{ width: `${progress.pct}%` }} />
              </div>
              <span className="text-xs text-gray-500">{progress.done}/{progress.total} complete</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SavedPill saving={saving} saved={saved} />
            <Link href={`/dashboard/events/${bookingId}`} className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              View booking
            </Link>
          </div>
        </div>
      </div>

      {/* Responsive 2-column grid via CSS Grid (no MUI Grid types) */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr,360px]">
        {/* Main column */}
        <div>
          {/* Event Timeline */}
          <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
            <EventTimeline
              ep={ep}
              patch={patch}
              bookingId={bookingId}
              soundcheckEnd={soundcheckEnd}
              setSoundcheckEnd={setSoundcheckEnd}
              roleNotes={roleNotes}
            />
          </div>

          {/* People & Place (client-owned) */}
          <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold">People & Place</h3>
                <p className="mt-1 text-xs text-white/60">On-the-day contacts and location details</p>
              </div>
              <span className="ml-3 inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600" title="Owner">
                {rolePill}
              </span>
            </div>

            {/* Event meta confirmation */}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-600">Type of event</label>
                <input
                  type="text"
                  value={eventTypeExtra}
                  onChange={(e) => { const val = e.target.value; setEventTypeExtra(val); writeExtras({ event_type: val }); try { patch({ event_type: val } as any); } catch {} }}
                  placeholder="e.g. Wedding, Corporate, Birthday"
                  className="w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <p className="text-[11px] text-gray-500">Confirm type of event.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-600">Number of guests</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={guestsExtra}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setGuestsExtra(v); writeExtras({ guests: v }); try { const n = v ? Number(v) : null; patch({ guests_count: (n as any) } as any); } catch {} }}
                  placeholder="e.g. 120"
                  className="w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <p className="text-[11px] text-gray-500">An estimated count is fine.</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* On-the-day contact name */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-600">On-the-day contact name</label>
                <input type="text" placeholder="Full name" value={ep.day_of_contact_name || ""} onChange={(e) => patch({ day_of_contact_name: e.target.value })} className="w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
              {/* On-the-day contact number */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-600">On-the-day contact number</label>
                <input type="tel" placeholder="+27 82 123 4567" value={ep.day_of_contact_phone || ""} onChange={(e) => patch({ day_of_contact_phone: e.target.value })} className="w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>

              {/* Secondary contact name */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-600">Secondary contact name (optional)</label>
                <input type="text" placeholder="Full name" value={(ep as any).additional_contact_name || ""} onChange={(e) => patch(({ additional_contact_name: e.target.value } as unknown) as Partial<EventPrep>)} className="w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
              {/* Secondary contact number */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-600">Secondary contact number (optional)</label>
                <input type="tel" placeholder="+27 82 987 6543" value={(ep as any).additional_contact_phone || ""} onChange={(e) => patch(({ additional_contact_phone: e.target.value } as unknown) as Partial<EventPrep>)} className="w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>

              {/* Venue name */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs text-gray-600">Venue name (optional)</label>
                <input
                  type="text"
                  placeholder="e.g., Sea Point Pavilion"
                  value={(ep as any).venue_name || ""}
                  onChange={(e) => patch(({ venue_name: e.target.value } as unknown) as Partial<EventPrep>)}
                  className="w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>

              {/* Location */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs text-gray-600">Confirm Location</label>
                <input placeholder="Venue / Address" value={ep.venue_address || ""} onChange={(e) => patch({ venue_address: e.target.value })} className="w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>

              {/* Location quick actions */}
              <div className="md:col-span-2 flex gap-2">
                <LinkButton href={venueAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}` : undefined} icon={<MapPinIcon width={16} height={16} />}>Open in Maps</LinkButton>
                <LinkButton href={`${apiBase}/api/v1/bookings/${bookingId}/calendar.ics`} icon={<CalendarDaysIcon width={16} height={16} />}>Add to Calendar</LinkButton>
              </div>

              {/* Notes — full width (span 2) */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs text-gray-600">Notes</label>
                <textarea placeholder="Access instructions, gate codes, parking info, etc." value={ep.parking_access_notes || ""} onChange={(e) => patch({ parking_access_notes: e.target.value })} className="min-h-[96px] w-full rounded-md bg-white border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
            </div>
          </div>

          {/* Files & Notes */}
          <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
            <h3 className="text-base font-semibold">Files & Notes</h3>
            <p className="mt-1 text-xs text-gray-500">Share programs or add final details</p>
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-600">General notes</label>
                <textarea placeholder="Stage plots, guest lists, special announcements…" value={ep.notes || ""} onChange={(e) => patch({ notes: e.target.value })} className="min-h-[96px] w-full rounded-md bg-white border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-white/90">Attachments</div>
                <AttachmentUploader bookingId={bookingId} isProvider={!!isProvider} onUpload={uploadAttachment} attachments={attachments} onDelete={deleteAttachment} />
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside>
          {heroImage && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="relative aspect-[16/9] bg-gray-100">
                <SafeImage src={heroImage} alt={booking.service?.title || 'Event'} fill sizes="(max-width: 768px) 100vw, 360px" className="h-full w-full object-cover" priority placeholder="blur" blurDataURL={BLUR_PLACEHOLDER} />
              </div>
            </div>
          )}
          <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-base font-semibold">Quick Links</h3>
            <div className="space-y-2">
              {(
                // Show rider to providers always; for clients, only when they should provide sound
                (isProvider && !!riderUrl) || (!isProvider && !soundNeeded && !!riderUrl)
              ) && (
                <LinkButton href={riderUrl || undefined} icon={<FileTextIcon width={16} height={16} />} className="w-full justify-center">Open Rider (PDF)</LinkButton>
              )}
              <LinkButton href={receiptUrl} icon={<ReceiptTextIcon width={16} height={16} />} className="w-full justify-center">View Receipt</LinkButton>
              <LinkButton href={icsUrl} icon={<CalendarDaysIcon width={16} height={16} />} className="w-full justify-center">Add to Calendar (.ics)</LinkButton>
              <div className="h-px bg-gray-200 my-2" />
              <h4 className="text-xs font-semibold text-gray-600">Contact</h4>
              <div className="grid grid-cols-1 gap-2">
                <LinkButton href={mailHref} icon={<MailIcon width={16} height={16} />} className="w-full justify-center" disabledWhenEmpty>
                  {contactEmail || 'No email set'}
                </LinkButton>
                <LinkButton href={telHref} icon={<PhoneIcon width={16} height={16} />} className="w-full justify-center" disabledWhenEmpty>
                  {contactPhone || 'No phone set'}
                </LinkButton>
                {webHref && (
                  <LinkButton
                    href={webHref}
                    icon={<span aria-hidden="true" className="text-base leading-none">🌐</span>}
                    className="w-full justify-center"
                  >
                    {contactWebsite}
                  </LinkButton>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-base font-semibold">Event</h3>
            <div className="space-y-1">
              <div className="text-sm text-gray-900">{eventDate ? format(eventDate, "EEE, d MMM yyyy") : "Date TBA"}</div>
              <div className="text-sm text-gray-900">{booking.service?.title || "Untitled"}</div>
              <div className="text-xs text-gray-500">{venueAddress || "Address TBA"}</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-600">
            {progress.total > 0 && progress.done >= progress.total ? (
              <div className="rounded-md border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-emerald-700">Ready to go! All details filled in. Changes auto-save.</div>
            ) : (
              <div className="rounded-md border border-amber-600/30 bg-amber-600/10 px-3 py-2 text-amber-700">Awaiting details. Please complete the remaining sections.</div>
            )}
          </div>
        </aside>
      </div>
      {/* Hide native clock icon in time inputs */}
      <style jsx global>{`
        .no-time-picker::-webkit-calendar-picker-indicator { display: none !important; }
        .no-time-picker { -webkit-appearance: none; }
      `}</style>
    </div>
  );
}

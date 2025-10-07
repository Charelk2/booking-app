"use client";

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import data from "@emoji-mart/data";
import {
  FaceSmileIcon,
  MicrophoneIcon,
  XMarkIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";

import { type MessageCreate, type AttachmentMeta } from "@/types";
import { postMessageToBookingRequest, uploadMessageAttachment } from "@/lib/api";

/* ---------------- Types ---------------- */
export type ReplyTarget =
  | { id: number; sender_type: "client" | "service_provider"; content: string }
  | null;

type ChatComposerProps = {
  bookingRequestId: number;
  myUserId: number;
  userType: "client" | "service_provider";
  disabled?: boolean;
  autoFocus?: boolean;
  replyTarget: ReplyTarget;
  onCancelReply: () => void;
  onTyping?: () => void;
  onOptimisticMessage: (msg: any) => void;
  onFinalizeMessage: (tempId: number, realRaw: any) => void;
  onUploadProgress?: (tempId: number, pct: number) => void;
  onEnqueueOffline: (args: { tempId: number; payload: MessageCreate }) => void;
  onError?: (message: string) => void;
  onMessageSent?: () => void;
};

const MAX_TEXTAREA_LINES = 10;

/* ---------------- Liquid Glass ---------------- */
const NOISE_DATA_URL =
  "url(\"data:image/svg+xml;utf8,\
<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'>\
<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>\
<feColorMatrix type='saturate' values='0'/>\
<feComponentTransfer><feFuncA type='table' tableValues='0 0 0 0.02 0.03'/></feComponentTransfer></filter>\
<rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

function EdgeGlassBar({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  // used on MOBILE (edge-to-edge, fixed)
  const base =
    "relative w-full backdrop-blur-xl backdrop-saturate-150 " +
    "bg-white/30 dark:bg-zinc-900/35 shadow-[0_-6px_28px_rgba(0,0,0,0.10)]";
  const topSheen =
    "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-6 " +
    "before:bg-[radial-gradient(120%_60%_at_50%_0%,rgba(255,255,255,0.55),rgba(255,255,255,0.06)_60%,transparent_75%)] " +
    "before:opacity-70";
  const noise: React.CSSProperties = { backgroundImage: NOISE_DATA_URL, backgroundSize: "160px 160px" };
  return (
    <div className={`${base} ${topSheen} ${className}`} style={noise} {...rest}>
      <div className="text-zinc-900 dark:text-zinc-50 antialiased">{children}</div>
    </div>
  );
}

function GlassBar({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  // used on WEB (container-bound, not full width, not fixed)
  const base =
    "relative rounded-2xl backdrop-blur-xl backdrop-saturate-150 " +
    "bg-white/30 dark:bg-zinc-900/35 ring-1 ring-black/10 dark:ring-white/10 " +
    "shadow-[0_8px_30px_rgba(0,0,0,0.12)]";
  const gradientRim =
    "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] " +
    "before:[background:linear-gradient(140deg,rgba(255,255,255,0.6),rgba(255,255,255,0.18)_40%,rgba(255,255,255,0.45)_75%,rgba(255,255,255,0.15))] " +
    "before:opacity-55";
  const topSheen =
    "after:pointer-events-none after:absolute after:inset-x-1 after:top-1 after:h-5 after:rounded-xl " +
    "after:bg-[radial-gradient(120%_60%_at_50%_0%,rgba(255,255,255,0.55),rgba(255,255,255,0.06)_60%,transparent_75%)] " +
    "after:opacity-70";
  const noise: React.CSSProperties = { backgroundImage: NOISE_DATA_URL, backgroundSize: "160px 160px" };
  return (
    <div className={`${base} ${gradientRim} ${topSheen} ${className}`} style={noise} {...rest}>
      <div className="text-zinc-900 dark:text-zinc-50 antialiased">{children}</div>
    </div>
  );
}

function GlassIconButton({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={[
        "flex-shrink-0 w-9 h-9 rounded-full grid place-items-center",
        "ring-1 ring-black/10 dark:ring-white/10 backdrop-blur-sm",
        "bg-white/55 dark:bg-white/10 text-zinc-700 dark:text-zinc-200",
        "hover:bg-white/70 dark:hover:bg-white/15 transition-colors",
        "select-none", // avoid text selection
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

function InputShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={[
        "flex-1 min-h-[40px] rounded-2xl px-3 py-2",
        "bg-white/55 dark:bg-white/10",
        "ring-1 ring-black/10 dark:ring-white/10",
        "backdrop-blur-sm",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/* ---------------- helpers ---------------- */
const isMobileUA = () =>
  typeof navigator !== "undefined" &&
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function formatClock(ms: number) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ---------------- Component ---------------- */
const ChatComposer = React.forwardRef<HTMLTextAreaElement, ChatComposerProps>(
  function ChatComposer(props, forwardedRef) {
    const {
      bookingRequestId,
      myUserId,
      userType,
      disabled = false,
      autoFocus = true,
      replyTarget,
      onCancelReply,
      onTyping,
      onOptimisticMessage,
      onFinalizeMessage,
      onUploadProgress,
      onEnqueueOffline,
      onError,
      onMessageSent,
    } = props;

    const formRef = useRef<HTMLFormElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(forwardedRef, () => textareaRef.current as HTMLTextAreaElement);

    const [newMessageContent, setNewMessageContent] = useState("");
    const [isSending, setIsSending] = useState(false);

    // emoji (web only, lazy)
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [EmojiPickerComp, setEmojiPickerComp] = useState<any>(null);
    const [onWeb, setOnWeb] = useState(false);
    useEffect(() => { setOnWeb(!isMobileUA()); }, []);
    const openEmoji = async () => {
      if (!onWeb) return;
      if (!EmojiPickerComp) {
        const mod = await import("@emoji-mart/react");
        setEmojiPickerComp(() => mod.default);
      }
      setShowEmojiPicker((p) => !p);
    };

    const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
    const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);

    // recorder & gesture state
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [recordMs, setRecordMs] = useState(0);
    const recordStartRef = useRef<number>(0);
    const tickerRef = useRef<number | null>(null);

    // slide-to-cancel
    const gestureActiveRef = useRef(false);
    const startXRef = useRef(0);
    const canceledRef = useRef(false);
    const SLIDE_CANCEL_PX = 80;

    const uploadAbortRef = useRef<AbortController | null>(null);
    const isSendingRef = useRef(false);

    const hasText = newMessageContent.trim().length > 0;

    useEffect(() => {
      if (attachmentFile) {
        try { setAttachmentPreviewUrl(URL.createObjectURL(attachmentFile)); } catch { setAttachmentPreviewUrl(null); }
      } else {
        setAttachmentPreviewUrl(null);
      }
    }, [attachmentFile]);

    useEffect(() => () => {
      try { if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl); } catch {}
      try { uploadAbortRef.current?.abort(); } catch {}
      try { mediaRecorderRef.current?.stop(); } catch {}
      try { streamRef.current?.getTracks().forEach(t=>t.stop()); } catch {}
      if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }
    }, [attachmentPreviewUrl]);

    const autoResizeTextarea = useCallback(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.style.height = "auto";
      const lh = parseInt(getComputedStyle(ta).lineHeight || "20", 10) || 20;
      ta.style.height = Math.min(ta.scrollHeight, lh * MAX_TEXTAREA_LINES) + "px";
    }, []);
    useEffect(() => { autoResizeTextarea(); }, [newMessageContent, autoResizeTextarea]);

    // typing throttle
    const lastTypingSentRef = useRef(0);
    useEffect(() => {
      if (!onTyping) return;
      const ta = textareaRef.current;
      if (!ta) return;
      const onInput = () => {
        const now = Date.now();
        if (now - lastTypingSentRef.current >= 1000) {
          lastTypingSentRef.current = now;
          onTyping();
        }
      };
      ta.addEventListener("input", onInput);
      return () => ta.removeEventListener("input", onInput);
    }, [onTyping]);

    const resetComposer = useCallback(() => {
      setNewMessageContent("");
      setAttachmentFile(null);
      setAttachmentPreviewUrl(null);
      setShowEmojiPicker(false);
      try {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          textareaRef.current.rows = 1;
          textareaRef.current.focus();
        }
      } catch {}
    }, []);

    /* ---------- SEND TEXT / ATTACHMENT ---------- */
    const handleSendMessage = useCallback(async (e: React.FormEvent) => {
      e.preventDefault();
      if (disabled) return;

      const trimmed = newMessageContent.trim();
      if (!trimmed && !attachmentFile) return;
      if (isSendingRef.current) return;

      if (attachmentFile && !navigator.onLine) {
        onError?.("Cannot send attachments while offline.");
        return;
      }

      isSendingRef.current = true;
      setIsSending(true);

      const nowIso = new Date().toISOString();
      const mkOptimistic = (tempId: number, partial: Partial<any>): any => ({
        id: tempId,
        booking_request_id: bookingRequestId,
        sender_id: myUserId,
        sender_type: userType,
        content: partial.content ?? "",
        message_type: "USER",
        quote_id: null,
        attachment_url: partial.attachment_url ?? null,
        attachment_meta: (partial.attachment_meta as AttachmentMeta | null) ?? null,
        visible_to: "both",
        action: null,
        avatar_url: undefined,
        expires_at: null,
        unread: false,
        is_read: true,
        timestamp: nowIso,
        status: navigator.onLine ? "sending" : "queued",
        reply_to_message_id: null,
        reply_to_preview: null,
        local_preview_url: partial.local_preview_url ?? null,
      });

      try {
        if (trimmed) {
          const tempId = -Date.now();
          onOptimisticMessage(mkOptimistic(tempId, { content: trimmed }));
          const payload: MessageCreate = { content: trimmed } as any;

          if (!navigator.onLine) {
            onEnqueueOffline({ tempId, payload });
          } else {
            try {
              const res = await postMessageToBookingRequest(bookingRequestId, payload);
              onFinalizeMessage(tempId, res.data);
            } catch (err: any) {
              onError?.(`Failed to send message. ${err?.message || ""}`.trim());
              onEnqueueOffline({ tempId, payload });
            }
          }
        }

        if (attachmentFile) {
          try { uploadAbortRef.current?.abort(); } catch {}
          uploadAbortRef.current = new AbortController();

          const tempId = -Date.now() - 1;
          const fallbackContent = attachmentFile.type.startsWith("audio/") ? "Voice note" : (attachmentFile.name || "Attachment");
          const optimisticMeta: AttachmentMeta = {
            original_filename: attachmentFile.name || null,
            content_type: attachmentFile.type || null,
            size: Number.isFinite(attachmentFile.size) ? attachmentFile.size : null,
          };
          onOptimisticMessage(mkOptimistic(tempId, {
            content: fallbackContent,
            attachment_url: attachmentPreviewUrl || null,
            attachment_meta: optimisticMeta,
            local_preview_url: attachmentPreviewUrl || null,
          }));

          try {
            const uploadRes = await uploadMessageAttachment(
              bookingRequestId,
              attachmentFile,
              onUploadProgress ? (evt) => {
                if (!evt.total) return;
                const pct = Math.round((evt.loaded * 100) / evt.total);
                onUploadProgress(tempId, pct);
              } : undefined,
              uploadAbortRef.current?.signal
            );
            const payload: MessageCreate = {
              content: fallbackContent,
              attachment_url: uploadRes.data.url,
              attachment_meta: uploadRes.data.metadata ?? optimisticMeta,
            } as any;
            const res = await postMessageToBookingRequest(bookingRequestId, payload);
            onFinalizeMessage(tempId, res.data);
          } catch (err: any) {
            onError?.(`Failed to send attachment ${attachmentFile.name || ""}. ${err?.message || ""}`.trim());
          } finally {
            onUploadProgress?.(tempId, 0);
          }
        }

        resetComposer();
        onMessageSent?.();
      } catch {
        // no-op
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    }, [
      disabled,
      newMessageContent,
      attachmentFile,
      attachmentPreviewUrl,
      bookingRequestId,
      myUserId,
      userType,
      onOptimisticMessage,
      onEnqueueOffline,
      onFinalizeMessage,
      onUploadProgress,
      onError,
      onMessageSent,
      resetComposer,
    ]);

    /* ---------- VOICE: long-press, slide-to-cancel, release-to-send ---------- */
    const beginRecording = useCallback(async () => {
      if (isRecording || disabled) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const candidates = [
          "audio/mp4", "audio/aac", "audio/mpeg",
          "audio/wav", "audio/webm;codecs=opus", "audio/webm", "audio/ogg",
        ];
        const supported =
          (candidates as string[]).find((t) => {
            try {
              return typeof (window as any).MediaRecorder !== "undefined" &&
                     (window as any).MediaRecorder.isTypeSupported &&
                     (window as any).MediaRecorder.isTypeSupported(t);
            } catch { return false; }
          }) || undefined;

        const mr = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream);
        mediaRecorderRef.current = mr;
        chunksRef.current = [];
        mr.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
        mr.start();

        setIsRecording(true);
        canceledRef.current = false;
        recordStartRef.current = Date.now();
        setRecordMs(0);
        if (tickerRef.current) window.clearInterval(tickerRef.current);
        tickerRef.current = window.setInterval(() => setRecordMs(Date.now() - recordStartRef.current), 200);
      } catch (e) {
        console.error("Mic permission error", e);
        onError?.("Microphone permission is required to record voice notes.");
      }
    }, [disabled, isRecording, onError]);

    const cancelRecording = useCallback(() => {
      if (!isRecording) return;
      canceledRef.current = true;
      setIsRecording(false);
      setRecordMs(0);
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }
    }, [isRecording]);

    const finishRecordingAndSend = useCallback(async () => {
      if (!isRecording) return;

      setIsRecording(false);
      if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }

      const mr = mediaRecorderRef.current;
      if (!mr) return;
      const file: File | null = await new Promise((resolve) => {
        let done = false;
        mr.onstop = () => {
          try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
          const mime = chunksRef.current[0]?.type || mr.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mime });
          if (blob.size === 0 || canceledRef.current) return resolve(null);
          const ext = /mp4/i.test(mime) ? "m4a" : /aac/i.test(mime) ? "aac" : /mpeg/i.test(mime) ? "mp3" : /ogg/i.test(mime) ? "ogg" : /wav/i.test(mime) ? "wav" : "webm";
          resolve(new File([blob], `voice-note-${Date.now()}.${ext}`, { type: mime }));
          done = true;
        };
        try { mr.stop(); } catch {}
        setTimeout(() => { if (!done) resolve(null); }, 1500);
      });

      setRecordMs(0);
      if (!file) return;

      setAttachmentFile(file);
      // Submit via the form to reuse the standard send flow
      setTimeout(() => { try { formRef.current?.requestSubmit(); } catch {} }, 0);
    }, [handleSendMessage, isRecording]);

    // mic long-press gesture handlers (+ workarounds for iOS long-press callout)
    const onMicPointerDown = useCallback((clientX: number, ev?: Event) => {
      gestureActiveRef.current = true;
      startXRef.current = clientX;
      canceledRef.current = false;
      if (ev && "preventDefault" in ev) (ev as any).preventDefault(); // stop long-press callout
      beginRecording();
    }, [beginRecording]);

    const onMicPointerMove = useCallback((clientX: number) => {
      if (!gestureActiveRef.current || !isRecording) return;
      const dx = clientX - startXRef.current;
      if (dx <= -SLIDE_CANCEL_PX && !canceledRef.current) {
        cancelRecording();
      }
    }, [cancelRecording, isRecording]);

    const onMicPointerUp = useCallback(() => {
      if (!gestureActiveRef.current) return;
      gestureActiveRef.current = false;
      if (!canceledRef.current) finishRecordingAndSend();
    }, [finishRecordingAndSend]);

    /* ---------------- UI ---------------- */

    const textarea = (
      <textarea
        ref={textareaRef}
        value={newMessageContent}
        onChange={(e) => setNewMessageContent(e.target.value)}
        onInput={autoResizeTextarea}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        autoFocus={autoFocus}
        rows={1}
        className={[
          "w-full bg-transparent resize-none outline-none",
          "text-[15px] leading-6 text-zinc-900 dark:text-zinc-50",
          "placeholder:text-zinc-600/70 dark:placeholder:text-zinc-300/60",
          "font-medium",
        ].join(" ")}
        placeholder="Type your message..."
        aria-label="New message input"
        disabled={disabled}
      />
    );

    return (
      <>
        {/* MOBILE layout: fixed edge-to-edge at bottom */}
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-40">
          {/* Recording HUD (mobile) */}
          {isRecording && (
            <EdgeGlassBar className="px-4 pt-2 pb-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-pink-600 dark:text-pink-400">
                    <svg width="18" height="18" viewBox="0 0 24 24" className="animate-pulse" aria-hidden="true">
                      <circle cx="12" cy="12" r="6" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{formatClock(recordMs)}</span>
                  <span className="ml-2 text-zinc-700/90 dark:text-zinc-200/90">slide to cancel</span>
                  <span className="text-zinc-500">←</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-red-300 bg-white/70 text-red-700 hover:bg-white px-2 py-1 text-[12px]"
                    onClick={cancelRecording}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-red-600 text-white hover:bg-red-700 px-2 py-1 text-[12px] font-medium"
                    onClick={finishRecordingAndSend}
                  >
                    Stop & Send
                  </button>
                </div>
              </div>
            </EdgeGlassBar>
          )}

          {/* Composer (mobile) */}
          <EdgeGlassBar className="px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
            <form ref={formRef} onSubmit={handleSendMessage} className="flex items-end gap-1.5">
              {/* + (upload) */}
              <label aria-label="Add attachment" className="cursor-pointer">
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = (e.target.files && e.target.files[0]) || null;
                    if (!f) return;
                    setAttachmentFile(f);
                    try { (e.target as HTMLInputElement).value = ''; } catch {}
                  }}
                  accept="image/*,application/pdf,audio/*,video/*,text/plain,application/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                />
                <GlassIconButton>
                  <PlusIcon className="w-5 h-5" />
                </GlassIconButton>
              </label>

              {/* input pill */}
              <InputShell>{textarea}</InputShell>

              {/* right side: mic (long-press) → send when text */}
              <div className="relative w-9 h-9">
                {/* Mic (no text) */}
                <div className={["absolute inset-0 transition-all duration-150", hasText ? "opacity-0 scale-90 pointer-events-none" : "opacity-100 scale-100"].join(" ")}>
                  <GlassIconButton
                    aria-label="Hold to record voice note"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", touchAction: "none" as any }}
                    // Touch
                    onTouchStart={(e) => onMicPointerDown(e.touches[0].clientX, e.nativeEvent)}
                    onTouchMove={(e) => onMicPointerMove(e.touches[0].clientX)}
                    onTouchEnd={onMicPointerUp}
                    onTouchCancel={cancelRecording}
                  >
                    <MicrophoneIcon className="w-5 h-5 pointer-events-none" />
                  </GlassIconButton>
                </div>

                {/* Send (has text) */}
                <button
                  type="submit"
                  aria-label="Send message"
                  className={[
                    "absolute inset-0 grid place-items-center rounded-full",
                    "transition-all duration-150",
                    hasText ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none",
                    "bg-[#25D366] hover:bg-[#1ec45b] text-white shadow-[0_4px_14px_rgba(0,0,0,0.15)]",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  ].join(" ")}
                  disabled={isSending || disabled}
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </div>
            </form>
          </EdgeGlassBar>
        </div>

        {/* WEB layout: container-bound (not fixed, not full width) */}
        <div className="hidden sm:block">
          {/* optional reply row */}
          {replyTarget && (
            <GlassBar className="px-2 py-1 mb-1">
              <div className="w-full text-[12px] flex items-center justify-between gap-2">
                <div className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="font-semibold">Replying to {replyTarget.sender_type === "client" ? "Client" : "You"}:</span>{" "}
                  <span className="italic text-zinc-800/90 dark:text-zinc-200/90">{replyTarget.content}</span>
                </div>
                <button type="button" onClick={onCancelReply} className="w-7 h-7 rounded-full grid place-items-center hover:bg-white/60 dark:hover:bg-white/15">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </GlassBar>
          )}

          {/* Recording HUD (web) */}
          {isRecording && (
            <GlassBar className="px-3 py-2 mb-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-600 animate-pulse" aria-hidden />
                  <span className="text-sm font-semibold tabular-nums">Recording {formatClock(recordMs)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="rounded-md border border-red-300 bg-white/70 text-red-700 hover:bg-white px-2 py-1 text-[12px]" onClick={cancelRecording}>Cancel</button>
                  <button type="button" className="rounded-md bg-red-600 text-white hover:bg-red-700 px-2 py-1 text-[12px] font-medium" onClick={finishRecordingAndSend}>Stop & Send</button>
                </div>
              </div>
            </GlassBar>
          )}

          <GlassBar className="px-2 py-1.5">
            <form ref={formRef} onSubmit={handleSendMessage} className="flex items-end gap-1.5">
              {/* + (upload) */}
              <label aria-label="Add attachment" className="cursor-pointer">
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = (e.target.files && e.target.files[0]) || null;
                    if (!f) return;
                    setAttachmentFile(f);
                    try { (e.target as HTMLInputElement).value = ''; } catch {}
                  }}
                  accept="image/*,application/pdf,audio/*,video/*,text/plain,application/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                />
                <GlassIconButton>
                  <PlusIcon className="w-5 h-5" />
                </GlassIconButton>
              </label>

              {/* input pill */}
              <InputShell>{textarea}</InputShell>

              {/* emoji — web only */}
              <GlassIconButton aria-label="Add emoji" onClick={openEmoji}>
                <FaceSmileIcon className="w-5 h-5" />
              </GlassIconButton>

              {/* right: mic → send (no long-press on web; click-to-record still works if you want to add it later) */}
              <div className="relative w-9 h-9">
                <div className={["absolute inset-0 transition-all duration-150", hasText ? "opacity-0 scale-90 pointer-events-none" : "opacity-100 scale-100"].join(" ")}>
                  <GlassIconButton aria-label="Record voice note" onClick={() => { if (!isRecording) beginRecording(); else finishRecordingAndSend(); }}>
                    <MicrophoneIcon className="w-5 h-5" />
                  </GlassIconButton>
                </div>
                <button
                  type="submit"
                  aria-label="Send message"
                  className={[
                    "absolute inset-0 grid place-items-center rounded-full",
                    "transition-all duration-150",
                    hasText ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none",
                    "bg-[#25D366] hover:bg-[#1ec45b] text-white shadow-[0_4px_14px_rgba(0,0,0,0.15)]",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  ].join(" ")}
                  disabled={isSending || disabled}
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </div>
            </form>
          </GlassBar>

          {/* emoji popover — web only & lazy */}
          {onWeb && showEmojiPicker && EmojiPickerComp && (
            <div className="relative mt-2">
              <div className="absolute z-50">
                <EmojiPickerComp
                  data={data}
                  onEmojiSelect={(emoji: any) => {
                    if (emoji?.native) setNewMessageContent((prev) => `${prev}${emoji.native}`);
                    setShowEmojiPicker(false);
                    textareaRef.current?.focus();
                  }}
                  previewPosition="none"
                  theme="auto"
                />
              </div>
            </div>
          )}
        </div>
      </>
    );
  }
);

export default ChatComposer;

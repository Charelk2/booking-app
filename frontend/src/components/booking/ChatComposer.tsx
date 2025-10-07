"use client";

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import data from "@emoji-mart/data";
import {
  FaceSmileIcon,
  MicrophoneIcon,
  XMarkIcon,
  DocumentIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

import Button from "../ui/Button";
import { type MessageCreate, type AttachmentMeta } from "@/types";
import {
  postMessageToBookingRequest,
  uploadMessageAttachment,
} from "@/lib/api";

const EmojiPicker = dynamic(() => import("@emoji-mart/react"), { ssr: false });

export type ReplyTarget =
  | {
      id: number;
      sender_type: "client" | "service_provider";
      content: string;
    }
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

/* ──────────────────────────────────────────────────────────────────────────────
   Liquid Glass primitives (match EventPrepCard)
   ──────────────────────────────────────────────────────────────────────────── */
const NOISE_DATA_URL =
  "url(\"data:image/svg+xml;utf8,\
<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'>\
<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>\
<feColorMatrix type='saturate' values='0'/>\
<feComponentTransfer><feFuncA type='table' tableValues='0 0 0 0.02 0.03'/></feComponentTransfer></filter>\
<rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

function GlassBar({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
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
    <div
      className={`${base} ${gradientRim} ${topSheen} ${className}`}
      style={noise}
      {...rest}
    >
      <div className="text-zinc-900 dark:text-zinc-50 antialiased">
        {children}
      </div>
    </div>
  );
}

function GlassIconButton({
  children,
  active = false,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={[
        "flex-shrink-0 w-9 h-9 rounded-full grid place-items-center",
        "ring-1 ring-black/10 dark:ring-white/10 backdrop-blur-sm",
        active
          ? "bg-zinc-900 text-white hover:bg-zinc-800"
          : "bg-white/55 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-white/70 dark:hover:bg-white/15",
        "transition-colors",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

function InputShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex-1 min-h-[40px] rounded-xl px-3 py-2",
        "bg-white/45 dark:bg-white/10",
        "ring-1 ring-black/10 dark:ring-white/10",
        "backdrop-blur-sm",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   Composer
   ──────────────────────────────────────────────────────────────────────────── */
const ChatComposer = React.forwardRef<HTMLTextAreaElement, ChatComposerProps>(
  function ChatComposer(
    {
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
    },
    forwardedRef
  ) {
    const formRef = useRef<HTMLFormElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(
      forwardedRef,
      () => textareaRef.current as HTMLTextAreaElement
    );

    const [newMessageContent, setNewMessageContent] = useState("");
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isSending, setIsSending] = useState(false);

    const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
    const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<
      string | null
    >(null);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const uploadAbortRef = useRef<AbortController | null>(null);
    const isSendingRef = useRef(false);

    useEffect(() => {
      if (attachmentFile) {
        try {
          setAttachmentPreviewUrl(URL.createObjectURL(attachmentFile));
        } catch {
          setAttachmentPreviewUrl(null);
        }
      } else {
        setAttachmentPreviewUrl(null);
      }
      return () => {};
    }, [attachmentFile]);

    useEffect(
      () => () => {
        try {
          imagePreviewUrls.forEach((u) => URL.revokeObjectURL(u));
        } catch {}
        try {
          if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
        } catch {}
        try {
          uploadAbortRef.current?.abort();
        } catch {}
        try {
          mediaRecorderRef.current?.stop();
        } catch {}
      },
      [imagePreviewUrls, attachmentPreviewUrl]
    );

    const autoResizeTextarea = useCallback(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.style.height = "auto";
      const lineHeight =
        parseInt(getComputedStyle(ta).lineHeight || "20", 10) || 20;
      const maxHeight = lineHeight * MAX_TEXTAREA_LINES;
      ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
    }, []);
    useEffect(() => {
      autoResizeTextarea();
    }, [newMessageContent, autoResizeTextarea]);

    // Typing throttle
    const lastTypingSentRef = useRef(0);
    const handleTyping = useCallback(() => {
      if (!onTyping) return;
      const now = Date.now();
      if (now - lastTypingSentRef.current < 1000) return;
      lastTypingSentRef.current = now;
      onTyping();
    }, [onTyping]);
    useEffect(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const onInput = () => handleTyping();
      ta.addEventListener("input", onInput);
      return () => {
        ta.removeEventListener("input", onInput);
      };
    }, [handleTyping]);

    const addImageFiles = useCallback((files: File[]) => {
      if (!files.length) return;
      const imgs = files.filter((f) => f.type.startsWith("image/"));
      if (!imgs.length) return;

      const shouldTranscode = (file: File) => {
        const ct = (file.type || "").toLowerCase();
        const name = (file.name || "").toLowerCase();
        return (
          ct === "image/heic" ||
          ct === "image/heif" ||
          /\.(heic|heif)$/i.test(name)
        );
      };

      const transcodeToJpeg = async (file: File): Promise<File> => {
        try {
          const url = URL.createObjectURL(file);
          const img = new Image();
          const loaded: Promise<HTMLImageElement> = new Promise(
            (resolve, reject) => {
              img.onload = () => resolve(img);
              img.onerror = (e) => reject(e);
            }
          );
          img.crossOrigin = "anonymous";
          img.src = url;
          const el = await loaded;
          const canvas = document.createElement("canvas");
          const MAX_W = 4096;
          const MAX_H = 4096;
          let { width, height } = el;
          const scale = Math.min(1, MAX_W / width, MAX_H / height);
          width = Math.max(1, Math.floor(width * scale));
          height = Math.max(1, Math.floor(height * scale));
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(el, 0, 0, width, height);
          const blob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
          );
          try {
            URL.revokeObjectURL(url);
          } catch {}
          if (!blob) return file;
          return new File(
            [blob],
            (file.name || "image").replace(/\.(heic|heif)$/i, "") + ".jpg",
            { type: "image/jpeg" }
          );
        } catch {
          return file;
        }
      };

      (async () => {
        const processed: File[] = [];
        const urls: string[] = [];
        for (const f of imgs) {
          const out = shouldTranscode(f) ? await transcodeToJpeg(f) : f;
          processed.push(out);
          try {
            urls.push(URL.createObjectURL(out));
          } catch {
            urls.push("");
          }
        }
        setImageFiles((prev) => [...prev, ...processed]);
        setImagePreviewUrls((prev) => [...prev, ...urls]);
      })();
    }, []);

    const removeImageAt = useCallback((idx: number) => {
      setImageFiles((prev) => prev.filter((_, i) => i !== idx));
      setImagePreviewUrls((prev) => {
        const copy = [...prev];
        const [removed] = copy.splice(idx, 1);
        try {
          if (removed) URL.revokeObjectURL(removed);
        } catch {}
        return copy;
      });
    }, []);

    const resetComposer = useCallback(() => {
      setNewMessageContent("");
      setAttachmentFile(null);
      setAttachmentPreviewUrl(null);
      setImageFiles([]);
      setImagePreviewUrls([]);
      setIsUploadingAttachment(false);
      setShowEmojiPicker(false);
      try {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          textareaRef.current.rows = 1;
          textareaRef.current.focus();
        }
      } catch {}
    }, []);

    const handleSendMessage = useCallback(
      async (e: React.FormEvent) => {
        e.preventDefault();
        if (disabled) return;
        const trimmed = newMessageContent.trim();
        const pendingImages = imageFiles.map((file, index) => ({
          file,
          previewUrl:
            imagePreviewUrls[index] ||
            (typeof window !== "undefined" ? URL.createObjectURL(file) : ""),
        }));
        const pendingAttachment = attachmentFile
          ? [
              {
                file: attachmentFile,
                previewUrl:
                  attachmentPreviewUrl ||
                  (typeof window !== "undefined"
                    ? URL.createObjectURL(attachmentFile)
                    : ""),
              },
            ]
          : [];
        const attachments = [...pendingImages, ...pendingAttachment];

        if (!trimmed && attachments.length === 0) return;
        if (isSendingRef.current) return;

        if (attachments.length > 0 && !navigator.onLine) {
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
          reply_to_message_id: partial.reply_to_message_id ?? null,
          reply_to_preview: partial.reply_to_preview ?? null,
          local_preview_url: partial.local_preview_url ?? null,
        });

        try {
          let replyId: number | null = replyTarget?.id ?? null;

          if (trimmed) {
            const tempId = -Date.now();
            onOptimisticMessage(
              mkOptimistic(tempId, {
                content: trimmed,
                reply_to_message_id: replyId,
                reply_to_preview: replyTarget
                  ? replyTarget.content.slice(0, 120)
                  : null,
              })
            );
            const payload: MessageCreate = {
              content: trimmed,
              reply_to_message_id: replyId ?? undefined,
            } as any;

            if (!navigator.onLine) {
              onEnqueueOffline({ tempId, payload });
            } else {
              try {
                const res = await postMessageToBookingRequest(
                  bookingRequestId,
                  payload
                );
                onFinalizeMessage(tempId, res.data);
              } catch (err: any) {
                onError?.(
                  `Failed to send message. ${err?.message || ""}`.trim()
                );
                onEnqueueOffline({ tempId, payload });
              }
            }
            replyId = null;
          }

          if (attachments.length > 0) {
            resetComposer();
            setIsUploadingAttachment(true);

            for (let index = 0; index < attachments.length; index += 1) {
              const { file, previewUrl } = attachments[index];
              const tempId = -Date.now() - (index + 1);
              const fallbackContent = file.type.startsWith("audio/")
                ? "Voice note"
                : file.type.startsWith("image/")
                ? "[attachment]"
                : file.name || "Attachment";
              const optimisticMeta: AttachmentMeta = {
                original_filename: file.name || null,
                content_type: file.type || null,
                size: Number.isFinite(file.size) ? file.size : null,
              };
              onOptimisticMessage(
                mkOptimistic(tempId, {
                  content: fallbackContent,
                  attachment_url: previewUrl || null,
                  attachment_meta: optimisticMeta,
                  reply_to_message_id: replyId,
                  reply_to_preview:
                    replyId && replyTarget
                      ? replyTarget.content.slice(0, 120)
                      : null,
                  local_preview_url: previewUrl || null,
                })
              );
              onUploadProgress?.(tempId, 0);

              try {
                try {
                  uploadAbortRef.current?.abort();
                } catch {}
                uploadAbortRef.current = new AbortController();
                const uploadRes = await uploadMessageAttachment(
                  bookingRequestId,
                  file,
                  (evt) => {
                    if (!evt.total) return;
                    const pct = Math.round((evt.loaded * 100) / evt.total);
                    onUploadProgress?.(tempId, pct);
                  },
                  uploadAbortRef.current?.signal
                );

                const payload: MessageCreate = {
                  content: fallbackContent,
                  attachment_url: uploadRes.data.url,
                  attachment_meta: uploadRes.data.metadata ?? optimisticMeta,
                  reply_to_message_id: replyId ?? undefined,
                } as any;
                const res = await postMessageToBookingRequest(
                  bookingRequestId,
                  payload
                );
                onFinalizeMessage(tempId, res.data);
                if (
                  !(file.type || "").toLowerCase().startsWith("audio/") &&
                  previewUrl
                ) {
                  try {
                    setTimeout(() => URL.revokeObjectURL(previewUrl), 4000);
                  } catch {}
                }
              } catch (err: any) {
                onError?.(
                  `Failed to send attachment ${file.name || ""}. ${
                    err?.message || ""
                  }`.trim()
                );
              } finally {
                onUploadProgress?.(tempId, 0);
                replyId = null;
              }
            }

            setIsUploadingAttachment(false);
          } else {
            resetComposer();
          }

          onMessageSent?.();
        } catch {
          // no-op
        } finally {
          isSendingRef.current = false;
          setIsSending(false);
        }
      },
      [
        disabled,
        newMessageContent,
        imageFiles,
        imagePreviewUrls,
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
        replyTarget,
        resetComposer,
      ]
    );

    /* ───────────────────────── Input + UI ───────────────────────── */
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
        placeholder="Type your message…"
        aria-label="New message input"
        disabled={isUploadingAttachment || disabled}
      />
    );

    return (
      <>
        {/* Reply preview (glass strip) */}
        {replyTarget && (
          <div className="px-2 pt-1">
            <GlassBar className="px-2 py-1">
              <div className="w-full text-[12px] flex items-center justify-between gap-2">
                <div className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="font-semibold">
                    Replying to{" "}
                    {replyTarget.sender_type === "client" ? "Client" : "You"}:
                  </span>{" "}
                  <span className="italic text-zinc-800/90 dark:text-zinc-200/90">
                    {replyTarget.content}
                  </span>
                </div>
                <GlassIconButton
                  aria-label="Cancel reply"
                  onClick={onCancelReply}
                  className="w-7 h-7"
                >
                  <XMarkIcon className="w-4 h-4" />
                </GlassIconButton>
              </div>
            </GlassBar>
          </div>
        )}

        {/* Image previews row (glass tiles) */}
        {imagePreviewUrls.length > 0 && (
          <div className="px-2 pt-1">
            <GlassBar className="p-2">
              <div className="flex items-center gap-2">
                <input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) =>
                    addImageFiles(Array.from(e.target.files || []))
                  }
                />
                <label
                  htmlFor="image-upload"
                  className="flex-shrink-0 w-10 h-10 rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white/55 dark:bg-white/10 grid place-items-center cursor-pointer hover:bg-white/70 dark:hover:bg-white/15 transition-colors"
                  title="Add images"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                </label>

                <div className="flex-1 flex flex-wrap items-center gap-2 overflow-hidden">
                  {imagePreviewUrls.map((u, i) => (
                    <div
                      key={i}
                      className="relative w-16 h-16 rounded-lg overflow-hidden ring-1 ring-black/10 dark:ring-white/10 bg-white/40 dark:bg-white/10"
                    >
                      <img
                        src={u}
                        alt={`Preview ${i + 1}`}
                        className="w-16 h-16 object-cover object-center"
                      />
                      <button
                        type="button"
                        aria-label="Remove image"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full grid place-items-center bg-white/85 dark:bg-black/60 text-zinc-800 dark:text-zinc-200 ring-1 ring-black/10 dark:ring-white/10 hover:bg-white"
                        onClick={() => removeImageAt(i)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="w-3.5 h-3.5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </GlassBar>
          </div>
        )}

        {/* Single non-image attachment (glass chip) */}
        {attachmentPreviewUrl &&
          attachmentFile &&
          !attachmentFile.type.startsWith("image/") && (
            <div className="px-2 pt-1">
              <GlassBar className="p-2">
                <div className="flex items-center gap-3">
                  {attachmentFile &&
                  (attachmentFile.type.startsWith("audio/") ||
                    /\.(webm|mp3|m4a|ogg|wav)$/i.test(
                      attachmentFile.name || ""
                    )) ? (
                    <>
                      <DocumentIcon className="w-7 h-7 text-indigo-600" />
                      <span className="text-xs font-medium">
                        {attachmentFile.name} (
                        {Math.round((attachmentFile.size || 0) / 1024)} KB)
                      </span>
                    </>
                  ) : attachmentFile &&
                    (attachmentFile.type.startsWith("video/") ||
                      /\.(mp4|mov|webm|mkv|m4v)$/i.test(
                        attachmentFile.name || ""
                      )) ? (
                    <>
                      <video
                        className="w-48 rounded-lg ring-1 ring-black/10 dark:ring-white/10"
                        controls
                        src={attachmentPreviewUrl}
                        preload="metadata"
                      />
                      <span className="text-xs font-medium">
                        {attachmentFile.name}
                      </span>
                    </>
                  ) : (
                    <>
                      {attachmentFile?.type === "application/pdf" ? (
                        <DocumentIcon className="w-7 h-7 text-red-600" />
                      ) : (
                        <DocumentTextIcon className="w-7 h-7 text-zinc-600 dark:text-zinc-300" />
                      )}
                      <span className="text-xs font-medium">
                        {attachmentFile?.name}
                      </span>
                    </>
                  )}

                  <GlassIconButton
                    onClick={() => setAttachmentFile(null)}
                    className="ml-auto w-8 h-8 text-red-600 dark:text-red-400"
                    aria-label="Remove attachment"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </GlassIconButton>
                </div>
              </GlassBar>
            </div>
          )}

        {/* Composer */}
        <div className="px-2 pt-1.5 pb-2">
          <GlassBar className="px-2 py-1.5">
            <form
              ref={formRef}
              onSubmit={handleSendMessage}
              className="flex items-end gap-1.5"
            >
              {/* hidden file input */}
              <input
                id="file-upload"
                type="file"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  const imgs = files.filter((f) => f.type.startsWith("image/"));
                  const others = files.filter((f) => !f.type.startsWith("image/"));
                  if (imgs.length) addImageFiles(imgs);
                  if (others.length) setAttachmentFile(others[0]);
                }}
                accept="image/*,application/pdf,audio/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/csv,application/rtf"
                multiple
              />

              {/* Upload */}
              <label
                htmlFor="file-upload"
                aria-label="Upload attachment"
                className="cursor-pointer"
              >
                <GlassIconButton>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                </GlassIconButton>
              </label>

              {/* Emoji */}
              <GlassIconButton
                type="button"
                aria-label="Add emoji"
                onClick={() => setShowEmojiPicker((p) => !p)}
              >
                <FaceSmileIcon className="w-5 h-5" />
              </GlassIconButton>

              {/* Voice Note */}
              <GlassIconButton
                type="button"
                aria-label={isRecording ? "Stop recording" : "Record voice note"}
                active={isRecording}
                onClick={async () => {
                  if (isRecording) {
                    mediaRecorderRef.current?.stop();
                    setIsRecording(false);
                  } else {
                    recordedChunksRef.current = [];
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({
                        audio: true,
                      });
                      const candidates = [
                        "audio/mp4",
                        "audio/aac",
                        "audio/mpeg",
                        "audio/wav",
                        "audio/webm;codecs=opus",
                        "audio/webm",
                        "audio/ogg",
                      ];
                      const supported =
                        (candidates as string[]).find((t) => {
                          try {
                            return (
                              typeof (window as any).MediaRecorder !==
                                "undefined" &&
                              (window as any).MediaRecorder.isTypeSupported &&
                              (window as any).MediaRecorder.isTypeSupported(t)
                            );
                          } catch {
                            return false;
                          }
                        }) || undefined;
                      const mr = supported
                        ? new MediaRecorder(stream, { mimeType: supported })
                        : new MediaRecorder(stream);
                      mediaRecorderRef.current = mr;
                      mr.ondataavailable = (ev) => {
                        if (ev.data.size > 0)
                          recordedChunksRef.current.push(ev.data);
                      };
                      mr.onstop = async () => {
                        const mime =
                          recordedChunksRef.current[0]?.type ||
                          mediaRecorderRef.current?.mimeType ||
                          "audio/webm";
                        const blob = new Blob(recordedChunksRef.current, {
                          type: mime,
                        });
                        if (blob.size === 0) return;
                        const ext = /mp4/i.test(mime)
                          ? "m4a"
                          : /aac/i.test(mime)
                          ? "aac"
                          : /mpeg/i.test(mime)
                          ? "mp3"
                          : /ogg/i.test(mime)
                          ? "ogg"
                          : /wav/i.test(mime)
                          ? "wav"
                          : "webm";
                        const file = new File(
                          [blob],
                          `voice-note-${Date.now()}.${ext}`,
                          { type: mime }
                        );
                        setAttachmentFile(file);
                        try {
                          setShowEmojiPicker(false);
                        } catch {}
                        try {
                          textareaRef.current?.focus();
                        } catch {}
                        try {
                          stream.getTracks().forEach((t) => t.stop());
                        } catch {}
                      };
                      mr.start();
                      setIsRecording(true);
                    } catch (e) {
                      console.error("Mic permission error", e);
                      alert("Microphone permission is required to record voice notes.");
                    }
                  }
                }}
              >
                {isRecording ? (
                  <XMarkIcon className="w-5 h-5" />
                ) : (
                  <MicrophoneIcon className="w-5 h-5" />
                )}
              </GlassIconButton>

              {/* Text input */}
              <InputShell>
                {textarea}
              </InputShell>

              {/* Send */}
              <Button
                type="submit"
                aria-label="Send message"
                className={[
                  "flex-shrink-0 rounded-full w-9 h-9 p-0 grid place-items-center",
                  "bg-zinc-900 hover:bg-zinc-800 text-white",
                  "shadow-[0_4px_14px_rgba(0,0,0,0.15)]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
                disabled={
                  isSending ||
                  isUploadingAttachment ||
                  (!newMessageContent.trim() &&
                    !attachmentFile &&
                    imageFiles.length === 0) ||
                  disabled
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4.5 h-4.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              </Button>
            </form>
          </GlassBar>
        </div>

        {/* Emoji picker popover (floats above composer) */}
        {showEmojiPicker && (
          <div className="fixed bottom-24 left-3 z-50">
            <EmojiPicker
              data={data}
              onEmojiSelect={(emoji: any) => {
                if (emoji?.native)
                  setNewMessageContent((prev) => `${prev}${emoji.native}`);
                setShowEmojiPicker(false);
                textareaRef.current?.focus();
              }}
              previewPosition="none"
              theme="auto"
            />
          </div>
        )}
      </>
    );
  }
);

export default ChatComposer;

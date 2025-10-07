"use client";

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import data from '@emoji-mart/data';
import { FaceSmileIcon, MicrophoneIcon, XMarkIcon, DocumentIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import Button from '../ui/Button';
import { type MessageCreate, type AttachmentMeta } from '@/types';
import { postMessageToBookingRequest, uploadMessageAttachment } from '@/lib/api';

const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false });

export type ReplyTarget = { id: number; sender_type: 'client' | 'service_provider'; content: string } | null;

type ChatComposerProps = {
  bookingRequestId: number;
  myUserId: number;
  userType: 'client' | 'service_provider';
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

const ChatComposer = React.forwardRef<HTMLTextAreaElement, ChatComposerProps>(function ChatComposer(
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
  forwardedRef,
) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(forwardedRef, () => textareaRef.current as HTMLTextAreaElement);

  const [newMessageContent, setNewMessageContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

  // Voice note (click mic → HUD with Stop & Send)
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [recordMs, setRecordMs] = useState(0);
  const recordStartRef = useRef<number>(0);
  const tickerRef = useRef<number | null>(null);

  const uploadAbortRef = useRef<AbortController | null>(null);
  const isSendingRef = useRef(false);

  useEffect(() => {
    if (attachmentFile) {
      try { setAttachmentPreviewUrl(URL.createObjectURL(attachmentFile)); } catch { setAttachmentPreviewUrl(null); }
    } else {
      setAttachmentPreviewUrl(null);
    }
    return () => {};
  }, [attachmentFile]);

  useEffect(() => () => {
    try { imagePreviewUrls.forEach((u) => URL.revokeObjectURL(u)); } catch {}
    try { if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl); } catch {}
    try { uploadAbortRef.current?.abort(); } catch {}
    try { mediaRecorderRef.current?.stop(); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }
  }, [imagePreviewUrls, attachmentPreviewUrl]);

  const autoResizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(ta).lineHeight || '20', 10) || 20;
    const maxHeight = lineHeight * MAX_TEXTAREA_LINES;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
  }, []);
  useEffect(() => { autoResizeTextarea(); }, [newMessageContent, autoResizeTextarea]);

  // Typing events (throttled)
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
    ta.addEventListener('input', onInput);
    return () => { ta.removeEventListener('input', onInput); };
  }, [handleTyping]);

  const addImageFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;

    const shouldTranscode = (file: File) => {
      const ct = (file.type || '').toLowerCase();
      const name = (file.name || '').toLowerCase();
      return ct === 'image/heic' || ct === 'image/heif' || /\.(heic|heif)$/i.test(name);
    };

    const transcodeToJpeg = async (file: File): Promise<File> => {
      try {
        const url = URL.createObjectURL(file);
        const img = new Image();
        const loaded: Promise<HTMLImageElement> = new Promise((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = (e) => reject(e);
        });
        img.crossOrigin = 'anonymous';
        img.src = url;
        const el = await loaded;
        const canvas = document.createElement('canvas');
        const MAX_W = 4096;
        const MAX_H = 4096;
        let { width, height } = el;
        const scale = Math.min(1, MAX_W / width, MAX_H / height);
        width = Math.max(1, Math.floor(width * scale));
        height = Math.max(1, Math.floor(height * scale));
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(el, 0, 0, width, height);
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
        try { URL.revokeObjectURL(url); } catch {}
        if (!blob) return file;
        return new File([blob], (file.name || 'image').replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' });
      } catch { return file; }
    };

    (async () => {
      const processed: File[] = [];
      const urls: string[] = [];
      for (const f of imgs) {
        const out = shouldTranscode(f) ? await transcodeToJpeg(f) : f;
        processed.push(out);
        try { urls.push(URL.createObjectURL(out)); } catch { urls.push(''); }
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
      try { if (removed) URL.revokeObjectURL(removed); } catch {}
      return copy;
    });
  }, []);

  const resetComposer = useCallback(() => {
    setNewMessageContent('');
    setAttachmentFile(null);
    setAttachmentPreviewUrl(null);
    setImageFiles([]);
    setImagePreviewUrls([]);
    setIsUploadingAttachment(false);
    setShowEmojiPicker(false);
    try {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.rows = 1;
        textareaRef.current.focus();
      }
    } catch {}
  }, []);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    const trimmed = newMessageContent.trim();
    const pendingImages = imageFiles.map((file, index) => ({ file, previewUrl: imagePreviewUrls[index] || (typeof window !== 'undefined' ? URL.createObjectURL(file) : '') }));
    const pendingAttachment = attachmentFile ? [{ file: attachmentFile, previewUrl: attachmentPreviewUrl || (typeof window !== 'undefined' ? URL.createObjectURL(attachmentFile) : '') }] : [];
    const attachments = [...pendingImages, ...pendingAttachment];
    if (!trimmed && attachments.length === 0) return;
    if (isSendingRef.current) return;
    if (attachments.length > 0 && !navigator.onLine) { onError?.('Cannot send attachments while offline.'); return; }

    isSendingRef.current = true;
    setIsSending(true);

    const nowIso = new Date().toISOString();
    const mkOptimistic = (tempId: number, partial: Partial<any>): any => ({
      id: tempId,
      booking_request_id: bookingRequestId,
      sender_id: myUserId,
      sender_type: userType,
      content: partial.content ?? '',
      message_type: 'USER',
      quote_id: null,
      attachment_url: partial.attachment_url ?? null,
      attachment_meta: (partial.attachment_meta as AttachmentMeta | null) ?? null,
      visible_to: 'both',
      action: null,
      avatar_url: undefined,
      expires_at: null,
      unread: false,
      is_read: true,
      timestamp: nowIso,
      status: navigator.onLine ? 'sending' : 'queued',
      reply_to_message_id: partial.reply_to_message_id ?? null,
      reply_to_preview: partial.reply_to_preview ?? null,
      local_preview_url: partial.local_preview_url ?? null,
    });

    try {
      let replyId: number | null = replyTarget?.id ?? null;
      if (trimmed) {
        const tempId = -Date.now();
        onOptimisticMessage(mkOptimistic(tempId, { content: trimmed, reply_to_message_id: replyId, reply_to_preview: replyTarget ? replyTarget.content.slice(0, 120) : null }));
        const payload: MessageCreate = { content: trimmed, reply_to_message_id: replyId ?? undefined } as any;
        if (!navigator.onLine) { onEnqueueOffline({ tempId, payload }); }
        else {
          try { const res = await postMessageToBookingRequest(bookingRequestId, payload); onFinalizeMessage(tempId, res.data); }
          catch (err: any) { onError?.(`Failed to send message. ${err?.message || ''}`.trim()); onEnqueueOffline({ tempId, payload }); }
        }
        replyId = null;
      }

      if (attachments.length > 0) {
        resetComposer();
        setIsUploadingAttachment(true);
        for (let index = 0; index < attachments.length; index += 1) {
          const { file, previewUrl } = attachments[index];
          const tempId = -Date.now() - (index + 1);
          const fallbackContent = file.type.startsWith('audio/') ? 'Voice note' : file.type.startsWith('image/') ? '[attachment]' : (file.name || 'Attachment');
          const optimisticMeta: AttachmentMeta = { original_filename: file.name || null, content_type: file.type || null, size: Number.isFinite(file.size) ? file.size : null };
          onOptimisticMessage(mkOptimistic(tempId, { content: fallbackContent, attachment_url: previewUrl || null, attachment_meta: optimisticMeta, reply_to_message_id: replyId, reply_to_preview: replyId && replyTarget ? replyTarget.content.slice(0, 120) : null, local_preview_url: previewUrl || null }));
          onUploadProgress?.(tempId, 0);
          try {
            try { uploadAbortRef.current?.abort(); } catch {}
            uploadAbortRef.current = new AbortController();
            const uploadRes = await uploadMessageAttachment(bookingRequestId, file, (evt) => {
              if (!evt.total) return; const pct = Math.round((evt.loaded * 100) / evt.total); onUploadProgress?.(tempId, pct);
            }, uploadAbortRef.current?.signal);
            const payload: MessageCreate = { content: fallbackContent, attachment_url: uploadRes.data.url, attachment_meta: uploadRes.data.metadata ?? optimisticMeta, reply_to_message_id: replyId ?? undefined } as any;
            const res = await postMessageToBookingRequest(bookingRequestId, payload);
            onFinalizeMessage(tempId, res.data);
            if (!(file.type || '').toLowerCase().startsWith('audio/') && previewUrl) { try { setTimeout(() => URL.revokeObjectURL(previewUrl), 4000); } catch {} }
          } catch (err: any) {
            onError?.(`Failed to send attachment ${file.name || ''}. ${err?.message || ''}`.trim());
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
    } catch (err) {
      // no-op
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }, [disabled, newMessageContent, imageFiles, imagePreviewUrls, attachmentFile, attachmentPreviewUrl, bookingRequestId, myUserId, userType, onOptimisticMessage, onEnqueueOffline, onFinalizeMessage, onUploadProgress, onError, onMessageSent, replyTarget, resetComposer]);

  const beginRecording = useCallback(async () => {
    if (isRecording || disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ['audio/mp4','audio/aac','audio/mpeg','audio/wav','audio/webm;codecs=opus','audio/webm','audio/ogg'];
      const supported = (candidates as string[]).find((t) => {
        try { return typeof (window as any).MediaRecorder !== 'undefined' && (window as any).MediaRecorder.isTypeSupported && (window as any).MediaRecorder.isTypeSupported(t); } catch { return false; }
      }) || undefined;
      const mr = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      recordedChunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) recordedChunksRef.current.push(ev.data); };
      mr.start();
      setIsRecording(true);
      recordStartRef.current = Date.now(); setRecordMs(0);
      if (tickerRef.current) window.clearInterval(tickerRef.current);
      tickerRef.current = window.setInterval(() => setRecordMs(Date.now() - recordStartRef.current), 200);
    } catch (e) {
      console.error('Mic permission error', e);
      onError?.('Microphone permission is required to record voice notes.');
    }
  }, [disabled, isRecording, onError]);

  const cancelRecording = useCallback(() => {
    if (!isRecording) return;
    setIsRecording(false); setRecordMs(0);
    try { mediaRecorderRef.current?.stop(); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }
  }, [isRecording]);

  const finishRecordingAndSend = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false); if (tickerRef.current) { window.clearInterval(tickerRef.current); tickerRef.current = null; }
    const mr = mediaRecorderRef.current; if (!mr) return;
    const file: File | null = await new Promise((resolve) => {
      let done = false;
      mr.onstop = () => {
        try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
        const mime = recordedChunksRef.current[0]?.type || mr.mimeType || 'audio/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        if (blob.size === 0) return resolve(null);
        const ext = /mp4/i.test(mime) ? 'm4a' : /aac/i.test(mime) ? 'aac' : /mpeg/i.test(mime) ? 'mp3' : /ogg/i.test(mime) ? 'ogg' : /wav/i.test(mime) ? 'wav' : 'webm';
        resolve(new File([blob], `voice-note-${Date.now()}.${ext}`, { type: mime }));
        done = true;
      };
      try { mr.stop(); } catch {}
      setTimeout(() => { if (!done) resolve(null); }, 1500);
    });
    setRecordMs(0);
    if (!file) return;
    setAttachmentFile(file);
    setTimeout(() => { try { formRef.current?.requestSubmit(); } catch {} }, 0);
  }, [isRecording]);

  const textarea = (
    <textarea
      ref={textareaRef}
      value={newMessageContent}
      onChange={(e) => setNewMessageContent(e.target.value)}
      onInput={autoResizeTextarea}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          formRef.current?.requestSubmit();
        }
      }}
      autoFocus={autoFocus}
      rows={1}
      className="w-full flex-grow rounded-xl px-3 py-1 border border-gray-300 shadow-sm resize-none text-base ios-no-zoom font-medium focus:outline-none min-h-[36px]"
      placeholder="Type your message..."
      aria-label="New message input"
      disabled={isUploadingAttachment || disabled}
    />
  );

  return (
    <>
      {/* Reply preview row */}
      {replyTarget && (
        <div className="px-2 pt-1">
          <div className="w-full rounded-md bg-gray-50 border border-gray-200 px-2 py-1 text-[12px] text-gray-700 flex items-center justify-between">
            <div className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
              Replying to {replyTarget.sender_type === 'client' ? 'Client' : 'You'}: <span className="italic text-gray-500">{replyTarget.content}</span>
            </div>
            <button type="button" className="ml-2 text-gray-500 hover:text-gray-700 flex-shrink-0" onClick={onCancelReply} aria-label="Cancel reply">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Attachments preview: images row */}
      {imagePreviewUrls.length > 0 && (
        <div className="flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner">
          <input id="image-upload" type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImageFiles(Array.from(e.target.files || []))} />
          <label htmlFor="image-upload" className="flex-shrink-0 w-10 h-10 rounded-md border border-dashed border-gray-300 bg-white/70 text-gray-600 flex items-center justify-center cursor-pointer hover:bg-white" title="Add images">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </label>
          <div className="flex-1 flex flex-wrap items-center justify-center gap-2 overflow-hidden">
            {imagePreviewUrls.map((u, i) => (
              <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border border-gray-200 bg-white">
                <img src={u} alt={`Preview ${i+1}`} className="w-16 h-16 object-cover object-center" />
                <button type="button" aria-label="Remove image" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 border border-gray-200 text-gray-700 flex items-center justify-center hover:bg-white" onClick={() => removeImageAt(i)}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single non-image attachment preview */}
      {attachmentPreviewUrl && attachmentFile && !attachmentFile.type.startsWith('image/') && (
        <div className="flex items-center gap-2 mb-1 bg-gray-100 rounded-xl p-2 shadow-inner">
          {attachmentFile && (attachmentFile.type.startsWith('audio/') || /\.(webm|mp3|m4a|ogg|wav)$/i.test(attachmentFile.name || '')) ? (
            <>
              <DocumentIcon className="w-8 h-8 text-indigo-600" />
              <span className="text-xs text-gray-700 font-medium">{attachmentFile.name} ({Math.round((attachmentFile.size || 0) / 1024)} KB)</span>
            </>
          ) : attachmentFile && (attachmentFile.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/i.test(attachmentFile.name || '')) ? (
            <>
              <video className="w-48 rounded" controls src={attachmentPreviewUrl} preload="metadata" />
              <span className="text-xs text-gray-700 font-medium">{attachmentFile.name}</span>
            </>
          ) : (
            <>
              {attachmentFile?.type === 'application/pdf' ? (
                <DocumentIcon className="w-8 h-8 text-red-600" />)
                : (<DocumentTextIcon className="w-8 h-8 text-gray-600" />)}
              <span className="text-xs text-gray-700 font-medium">{attachmentFile?.name}</span>
            </>
          )}
          <button type="button" onClick={() => setAttachmentFile(null)} className="text-xs text-red-600 hover:text-red-700 font-medium" aria-label="Remove attachment">Remove</button>
        </div>
      )}

      {/* Composer form */}
      <form ref={formRef} onSubmit={handleSendMessage} className="flex items-center gap-x-1.5 px-2 pt-1.5 pb-1.5 relative">
        <input
          id="file-upload"
          type="file"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            const imgs = files.filter((f) => f.type.startsWith('image/'));
            const others = files.filter((f) => !f.type.startsWith('image/'));
            if (imgs.length) addImageFiles(imgs);
            if (others.length) setAttachmentFile(others[0]);
          }}
          accept="image/*,application/pdf,audio/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/csv,application/rtf"
          multiple
        />
        <label htmlFor="file-upload" aria-label="Upload attachment" className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-500 rounded-full hover:bg-gray-100 transition-colors cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </label>

        <button type="button" onClick={() => setShowEmojiPicker((prev) => !prev)} aria-label="Add emoji" className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-500 rounded-full hover:bg-gray-100 transition-colors">
          <FaceSmileIcon className="w-5 h-5" />
        </button>

        {/* Voice note (click to record → HUD) */}
        <button
          type="button"
          onClick={async () => { if (!isRecording) await beginRecording(); }}
          aria-label={isRecording ? 'Stop recording' : 'Record voice note'}
          className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isRecording ? 'bg-red-600 text-white hover:bg-red-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          {isRecording ? <XMarkIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
        </button>

        <div className="flex-1">{textarea}</div>

        <Button
          type="submit"
          aria-label="Send message"
          className="flex-shrink-0 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center w-8 h-8 p-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSending || isUploadingAttachment || (!newMessageContent.trim() && !attachmentFile && imageFiles.length === 0) || disabled}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </Button>
      </form>

      {/* Recording HUD */}
      {isRecording && (
        <div className="absolute bottom-12 left-0 z-50">
          <div className="rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2 shadow">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-red-600 animate-pulse" aria-hidden />
              <span className="text-sm font-semibold">Recording {Math.floor(recordMs / 1000)}s</span>
              <div className="ml-3 flex items-center gap-2">
                <button type="button" className="rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-50 px-2 py-1 text-[12px]" onClick={cancelRecording}>Cancel</button>
                <button type="button" className="rounded-md bg-red-600 text-white hover:bg-red-700 px-2 py-1 text-[12px] font-medium" onClick={finishRecordingAndSend}>Stop & Send</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEmojiPicker && (
        <div className="absolute bottom-12 left-0 z-50">
          <EmojiPicker data={data} onEmojiSelect={(emoji: any) => { if (emoji?.native) setNewMessageContent((prev) => `${prev}${emoji.native}`); setShowEmojiPicker(false); textareaRef.current?.focus(); }} previewPosition="none" />
        </div>
      )}
    </>
  );
});

export default ChatComposer;


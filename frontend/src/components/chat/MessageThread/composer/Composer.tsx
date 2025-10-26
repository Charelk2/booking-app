// components/chat/MessageThread/composer/Composer.tsx
import * as React from 'react';
import dynamic from 'next/dynamic';
import {
  FaceSmileIcon,
  PlusIcon,
  MicrophoneIcon,
  TrashIcon,
  StopIcon,
} from '@heroicons/react/24/outline';
import { PaperAirplaneIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/solid';

type ComposerProps = {
  onSend?: (text: string) => void;
  onUploadFiles?: (files: File[]) => void;
  disabled?: boolean;
  onTyping?: () => void;
};

const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false }) as any;

// Lazy emoji data to keep initial bundle small
let __emojiDataCache: any | null = null;
async function loadEmojiData() {
  if (__emojiDataCache) return __emojiDataCache;
  try {
    const mod = await import('@emoji-mart/data');
    // default export in CJS interop
    __emojiDataCache = (mod as any).default || mod;
    return __emojiDataCache;
  } catch {
    return null;
  }
}

// ——— helpers ————————————————————————————————————————————————
function getPreferredAudioType(): string | null {
  const m = (window as any).MediaRecorder;
  if (!m) return null;
  if (m.isTypeSupported?.('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (m.isTypeSupported?.('audio/webm')) return 'audio/webm';
  if (m.isTypeSupported?.('audio/mp4')) return 'audio/mp4';
  if (m.isTypeSupported?.('audio/mpeg')) return 'audio/mpeg';
  return null;
}
const msToClock = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

export default function Composer({ onSend, onUploadFiles, disabled, onTyping }: ComposerProps) {
  const [text, setText] = React.useState('');
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);

  // Recording state
  const [recording, setRecording] = React.useState(false);
  const [recordMs, setRecordMs] = React.useState(0);
  const [cancelHint, setCancelHint] = React.useState(false);
  const [recError, setRecError] = React.useState<string | null>(null);

  // Unified preview (mobile + web)
  const [pendingAudio, setPendingAudio] = React.useState<File | null>(null);
  const [pendingDurationMs, setPendingDurationMs] = React.useState(0);

  // Playback state for preview
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [pendingUrl, setPendingUrl] = React.useState<string | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playbackMs, setPlaybackMs] = React.useState(0);
  const [totalMs, setTotalMs] = React.useState(0);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const emojiWrapRef = React.useRef<HTMLDivElement | null>(null);
  const hasText = text.trim().length > 0;

  // MediaRecorder refs
  const recStreamRef = React.useRef<MediaStream | null>(null);
  const recRef = React.useRef<MediaRecorder | null>(null);
  const recChunksRef = React.useRef<Blob[]>([]);
  const recordRAF = React.useRef<number | null>(null);
  const recordStartRef = React.useRef<number>(0);
  const lastDurationRef = React.useRef<number>(0);

  // Mobile long-press refs
  const isTouchDevice =
    typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const lpActiveRef = React.useRef(false);
  const lpStartPosRef = React.useRef<{ x: number; y: number } | null>(null);

  // autoresize (max ~6 lines)
  React.useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lh = parseInt(getComputedStyle(ta).lineHeight || '20', 10) || 20;
    const max = lh * 6;
    ta.style.height = Math.min(ta.scrollHeight, max) + 'px';
  }, [text]);

  // Close emoji popover on outside click/touch
  React.useEffect(() => {
    if (!showEmoji) return;
    const onDocDown = (e: MouseEvent | TouchEvent) => {
      const el = emojiWrapRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && el.contains(target)) return; // inside: ignore
      setShowEmoji(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
    };
  }, [showEmoji]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || recording || pendingAudio) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setText('');
    setShowEmoji(false);
  };

  // ——— recording control ————————————————————————————————————
  const stopTimer = () => {
    if (recordRAF.current != null) cancelAnimationFrame(recordRAF.current);
    recordRAF.current = null;
  };
  const startTimer = () => {
    stopTimer();
    recordStartRef.current = performance.now();
    const tick = () => {
      const ms = Math.max(0, Math.round(performance.now() - recordStartRef.current));
      setRecordMs(ms);
      lastDurationRef.current = ms;
      recordRAF.current = requestAnimationFrame(tick);
    };
    recordRAF.current = requestAnimationFrame(tick);
  };
  const resetRecorder = () => {
    stopTimer();
    setRecording(false);
    setCancelHint(false);
    setRecordMs(0);
    recChunksRef.current = [];
    try { recStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    recStreamRef.current = null;
    recRef.current = null;
  };

  const startRecording = async () => {
    if (disabled || recording) return;
    setRecError(null);
    const mime = getPreferredAudioType();
    if (!mime) { setRecError('Voice notes not supported on this browser'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: mime });
      recChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunksRef.current.push(e.data); };
      recRef.current = mr;
      mr.start();
      setRecording(true);
      setRecordMs(0);
      setCancelHint(false);
      startTimer();
    } catch (err: any) {
      setRecError(err?.message || 'Microphone permission denied');
      resetRecorder();
    }
  };

  // Stop & build File; opens preview (no auto-send)
  const stopAndBuildFile = async (): Promise<File | null> => {
    stopTimer();
    const mr = recRef.current;
    if (!mr) { resetRecorder(); return null; }
    await new Promise<void>((resolve) => {
      mr.onstop = () => resolve();
      try { mr.stop(); } catch { resolve(); }
    });
    const mime = mr.mimeType || 'audio/webm';
    const blob = new Blob(recChunksRef.current, { type: mime });
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('mpeg') ? 'mp3' : 'webm';
    const file = blob.size > 0 ? new File([blob], `voice_${Date.now()}.${ext}`, { type: mime }) : null;
    const dur = lastDurationRef.current;
    resetRecorder();

    if (!file || file.size === 0) return null;
    setPendingAudio(file);
    setPendingDurationMs(dur);
    return file;
  };

  // ——— preview setup & playback controls ————————————————————
  // Build object URL + wire listeners
  React.useEffect(() => {
    // Cleanup any previous
    if (pendingUrl) {
      try { URL.revokeObjectURL(pendingUrl); } catch {}
      setPendingUrl(null);
    }
    setIsPlaying(false);
    setPlaybackMs(0);
    setTotalMs(0);

    if (!pendingAudio) return;
    const url = URL.createObjectURL(pendingAudio);
    setPendingUrl(url);

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audioRef.current = audio;
    }
    audio.src = url;
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const dur = Math.max(0, Math.round((audio!.duration || 0) * 1000));
      setTotalMs(dur || pendingDurationMs || 0);
    };
    const onTime = () => setPlaybackMs(Math.round((audio!.currentTime || 0) * 1000));
    const onEnd = () => { setIsPlaying(false); setPlaybackMs(0); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);

    return () => {
      const a = audio;
      if (a) {
        try { a.pause(); } catch {}
        try { a.currentTime = 0; } catch {}
        try { a.removeEventListener('timeupdate', onTime); } catch {}
        try { a.removeEventListener('ended', onEnd); } catch {}
      }
      try { URL.revokeObjectURL(url); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAudio]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (!isPlaying) {
        await audio.play();
        setIsPlaying(true);
      } else {
        audio.pause();
        setIsPlaying(false);
      }
    } catch {
      // ignore play() rejections
    }
  };

  const clearPreview = () => {
    const audio = audioRef.current;
    if (audio) { try { audio.pause(); } catch {} audio.currentTime = 0; }
    setIsPlaying(false);
    setPlaybackMs(0);
    setPendingAudio(null);
    setPendingDurationMs(0);
    if (pendingUrl) { try { URL.revokeObjectURL(pendingUrl); } catch {} }
    setPendingUrl(null);
  };

  const sendPreview = () => {
    if (pendingAudio) onUploadFiles?.([pendingAudio]);
    clearPreview();
  };

  // Desktop keyboard shortcuts while preview is open
  React.useEffect(() => {
    if (!pendingAudio) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearPreview();
      if (e.key === 'Enter') sendPreview();
      if (e.key.toLowerCase() === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAudio, isPlaying]);

  // ——— mic interactions ————————————————————————————————
  // Desktop: click to start → click stop → preview (Send/Discard/Play)
  const onMicClickDesktop = async () => {
    if (disabled) return;
    if (!recording && !pendingAudio) {
      await startRecording();
    } else if (recording) {
      await stopAndBuildFile(); // opens preview
    }
  };

  // Mobile: hold to record, swipe left to cancel, release → preview (not auto-send)
  const onMicPointerDown: React.PointerEventHandler<HTMLButtonElement> = async (e) => {
    if (disabled || !isTouchDevice) return;
    lpActiveRef.current = true;
    lpStartPosRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    await startRecording();
  };
  const onMicPointerMove: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    if (!isTouchDevice || !lpActiveRef.current || !recording) return;
    const start = lpStartPosRef.current; if (!start) return;
    const dx = e.clientX - start.x;
    setCancelHint(dx < -60);
  };
  const onMicPointerUp: React.PointerEventHandler<HTMLButtonElement> = async () => {
    if (!isTouchDevice || !lpActiveRef.current) return;
    lpActiveRef.current = false; lpStartPosRef.current = null;
    if (!recording) return;
    if (cancelHint) {
      // discard immediately
      await stopAndBuildFile();
      clearPreview();
    } else {
      // open preview (user can play before sending)
      await stopAndBuildFile();
    }
  };

  // ——— files (attach / paste / drop) ————————————————————————
  const onFilesChosen = (files: FileList | null) => {
    const arr = Array.from(files || []);
    if (arr.length && !disabled && !recording && !pendingAudio) onUploadFiles?.(arr);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const onPaste: React.ClipboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (disabled || recording || pendingAudio) return;
    try {
      const items = e.clipboardData?.items || [];
      const files: File[] = [];
      for (const it of items as any) if (it.kind === 'file') { const f = it.getAsFile?.(); if (f) files.push(f); }
      if (files.length) { e.preventDefault(); onUploadFiles?.(files); }
    } catch {}
  };
  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    if (disabled || recording || pendingAudio) return;
    const dt = e.dataTransfer; const files = dt?.files ? Array.from(dt.files) : [];
    if (files.length) onUploadFiles?.(files);
  };

  const hasInputFocus = !recording && !pendingAudio;
  const lastTypingRef = React.useRef<number>(0);

  return (
    <div
      data-testid="composer-container"
      className="border-t border-gray-200 bg-[#f0f2f5] relative"
      style={{ paddingBottom: 'var(--mobile-bottom-nav-offset, var(--mobile-bottom-nav-height,56px))' }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-10 bg-black/20 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2 bg-white rounded-full shadow text-sm">Drop files to upload</div>
        </div>
      )}

      <form onSubmit={onSubmit} className="px-2 py-2">
        <div className="flex items-center gap-2">
          <label aria-label="Attach files" className="cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => onFilesChosen(e.target.files)}
              accept="image/*,application/pdf,audio/*,video/*,text/plain,application/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={disabled || !hasInputFocus}
            />
            <span className="flex-shrink-0 w-9 h-9 rounded-full grid place-items-center text-gray-600 hover:bg-white">
              <PlusIcon className="w-5 h-5" />
            </span>
          </label>

          {/* Input */}
          <div ref={emojiWrapRef} className="relative flex-1 min-h-[40px] bg-white rounded-2xl px-3 py-2 ring-1 ring-black/5">
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                // Lightweight throttle to avoid spamming typing events
                const now = Date.now();
                if (onTyping && (lastTypingRef.current === 0 || now - lastTypingRef.current > 800)) {
                  try { onTyping(); } catch {}
                  lastTypingRef.current = now;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                }
              }}
              onPaste={onPaste}
              aria-label="Type your message"
              className="w-full bg-transparent resize-none outline-none text-[15px] leading-6 pr-10"
              disabled={disabled || !hasInputFocus}
            />
            {/* Emoji trigger inside the input pill (right side) */}
            <button
              type="button"
              aria-label="Add emoji"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full grid place-items-center text-gray-600 hover:bg-gray-50"
              onClick={async () => {
                if (!showEmoji) {
                  await loadEmojiData();
                }
                setShowEmoji((v) => !v);
              }}
              disabled={disabled || !hasInputFocus}
            >
              <FaceSmileIcon className="w-5 h-5" />
            </button>
            {/* Emoji popover above the input */}
            {showEmoji && hasInputFocus && (
              <div className="absolute right-0 bottom-[calc(100%+8px)] z-50">
                <EmojiPicker
                  data={__emojiDataCache || undefined}
                  onEmojiSelect={(emoji: any) => {
                    if (emoji?.native) setText((prev) => `${prev}${emoji.native}`);
                    setShowEmoji(false);
                    textareaRef.current?.focus();
                  }}
                  previewPosition="none"
                  theme="auto"
                />
              </div>
            )}
          </div>

          {/* Right: mic or send */}
          <div className="relative w-10 h-10">
            {/* Mic (no text, no preview) */}
            <div
              className={[
                "absolute inset-0 transition-all duration-150",
                hasText || pendingAudio ? "opacity-0 scale-90 pointer-events-none" : "opacity-100 scale-100",
              ].join(" ")}
            >
              <button
                type="button"
                aria-label={isTouchDevice ? "Hold to record" : recording ? "Stop recording" : "Record voice note"}
                className={[
                  "w-10 h-10 rounded-full grid place-items-center text-white",
                  recording ? "bg-red-500 hover:bg-red-500" : "bg-[#25D366] hover:bg-[#1ec45b]",
                  "shadow",
                ].join(" ")}
                disabled={disabled}
                onClick={!isTouchDevice ? onMicClickDesktop : undefined}
                onPointerDown={isTouchDevice ? onMicPointerDown : undefined}
                onPointerMove={isTouchDevice ? onMicPointerMove : undefined}
                onPointerUp={isTouchDevice ? onMicPointerUp : undefined}
              >
                {recording && !isTouchDevice ? <StopIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
              </button>
            </div>

            {/* Send (when text present and no preview) */}
            <button
              type="submit"
              aria-label="Send message"
              className={[
                "absolute inset-0 grid place-items-center rounded-full transition-all duration-150 bg-[#25D366] hover:bg-[#1ec45b] text-white shadow",
                hasText && !pendingAudio ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none",
              ].join(" ")}
              disabled={disabled || pendingAudio != null}
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* (popover moved inside input wrapper for positioning) */}
      </form>

      {/* Mobile recording hint (while holding) */}
      {recording && isTouchDevice && (
        <div className="absolute left-0 right-0 bottom-[calc(100%_-_2px)] px-3 pb-2">
          <div className="mx-2 rounded-xl bg-[#f0f2f5] border border-black/5 shadow-sm px-3 py-2 flex items-center gap-3 select-none">
            <div className="flex items-center gap-2 text-red-600 text-[13px] font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {msToClock(recordMs)}
            </div>
            <div className={`text-[12px] ${cancelHint ? 'text-red-600' : 'text-gray-500'}`}>
              {cancelHint ? (
                <span className="inline-flex items-center gap-1"><TrashIcon className="w-4 h-4" /> Release to cancel</span>
              ) : (
                <>Slide left to cancel ⟵</>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unified preview bar (mobile + web): Play/Pause, timer, Discard, Send */}
      {pendingAudio && (
        <div className="absolute left-0 right-0 bottom-[calc(100%_-_2px)] px-3 pb-2">
          <div className="mx-2 rounded-xl bg-white border border-black/5 shadow px-3 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Purple play/pause button (replaces the dot) */}
              <button
                type="button"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-8 h-8 rounded-full grid place-items-center bg-indigo-500 text-white hover:bg-indigo-600"
                onClick={togglePlay}
              >
                {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
              </button>

              {/* Timers */}
              <div className="text-[13px] text-gray-700">
                <span className="font-medium">Voice note</span>{' '}
                <span className="text-gray-500">
                  {msToClock(playbackMs)} / {msToClock(totalMs || pendingDurationMs)}
                </span>
                {!isTouchDevice && (
                  <span className="ml-2 text-[11px] text-gray-400">
                    (Space = Play/Pause · Enter = Send · Esc = Discard)
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
                onClick={clearPreview}
              >
                Discard
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-md bg-[#25D366] text-white hover:bg-[#1ec45b]"
                onClick={sendPreview}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recording errors */}
      {recError && (
        <div className="px-3 pb-2">
          <div className="text-[12px] text-red-600">{recError}</div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MessageThread from '@/components/chat/MessageThread';
import { getMessagesForBookingRequest, postMessageToBookingRequest } from '@/lib/api';
import { getVideoFlowState, READY_MESSAGE, videoQuestions } from '@/lib/videoFlow';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  bookingRequestId: number;
  clientName?: string;
  artistName?: string;
  artistAvatarUrl?: string | null;
}

const POLL_INTERVAL_MS = 4000;
const SYSTEM_TYPING_DELAY_MS = 900;

// Prevent accidental duplicates if the backend is eventually consistent
// (e.g. we post a SYSTEM message, but the next fetch doesn’t show it yet).
const PENDING_DEDUPE_TTL_MS = 15_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Polling helper that:
 * - avoids overlapping async calls
 * - schedules the next tick only after the previous finishes
 * - doesn't restart the timer when `callback` changes
 */
function usePolling(callback: () => void | Promise<void>, intervalMs: number) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (intervalMs <= 0) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;

      try {
        await callbackRef.current();
      } finally {
        if (!cancelled) timeoutId = setTimeout(tick, intervalMs);
      }
    };

    // Run immediately once on mount
    tick();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [intervalMs]);
}

type PendingSystemMessage = {
  text: string;
  sentAt: number;
};

/**
 * Wrapper for MessageThread that runs the personalized video Q&A sequence.
 */
export default function PersonalizedVideoFlow({
  bookingRequestId,
  clientName,
  artistName,
  artistAvatarUrl,
}: Props) {
  const { user } = useAuth();
  const userType = user?.user_type;

  const [progress, setProgress] = useState(0);
  const [systemTyping, _setSystemTyping] = useState(false);

  // Safe state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Keep "typing" available synchronously (no effect lag)
  const systemTypingRef = useRef(false);
  const setSystemTyping = useCallback((value: boolean) => {
    systemTypingRef.current = value;
    if (isMountedRef.current) _setSystemTyping(value);
  }, []);

  // Dedupe "we just sent this" across refresh cycles.
  const pendingSystemMessageRef = useRef<PendingSystemMessage | null>(null);

  // Avoid overlapping refreshes
  const refreshInFlightRef = useRef(false);

  const sendSystemMessage = useCallback(
    async (text: string) => {
      const trimmed = (text ?? '').trim();
      if (!trimmed) return;

      const pending = pendingSystemMessageRef.current;
      const isStillPending =
        pending?.text === trimmed && Date.now() - pending.sentAt < PENDING_DEDUPE_TTL_MS;

      if (isStillPending) return;

      pendingSystemMessageRef.current = { text: trimmed, sentAt: Date.now() };

      setSystemTyping(true);
      try {
        // brief delay so the typing indicator is visible
        await sleep(SYSTEM_TYPING_DELAY_MS);

        // If we unmounted during the delay, don't post.
        if (!isMountedRef.current) return;

        const clientRequestId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `cid:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;

        await postMessageToBookingRequest(
          bookingRequestId,
          {
            content: trimmed,
            // Align with backend's uppercase message types.
            message_type: 'SYSTEM',
          },
          { clientRequestId },
        );
      } catch (err) {
        // Allow retry on next refresh if the post failed
        pendingSystemMessageRef.current = null;
        throw err;
      } finally {
        setSystemTyping(false);
      }
    },
    [bookingRequestId, setSystemTyping],
  );

  const refreshFlow = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
      const res = await getMessagesForBookingRequest(bookingRequestId, { mode: 'full', limit: 500 });
      const msgs = res?.data?.items ?? [];

      // Clear stale pending dedupe after TTL
      const pending = pendingSystemMessageRef.current;
      if (pending && Date.now() - pending.sentAt >= PENDING_DEDUPE_TTL_MS) {
        pendingSystemMessageRef.current = null;
      }

      // If our pending system message is now visible in the fetched list, clear it.
      if (pendingSystemMessageRef.current) {
        const pendingText = pendingSystemMessageRef.current.text;
        const seen = msgs.some(
          (m) =>
            (m?.message_type ?? '').toUpperCase() === 'SYSTEM' &&
            (m?.content ?? '').trim() === pendingText,
        );
        if (seen) pendingSystemMessageRef.current = null;
      }

      const flow = getVideoFlowState(msgs);
      setProgress(flow.answeredCount);

      // Only auto-drive the flow for clients
      if (userType !== 'client') return;

      // Never send new system messages while we're already "typing"/sending one
      if (systemTypingRef.current) return;

      if (flow.isComplete) {
        if (!flow.hasReadyMessage) {
          await sendSystemMessage(READY_MESSAGE);
        }
        return;
      }

      if (flow.shouldAskNextQuestion && flow.nextQuestion) {
        await sendSystemMessage(flow.nextQuestion);
      }
    } catch (err) {
      console.error('Video flow check failed', err);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [bookingRequestId, sendSystemMessage, userType]);

  usePolling(refreshFlow, POLL_INTERVAL_MS);

  const totalQuestions = videoQuestions.length;

  const ui = useMemo(() => {
    const answered = Math.min(progress, totalQuestions);
    const isComplete = totalQuestions > 0 && answered >= totalQuestions;
    const percent = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0;
    const nextQuestion = !isComplete ? videoQuestions[answered] : null;

    return { answered, isComplete, percent, nextQuestion };
  }, [progress, totalQuestions]);

  return (
    <div className="space-y-3">
      {ui.isComplete ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          ✅ All details collected. The artist has been notified.
        </div>
      ) : (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-gray-900">Personalized video details</div>
            <div className="text-sm text-gray-600">
              {ui.answered}/{totalQuestions} answered
            </div>
          </div>

          <div
            className="mt-2"
            role="progressbar"
            aria-label="Personalized video questions progress"
            aria-valuemin={0}
            aria-valuemax={totalQuestions}
            aria-valuenow={ui.answered}
          >
            <div className="w-full rounded bg-gray-200 h-2" aria-hidden="true">
              <div className="bg-brand h-2 rounded" style={{ width: `${ui.percent}%` }} />
            </div>
          </div>

          {ui.nextQuestion && (
            <div className="mt-2 text-xs text-gray-600">
              Next: <span className="font-medium text-gray-900">{ui.nextQuestion}</span>
            </div>
          )}
        </div>
      )}

      <MessageThread
        bookingRequestId={bookingRequestId}
        clientName={clientName}
        artistName={artistName}
        artistAvatarUrl={artistAvatarUrl}
        isSystemTyping={systemTyping}
      />
    </div>
  );
}

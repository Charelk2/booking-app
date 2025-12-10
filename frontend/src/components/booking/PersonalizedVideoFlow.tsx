'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MessageThread from '@/components/chat/MessageThread';
import { getMessagesForBookingRequest, postMessageToBookingRequest } from '@/lib/api';
import { getVideoFlowState, READY_MESSAGE, videoQuestions } from '@/lib/videoFlow';
import { useAuth } from '@/contexts/AuthContext';

// --- Configuration ---
const POLL_INTERVAL_MS = 4000;
const SYSTEM_TYPING_DELAY_MS = 900;
const PENDING_DEDUPE_TTL_MS = 15_000;

interface Props {
  bookingRequestId: number;
  clientName?: string;
  artistName?: string;
  artistAvatarUrl?: string | null;
}

// --- Utilities ---

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Robust polling hook. 
 * Ensures the previous tick completes before the next begins.
 */
function usePolling(callback: () => void | Promise<void>, intervalMs: number) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (intervalMs <= 0) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let isCancelled = false;

    const tick = async () => {
      if (isCancelled) return;
      try {
        await savedCallback.current();
      } finally {
        if (!isCancelled) {
          timeoutId = setTimeout(tick, intervalMs);
        }
      }
    };

    tick();

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [intervalMs]);
}

// --- Logic Layer (React Native Portable) ---

type PendingSystemMessage = {
  text: string;
  sentAt: number;
};

/**
 * Custom hook that manages the "Brain" of the flow.
 * Copy this file exactly for React Native.
 */
function useVideoFlowAutomation(bookingRequestId: number) {
  const { user } = useAuth();
  const userType = user?.user_type;

  // State
  const [progress, setProgress] = useState(0);
  const [systemTyping, setSystemTyping] = useState(false);
  const isMountedRef = useRef(true);
  
  // Logic Refs
  const pendingSystemMessageRef = useRef<PendingSystemMessage | null>(null);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // 1. Send Message Logic
  const sendSystemMessage = useCallback(async (text: string) => {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return;

    // Dedupe check
    const pending = pendingSystemMessageRef.current;
    if (pending && pending.text === trimmed && Date.now() - pending.sentAt < PENDING_DEDUPE_TTL_MS) {
      return;
    }

    pendingSystemMessageRef.current = { text: trimmed, sentAt: Date.now() };

    // UI Feedback
    if (isMountedRef.current) setSystemTyping(true);
    
    try {
      await sleep(SYSTEM_TYPING_DELAY_MS);
      if (!isMountedRef.current) return;

      const clientRequestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `cid:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;

      await postMessageToBookingRequest(
        bookingRequestId,
        { content: trimmed, message_type: 'SYSTEM' },
        { clientRequestId },
      );
    } catch (err) {
      // Allow retry
      pendingSystemMessageRef.current = null;
      console.error('Failed to post system message', err);
    } finally {
      if (isMountedRef.current) setSystemTyping(false);
    }
  }, [bookingRequestId]);

  // 2. Refresh & Calculation Logic
  const refreshFlow = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
      const res = await getMessagesForBookingRequest(bookingRequestId, { mode: 'full', limit: 500 });
      const msgs = res?.data?.items ?? [];

      // Clean up stale pending messages
      const pending = pendingSystemMessageRef.current;
      if (pending) {
        // If TTL expired OR we see the message in the backend response, clear the pending lock
        const isExpired = Date.now() - pending.sentAt >= PENDING_DEDUPE_TTL_MS;
        const isVisible = msgs.some(m => 
          (m?.message_type ?? '').toUpperCase() === 'SYSTEM' && 
          (m?.content ?? '').trim() === pending.text
        );
        
        if (isExpired || isVisible) {
          pendingSystemMessageRef.current = null;
        }
      }

      // Calculate State
      const flow = getVideoFlowState(msgs);
      if (isMountedRef.current) setProgress(flow.answeredCount);

      // Auto-Drive Logic (Only for Clients)
      if (userType === 'client' && !pendingSystemMessageRef.current) {
        if (flow.isComplete && !flow.hasReadyMessage) {
          await sendSystemMessage(READY_MESSAGE);
        } else if (!flow.isComplete && flow.shouldAskNextQuestion && flow.nextQuestion) {
          await sendSystemMessage(flow.nextQuestion);
        }
      }
    } catch (err) {
      console.error('Video flow check failed', err);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [bookingRequestId, sendSystemMessage, userType]);

  // 3. Start Polling
  usePolling(refreshFlow, POLL_INTERVAL_MS);

  // 4. Derived UI Data
  const totalQuestions = videoQuestions.length;
  const uiStats = useMemo(() => {
    const answered = Math.min(progress, totalQuestions);
    const isComplete = totalQuestions > 0 && answered >= totalQuestions;
    const percent = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0;
    const nextQuestion = !isComplete ? videoQuestions[answered] : null;

    return { answered, isComplete, percent, nextQuestion, totalQuestions };
  }, [progress, totalQuestions]);

  return {
    stats: uiStats,
    isSystemTyping: systemTyping
  };
}

// --- Presentation Components (Replace with Views for RN) ---

const ProgressWidget = ({ stats }: { stats: ReturnType<typeof useVideoFlowAutomation>['stats'] }) => {
  const { isComplete, percent, nextQuestion, answered, totalQuestions } = stats;

  if (isComplete) {
    return (
      <div className="flex w-full items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 shadow-sm backdrop-blur-sm transition-all duration-500">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-900">Request Complete</p>
          <p className="text-xs text-emerald-700/80">The artist has all the details they need.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-50 bg-gray-50/50 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Video Details
        </span>
        <span className="text-xs font-medium text-gray-400">
          {answered} of {totalQuestions}
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        {nextQuestion && (
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-0.5">Next Question:</p>
            <p className="text-sm font-medium text-gray-800 line-clamp-1">
              {nextQuestion}
            </p>
          </div>
        )}

        {/* Progress Bar */}
        <div 
          className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={percent}
        >
          <div 
            className="absolute left-0 top-0 h-full bg-gray-900 transition-all duration-700 ease-out" 
            style={{ width: `${percent}%` }} 
          />
        </div>
      </div>
    </div>
  );
};

// --- Main Container ---

export default function PersonalizedVideoFlow({
  bookingRequestId,
  clientName,
  artistName,
  artistAvatarUrl,
}: Props) {
  // Logic is now completely decoupled from UI
  const { stats, isSystemTyping } = useVideoFlowAutomation(bookingRequestId);

  return (
    <div className="flex flex-col gap-4 w-full">
      <ProgressWidget stats={stats} />

      <div className="flex-1 min-h-[400px]">
        <MessageThread
          bookingRequestId={bookingRequestId}
          clientName={clientName}
          artistName={artistName}
          artistAvatarUrl={artistAvatarUrl}
          isSystemTyping={isSystemTyping}
        />
      </div>
    </div>
  );
}
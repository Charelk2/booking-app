'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import MessageThread, { MessageThreadHandle } from './MessageThread';
import { getMessagesForBookingRequest, postMessageToBookingRequest } from '@/lib/api';
import { computeVideoProgress, videoQuestions } from '@/lib/videoFlow';
import { useAuth } from '@/contexts/AuthContext';

const READY_MESSAGE = 'All details collected! The artist has been notified.';

interface Props {
  bookingRequestId: number;
  clientName?: string;
  artistName?: string;
  artistAvatarUrl?: string | null;
}

/**
 * Wrapper for MessageThread that runs the personalized video Q&A sequence.
 */
export default function PersonalizedVideoFlow({ bookingRequestId, clientName, artistName, artistAvatarUrl }: Props) {
  const { user } = useAuth();
  const threadRef = useRef<MessageThreadHandle>(null);
  const [progress, setProgress] = useState(0);
  // Controls the typing indicator while the system prepares the next question
  const [systemTyping, setSystemTyping] = useState(false);
  // Track typing state without triggering effect re-runs
  const systemTypingRef = useRef(systemTyping);
  useEffect(() => {
    systemTypingRef.current = systemTyping;
  }, [systemTyping]);

  const sendSystemMessage = useCallback(
    async (text: string) => {
      setSystemTyping(true);
      // brief delay so the typing indicator is visible before the message appears
      await new Promise((r) => setTimeout(r, 1000));
      await postMessageToBookingRequest(bookingRequestId, {
        content: text,
        // Align with backend's uppercase message types.
        message_type: 'SYSTEM',
      });
      setSystemTyping(false);
      threadRef.current?.refreshMessages();
    },
    [bookingRequestId],
  );

  const refreshFlow = useCallback(async () => {
    try {
      const res = await getMessagesForBookingRequest(bookingRequestId, { mode: 'lite', limit: 80 });
      const msgs = res.data.items;
      const progressCount = computeVideoProgress(msgs);
      setProgress(progressCount);

      if (user?.user_type === 'client') {
        if (progressCount < videoQuestions.length) {
          const next = videoQuestions[progressCount];
          const alreadyAsked = msgs.some(
            (m) => m.message_type.toUpperCase() === 'SYSTEM' && m.content === next,
          );
          const last = msgs[msgs.length - 1];
          const waitingForAnswer =
            last &&
            last.message_type.toUpperCase() === 'SYSTEM' &&
            last.content === next;
          if (!alreadyAsked && !systemTypingRef.current && !waitingForAnswer) {
            await sendSystemMessage(next);
          }
        } else {
          const done = msgs.some(
            (m) => m.message_type.toUpperCase() === 'SYSTEM' && m.content === READY_MESSAGE,
          );
          if (!done && !systemTypingRef.current) {
            await sendSystemMessage(READY_MESSAGE);
          }
        }
      }
    } catch (err) {
      console.error('Video flow check failed', err);
    }
  }, [bookingRequestId, user, sendSystemMessage]);

  useEffect(() => {
    (async () => {
      await refreshFlow();
    })();
    const id = setInterval(refreshFlow, 4000);
    return () => clearInterval(id);
  }, [refreshFlow]);

  return (
    <div className="space-y-2">
      {progress < videoQuestions.length && (
        <>
          <div className="text-sm text-gray-600">
            {progress}/{videoQuestions.length} questions answered
          </div>
          <div className="w-full bg-gray-200 rounded h-2" aria-hidden="true">
            <div
              className="bg-brand h-2 rounded"
              style={{ width: `${(progress / videoQuestions.length) * 100}%` }}
            />
          </div>
        </>
      )}
      <MessageThread
        ref={threadRef}
        bookingRequestId={bookingRequestId}
        onMessageSent={refreshFlow}
        clientName={clientName}
        artistName={artistName}
        artistAvatarUrl={artistAvatarUrl}
        isSystemTyping={systemTyping}
      />
    </div>
  );
}

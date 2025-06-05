'use client';
import { useCallback, useEffect } from 'react';
import MessageThread from './MessageThread';
import { getMessagesForBookingRequest, postMessageToBookingRequest } from '@/lib/api';
import { computeVideoProgress, videoQuestions } from '@/lib/videoFlow';
import { useAuth } from '@/contexts/AuthContext';

const READY_MESSAGE = 'All details collected! The artist has been notified.';

interface Props {
  bookingRequestId: number;
}

/**
 * Wrapper for MessageThread that runs the personalized video Q&A sequence.
 */
export default function PersonalizedVideoFlow({ bookingRequestId }: Props) {
  const { user } = useAuth();

  const refreshFlow = useCallback(async () => {
    try {
      const res = await getMessagesForBookingRequest(bookingRequestId);
      const msgs = res.data;
      const progress = computeVideoProgress(msgs);

      if (user?.user_type === 'client') {
        if (progress < videoQuestions.length) {
          const next = videoQuestions[progress];
          const alreadyAsked = msgs.some(
            (m) => m.message_type === 'system' && m.content === next,
          );
          if (!alreadyAsked) {
            await postMessageToBookingRequest(bookingRequestId, {
              content: next,
              message_type: 'system',
            });
          }
        } else {
          const done = msgs.some(
            (m) => m.message_type === 'system' && m.content === READY_MESSAGE,
          );
          if (!done) {
            await postMessageToBookingRequest(bookingRequestId, {
              content: READY_MESSAGE,
              message_type: 'system',
            });
          }
        }
      }
    } catch (err) {
      console.error('Video flow check failed', err);
    }
  }, [bookingRequestId, user]);

  useEffect(() => {
    (async () => {
      await refreshFlow();
    })();
    const id = setInterval(refreshFlow, 4000);
    return () => clearInterval(id);
  }, [refreshFlow]);

  return <MessageThread bookingRequestId={bookingRequestId} onMessageSent={refreshFlow} />;
}

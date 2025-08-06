import { computeVideoProgress, videoQuestions } from '../videoFlow';
import type { Message } from '@/types';

const baseMessage = {
  id: 1,
  booking_request_id: 1,
  sender_id: 1,
  // Use uppercase message type to match backend payloads.
  message_type: 'SYSTEM' as const,
  sender_type: 'client' as const,
  content: '',
  quote_id: null,
  attachment_url: null,
  timestamp: '2024-01-01T00:00:00Z',
};

function q(content: string): Message {
  return { ...baseMessage, content, message_type: 'SYSTEM' } as Message;
}

function a(): Message {
  return { ...baseMessage, sender_type: 'client', message_type: 'USER', content: 'ans' } as Message;
}

describe('computeVideoProgress', () => {
  it('returns 0 when no messages', () => {
    expect(computeVideoProgress([])).toBe(0);
  });

  it('detects a single answered question', () => {
    const msgs = [q(videoQuestions[0]), a()];
    expect(computeVideoProgress(msgs)).toBe(1);
  });

  it('detects all questions answered', () => {
    const msgs: Message[] = [];
    videoQuestions.forEach((qt) => {
      msgs.push(q(qt));
      msgs.push(a());
    });
    expect(computeVideoProgress(msgs)).toBe(videoQuestions.length);
  });

  it('stops counting when a question lacks an answer', () => {
    const msgs = [q(videoQuestions[0]), a(), q(videoQuestions[1])];
    expect(computeVideoProgress(msgs)).toBe(1);
  });

  it('ignores unrelated system messages', () => {
    const msgs = [q(videoQuestions[0]), a(), q('Unrelated'), a()];
    expect(computeVideoProgress(msgs)).toBe(1);
  });
});

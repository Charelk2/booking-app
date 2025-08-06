export const videoQuestions = [
  'Who is the video for?',
  'What is the occasion?',
  'When should the video be ready?',
  'Any specific instructions or message?',
];

import type { Message } from '@/types';

/**
 * Determine how many personalized video questions have been answered.
 */
export function computeVideoProgress(messages: Message[]): number {
  let index = 0;
  let cursor = 0;
  for (const question of videoQuestions) {
    const qIndex = messages.findIndex(
      (m, i) =>
        i >= cursor &&
        m.message_type.toUpperCase() === 'SYSTEM' &&
        m.content === question,
    );
    if (qIndex === -1) break;
    const answerIndex = messages.findIndex(
      (m, i) => i > qIndex && m.sender_type === 'client',
    );
    if (answerIndex === -1) break;
    index += 1;
    cursor = answerIndex + 1;
  }
  return index;
}

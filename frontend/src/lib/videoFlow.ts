import type { Message } from '@/types';

export const READY_MESSAGE = 'All details collected! The artist has been notified.';

export const videoQuestions = [
  'Who is the video for?',
  'What is the occasion?',
  'When should the video be ready?',
  'Any specific instructions or message?',
] as const;

function normalizeMessageType(messageType: unknown): string {
  return String(messageType ?? '').toUpperCase();
}

function normalizeSenderType(senderType: unknown): string {
  return String(senderType ?? '').toLowerCase();
}

function normalizeContent(content: unknown): string {
  return String(content ?? '').trim();
}

function isSystemMessage(m: Message, exactContent: string): boolean {
  return (
    normalizeMessageType((m as any)?.message_type) === 'SYSTEM' &&
    normalizeContent((m as any)?.content) === normalizeContent(exactContent)
  );
}

function isClientMessage(m: Message): boolean {
  return normalizeSenderType((m as any)?.sender_type) === 'client';
}

function findSystemIndex(messages: Message[], question: string, startIndex: number): number {
  const q = normalizeContent(question);

  for (let i = Math.max(0, startIndex); i < messages.length; i++) {
    const m = messages[i];
    if (normalizeMessageType((m as any)?.message_type) !== 'SYSTEM') continue;
    if (normalizeContent((m as any)?.content) === q) return i;
  }
  return -1;
}

function findClientAnswerIndex(messages: Message[], startIndex: number): number {
  for (let i = Math.max(0, startIndex); i < messages.length; i++) {
    if (isClientMessage(messages[i])) return i;
  }
  return -1;
}

export type VideoFlowState = {
  totalQuestions: number;
  answeredCount: number;

  // If not complete, this is the next question in sequence.
  nextQuestion: string | null;

  // True when the next question has never been asked in the thread yet.
  // (If asked but unanswered, this will be false and waitingForAnswer will be true.)
  shouldAskNextQuestion: boolean;

  // True when the next question has been asked, but no client message has appeared after it yet.
  waitingForAnswer: boolean;

  isComplete: boolean;
  hasReadyMessage: boolean;
};

/**
 * Single source of truth for the flow state.
 * This is more reliable than sprinkling checks across UI code.
 */
export function getVideoFlowState(messages: Message[]): VideoFlowState {
  const totalQuestions = videoQuestions.length;

  const hasReadyMessage = messages.some((m) => isSystemMessage(m, READY_MESSAGE));

  // Walk sequentially through questions.
  let answeredCount = 0;
  let cursor = 0;

  for (const question of videoQuestions) {
    const qIndex = findSystemIndex(messages, question, cursor);

    // Question has not been asked yet (after the last cursor).
    if (qIndex === -1) {
      return {
        totalQuestions,
        answeredCount,
        nextQuestion: question,
        shouldAskNextQuestion: true,
        waitingForAnswer: false,
        isComplete: false,
        hasReadyMessage,
      };
    }

    // Question was asked; look for the first client message after it.
    const answerIndex = findClientAnswerIndex(messages, qIndex + 1);
    if (answerIndex === -1) {
      return {
        totalQuestions,
        answeredCount,
        nextQuestion: question,
        shouldAskNextQuestion: false,
        waitingForAnswer: true,
        isComplete: false,
        hasReadyMessage,
      };
    }

    answeredCount += 1;
    cursor = answerIndex + 1;
  }

  // All questions in sequence were answered
  return {
    totalQuestions,
    answeredCount,
    nextQuestion: null,
    shouldAskNextQuestion: false,
    waitingForAnswer: false,
    isComplete: true,
    hasReadyMessage,
  };
}

/**
 * Backwards-compatible export:
 * Determine how many personalized video questions have been answered.
 */
export function computeVideoProgress(messages: Message[]): number {
  return getVideoFlowState(messages).answeredCount;
}

// components/chat/MessageThread/grouping/groupMessages.ts
import type { ThreadMessage, MessageGroup } from './types';
import { safeParseDate } from '@/lib/chat/threadStore';

/**
 * WhatsApp-like grouping: break on timestamp gaps, system boundaries, or sender changes.
 * Day divider flag set when the calendar day changes between adjacent messages.
 */
export function groupMessages(
  visibleMessages: ThreadMessage[],
  shouldShowTimestampGroup: (msg: ThreadMessage, idx: number, arr: ThreadMessage[]) => boolean,
): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (let idx = 0; idx < visibleMessages.length; idx += 1) {
    const msg = visibleMessages[idx];
    const isNewGroupNeededBase = shouldShowTimestampGroup(msg, idx, visibleMessages);
    const isSystemNow = String(msg.message_type || '').toUpperCase() === 'SYSTEM';
    const prev = idx > 0 ? visibleMessages[idx - 1] : null;
    const wasSystemPrev = prev ? String(prev.message_type || '').toUpperCase() === 'SYSTEM' : false;
    const isNewGroupNeeded = isNewGroupNeededBase || isSystemNow || wasSystemPrev;
    const isNewDay =
      idx === 0 ||
      formatDay(visibleMessages[idx - 1]) !== formatDay(msg);

    if (isNewGroupNeeded || groups.length === 0) {
      groups.push({
        sender_id: msg.sender_id ?? null,
        sender_type: msg.sender_type,
        messages: [msg],
        showDayDivider: isNewDay,
      });
    } else {
      const lastGroup = groups[groups.length - 1];
      lastGroup.messages.push(msg);
      if (isNewDay) lastGroup.showDayDivider = true;
    }
  }
  return groups;
}

function formatDay(m: ThreadMessage): string {
  try {
    const d = safeParseDate(m.timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

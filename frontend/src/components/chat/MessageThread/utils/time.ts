// components/chat/MessageThread/utils/time.ts
export function dayLabel(d: Date) {
  try {
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  } catch {
    return d.toDateString();
  }
}


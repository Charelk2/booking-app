// frontend/src/lib/dates.ts
// Shared date helpers for chat/inbox flows.

export function safeParseDate(raw: string | null | undefined): Date {
  if (!raw) return new Date(0);
  const trimmed = raw.trim();
  if (!trimmed) return new Date(0);
  const isoLike = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed);
  const hasOffset = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed);
  if (isoLike && !hasOffset) {
    return new Date(`${trimmed}Z`);
  }
  return new Date(trimmed);
}


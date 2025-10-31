// frontend/src/utils/messages.ts
export type Message = {
  id: string | number;
  clientId?: string; // for optimistic replace
  text: string;
  createdAt: string; // ISO string
  pending?: boolean;
  // passthrough for any extra fields
  [k: string]: any;
};

export function normalizeMessage(raw: any): Message {
  const id = raw?.id ?? raw?.message_id ?? `tmp-${raw?.client_id ?? raw?.clientId ?? ''}`;
  const clientId = raw?.client_id ?? raw?.clientId ?? undefined;
  const text = raw?.text ?? raw?.content ?? raw?.body ?? '';
  const createdAt = raw?.createdAt ?? raw?.created_at ?? raw?.timestamp ?? new Date().toISOString();
  const pending = !!raw?.pending;
  return {
    id,
    clientId,
    text,
    createdAt: typeof createdAt === 'string' ? createdAt : new Date(createdAt).toISOString(),
    pending,
    ...raw,
  } as Message;
}

export function sortByCreatedThenId(a: Message, b: Message) {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (ta === tb) return String(a.id).localeCompare(String(b.id));
  return ta - tb;
}

export function dedupeMerge(list: Message[], incoming: Message): Message[] {
  const exists = list.some(
    (m) => m.id === incoming.id || (!!incoming.clientId && m.clientId === incoming.clientId),
  );
  if (exists) {
    return list
      .map((m) =>
        (incoming.clientId && m.clientId === incoming.clientId) || m.id === incoming.id
          ? { ...m, ...incoming, pending: false }
          : m,
      )
      .sort(sortByCreatedThenId);
  }
  const next = [...list, incoming];
  next.sort(sortByCreatedThenId);
  return next;
}


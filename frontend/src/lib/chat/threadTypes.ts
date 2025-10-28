export type Id = string;

export type Participant = {
  id: Id;
  name: string;
  avatarUrl?: string | null;
};

export type ConversationSummary = {
  id: Id;
  title?: string | null;
  participants: Participant[];
  lastMessage?: {
    id: Id;
    text: string;
    createdAt: string;
    authorId?: Id | null;
  } | null;
  lastActivityAt: string;
  unreadCount: number;
  lastReadMessageId?: Id | null;
  booking?: {
    id: Id;
    type: 'live' | 'video' | 'sound' | 'other';
    status: 'draft' | 'pending' | 'requested' | 'quoted' | 'confirmed' | 'completed' | 'cancelled';
    pricePreview?: string | null;
  } | null;
};

export type Message = {
  id: Id;
  conversationId: Id;
  authorId: Id;
  text?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  status?: 'sending' | 'sent' | 'delivered' | 'error';
  pending?: boolean;
  meta?: Record<string, unknown> | null;
};

export type ReadState = {
  conversationId: Id;
  lastReadMessageId: Id | null;
  updatedAt: string;
};

export type ConversationEnvelope = {
  summaries: ConversationSummary[];
  messages?: Record<Id, Message[]>;
  readState?: Record<Id, ReadState>;
};

export type RealtimeEvent =
  | { type: 'conversation.created'; conversation: ConversationSummary }
  | { type: 'conversation.updated'; conversation: Partial<ConversationSummary> & { id: Id } }
  | { type: 'conversation.deleted'; id: Id }
  | { type: 'message.added'; message: Message }
  | { type: 'message.updated'; message: Partial<Message> & { id: Id; conversationId: Id } }
  | { type: 'message.deleted'; conversationId: Id; id: Id }
  | { type: 'read.updated'; conversationId: Id; lastReadMessageId: Id; unreadCount?: number; updatedAt?: string };

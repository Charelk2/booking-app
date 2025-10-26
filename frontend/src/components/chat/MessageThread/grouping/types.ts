// components/chat/MessageThread/grouping/types.ts
export type ThreadMessage = any; // replace with real type during migration

export type MessageGroup = {
  sender_id: number | null;
  sender_type: string;
  messages: ThreadMessage[];
  showDayDivider: boolean;
};

// Re-export helper types for keys
export type GroupKeyMap = Map<string, number>;

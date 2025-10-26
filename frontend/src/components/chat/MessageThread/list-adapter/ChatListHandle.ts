// components/chat/MessageThread/list-adapter/ChatListHandle.ts
export type Align = 'start' | 'center' | 'end';

export interface ChatListHandle {
  scrollToEnd(opts?: { smooth?: boolean }): void;
  scrollToIndex(index: number, opts?: { align?: Align; smooth?: boolean }): void;
  scrollBy(deltaPx: number): void;
  adjustForPrependedItems(count: number, insertedHeightPx?: number): void;
  getScroller(): HTMLElement | null; // web only; returns null on native
  onAtBottomChange(cb: (isAtBottom: boolean) => void): void;
  refreshMeasurements(): void;
}


// @ts-nocheck
// components/chat/MessageThread/list-adapter/FlashList.native.tsx
// React Native virtualization adapter (stub for now).
import * as React from 'react';
import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';
import type { ChatListHandle } from './ChatListHandle';

type FlashListProps = { children?: React.ReactNode };

function FlashListImpl({ children }: FlashListProps, ref: React.Ref<ChatListHandle>) {
  useImperativeHandle(ref, () => ({
    scrollToEnd: () => {},
    scrollToIndex: () => {},
    scrollBy: () => {},
    adjustForPrependedItems: () => {},
    getScroller: () => null,
    onAtBottomChange: () => {},
    refreshMeasurements: () => {},
  }));
  return <View>{children}</View>;
}

export default forwardRef<ChatListHandle, FlashListProps>(FlashListImpl);

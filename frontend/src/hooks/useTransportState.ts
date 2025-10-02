import { useSyncExternalStore } from 'react';

import {
  getTransportStateSnapshot,
  subscribeTransportState,
  type TransportState,
} from '@/lib/transportState';

const getSnapshot = () => getTransportStateSnapshot();

export const useTransportState = (): TransportState =>
  useSyncExternalStore(subscribeTransportState, getSnapshot, getSnapshot);

export default useTransportState;

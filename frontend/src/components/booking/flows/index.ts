import { BookingFlow } from './types';
import musician from './musician';
import photographer from './photographer';
import videographer from './videographer';

export const bookingFlowRegistry: Record<string, BookingFlow> = {
  musician,
  photographer,
  videographer,
};

export type { BookingFlow } from './types';

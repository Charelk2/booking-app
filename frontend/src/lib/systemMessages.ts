import { t } from '@/lib/i18n';

type AnyMsg = {
  message_type?: string | null;
  system_key?: string | null;
  content?: string | null;
  expires_at?: string | null;
  action?: string | null;
};

const up = (v?: string | null) => (v ?? '').toUpperCase();

export const isSystemMessage = (m: AnyMsg) => up(m.message_type) === 'SYSTEM' || !!m.system_key;

export function systemLabel(m: AnyMsg): string {
  const key = (m.system_key || '').toLowerCase();
  switch (key) {
    case 'booking_details_v1':
      return t('system.newRequest', 'New Booking Request');
    case 'event_prep_updated':
      return t('system.eventPrepUpdated', 'Event prep updated');
    case 'event_prep_contact_saved':
      return t('system.eventPrepContactSaved', 'Day-of contact saved');
    case 'event_prep_loadin_saved':
      return t('system.eventPrepLoadinSaved', 'Load-in window saved');
    case 'event_prep_tech_owner_updated':
      return t('system.eventPrepTechOwnerUpdated', 'Tech ownership updated');
    case 'event_prep_stage_power_confirmed':
      return t('system.eventPrepStagePowerConfirmed', 'Stage power confirmed');
    case 'event_prep_parking_access_notes_updated':
      return t('system.eventPrepParkingAccessUpdated', 'Parking & access notes updated');
    case 'event_prep_schedule_notes_updated':
      return t('system.eventPrepScheduleNotesUpdated', 'Schedule notes updated');
    case 'quote_accepted':
      return t('system.quoteAccepted', 'Quote accepted');
    case 'quote_declined':
      return t('system.quoteDeclined', 'Quote declined');
    case 'quote_expiring':
      return t('system.quoteExpiring', 'Quote expiring soon');
    case 'quote_expired':
      return t('system.quoteExpired', 'Quote expired');
    case 'deposit_due':
      return t('system.depositDue', 'Deposit due');
    case 'booking_confirmed':
      return t('system.bookingConfirmed', 'Booking confirmed');
    default: {
      const content = (m.content || '').trim();
      if (!content) return t('system.update', 'Update');
      return content;
    }
  }
}

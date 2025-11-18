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
    case 'booking_confirmed':
      return t('system.bookingConfirmed', 'Booking confirmed');
    case 'event_finished_v1:client':
    case 'event_finished_v1:artist':
      return t('system.eventFinished', 'Event finished');
    case 'event_auto_completed_v1':
      return t('system.eventAutoCompleted', 'Event completed automatically');
    case 'dispute_opened_v1':
      return t('system.disputeOpened', 'Problem reported');
    case 'review_invite_client_v1':
      return t('system.reviewInviteClient', 'Review your event');
    case 'review_invite_provider_v1':
      return t('system.reviewInviteProvider', 'Review your client');
    default: {
      const content = (m.content || '').trim();
      if (!content) return t('system.update', 'Update');
      return content;
    }
  }
}
// moved to lib/chat

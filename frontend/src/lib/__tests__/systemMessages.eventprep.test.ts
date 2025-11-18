import { systemLabel } from '../chat/systemMessages';

describe('systemMessages: event prep keys', () => {
  const mk = (k: string) => ({ message_type: 'SYSTEM', system_key: k, content: '' });
  it('labels known event prep keys', () => {
    expect(systemLabel(mk('event_prep_updated')).toLowerCase()).toContain('event prep');
    expect(systemLabel(mk('event_prep_contact_saved')).toLowerCase()).toContain('contact');
    expect(systemLabel(mk('event_prep_loadin_saved')).toLowerCase()).toContain('load-in');
    expect(systemLabel(mk('event_prep_tech_owner_updated')).toLowerCase()).toContain('tech');
    expect(systemLabel(mk('event_prep_stage_power_confirmed')).toLowerCase()).toContain('power');
  });
});

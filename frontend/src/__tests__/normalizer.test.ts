import { normalizeMessage } from '@/lib/normalizers/messages';

describe('normalizeMessage', () => {
  it('normalizes core fields and preserves attachments/meta', () => {
    const raw = {
      id: '42',
      booking_request_id: '7',
      sender_id: '5',
      sender_type: 'artist',
      content: 'Hello',
      message_type: 'text',
      quote_id: null,
      attachment_url: '/files/a.png',
      attachment_meta: { content_type: 'image/png', original_filename: 'a.png', size: 1234 },
      visible_to: 'artist',
      is_read: false,
      timestamp: '2025-01-01T10:00:00',
      reply_to_message_id: 1,
      reply_to_preview: 'Prev',
      reactions: { '👍': 2 },
      my_reactions: ['👍'],
    };
    const msg = normalizeMessage(raw as any) as any;
    expect(msg.id).toBe(42);
    expect(msg.booking_request_id).toBe(7);
    expect(msg.sender_id).toBe(5);
    expect(msg.sender_type).toBe('service_provider');
    expect(msg.message_type).toBe('USER');
    expect(msg.attachment_meta?.content_type).toBe('image/png');
    expect(msg.reply_to_message_id).toBe(1);
    expect(msg.reply_to_preview).toBe('Prev');
    expect(msg.reactions?.['👍']).toBe(2);
    expect(msg.my_reactions).toContain('👍');
    // timestamp should normalize to ISO with Z
    expect(msg.timestamp).toMatch(/Z$/);
  });
});


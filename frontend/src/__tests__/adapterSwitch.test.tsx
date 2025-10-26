import { selectAdapter, VIRTUALIZATION_THRESHOLD } from '@/components/chat/MessageThread/utils/adapter';

describe('selectAdapter', () => {
  it('returns plain for small counts', () => {
    expect(selectAdapter(0)).toBe('plain');
    expect(selectAdapter(10)).toBe('plain');
    expect(selectAdapter(VIRTUALIZATION_THRESHOLD)).toBe('plain');
  });
  it('returns virtuoso for large counts', () => {
    expect(selectAdapter(VIRTUALIZATION_THRESHOLD + 1)).toBe('virtuoso');
    expect(selectAdapter(999)).toBe('virtuoso');
  });
});


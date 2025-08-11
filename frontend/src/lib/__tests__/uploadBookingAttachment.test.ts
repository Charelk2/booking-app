import api, { uploadBookingAttachment } from '../api';

describe('uploadBookingAttachment', () => {
  it('omits manual Content-Type header so the browser adds the boundary', () => {
    const formData = new FormData();
    const file = new File(['a'], 'a.txt', { type: 'text/plain' });
    formData.append('file', file);
    const spy = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { url: '/file' } } as ReturnType<typeof api.post>);
    uploadBookingAttachment(formData);
    const config = spy.mock.calls[0][2];
    expect(config?.headers?.['Content-Type']).toBeUndefined();
  });
});

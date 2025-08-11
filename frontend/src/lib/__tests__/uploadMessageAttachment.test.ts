import api, { uploadMessageAttachment } from '../api';

describe('uploadMessageAttachment', () => {
  it('omits manual Content-Type header so the browser adds the boundary', () => {
    const file = new File(['a'], 'a.txt', { type: 'text/plain' });
    const spy = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { url: '/file' } } as ReturnType<typeof api.post>);
    uploadMessageAttachment(1, file);
    const config = spy.mock.calls[0][2];
    expect(config?.headers?.['Content-Type']).toBeUndefined();
  });
});

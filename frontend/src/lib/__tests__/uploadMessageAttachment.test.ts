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

  it('throws an error when file is missing', async () => {
    await expect(
      uploadMessageAttachment(1, undefined as unknown as File),
    ).rejects.toThrow('Attachment file is required');
  });
});

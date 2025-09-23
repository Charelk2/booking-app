import api, { uploadMessageAttachment } from '../api';
import axios from 'axios';

describe('uploadMessageAttachment', () => {
  it('requests a presigned URL and PUTs the file', async () => {
    const file = new File(['a'], 'a.txt', { type: 'text/plain' });
    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({
      data: {
        key: 'files/1/2025/09/abc.txt',
        put_url: 'https://presigned-put',
        get_url: 'https://presigned-get',
        public_url: 'https://media.example.com/files/1/2025/09/abc.txt',
        headers: { 'Content-Type': 'text/plain' },
        upload_expires_in: 600,
        download_expires_in: 600,
      },
    } as any);
    const putSpy = jest.spyOn(axios, 'put').mockResolvedValue({ status: 200 } as any);
    const res = await uploadMessageAttachment(1, file);
    expect(postSpy).toHaveBeenCalled();
    expect(putSpy).toHaveBeenCalledWith('https://presigned-put', file, expect.any(Object));
    expect(res.data.url).toBe('https://media.example.com/files/1/2025/09/abc.txt');
  });

  it('throws an error when file is missing', async () => {
    await expect(uploadMessageAttachment(1, undefined as unknown as File)).rejects.toThrow(
      'Attachment file is required',
    );
  });
});

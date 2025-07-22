global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, json: async () => ({}) } as any)
) as any;
// throw on any real network attempts:
const realRequest = global.XMLHttpRequest;
// If used, mock or fail.

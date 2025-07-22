global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, json: async () => ({}) })
);
// If XMLHttpRequest is used, stub it:
// global.XMLHttpRequest = function() { throw new Error('XHR blocked in tests'); };

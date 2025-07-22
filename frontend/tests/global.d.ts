export {};

declare global {
  // eslint-disable-next-line no-var
  var flushPromises: () => Promise<void>;
}

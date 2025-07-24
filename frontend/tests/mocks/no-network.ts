const throwNetworkError = () => {
  throw new Error('Network access is disabled in unit tests. Mock requests instead.');
};

(globalThis as any).fetch = jest.fn(() => throwNetworkError());

class NoXMLHttpRequest {
  constructor() {
    throwNetworkError();
  }
}
(globalThis as any).XMLHttpRequest = NoXMLHttpRequest as any;

class NoWebSocket {
  constructor() {
    throwNetworkError();
  }
}
(globalThis as any).WebSocket = NoWebSocket as any;

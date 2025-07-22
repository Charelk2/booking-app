const fail = () => {
  throw new Error('Network access is disabled in unit tests. Mock requests instead.');
};

(globalThis as any).fetch = jest.fn(() => fail());

class NoXMLHttpRequest {
  constructor() {
    fail();
  }
}
(globalThis as any).XMLHttpRequest = NoXMLHttpRequest as any;

class NoWebSocket {
  constructor() {
    fail();
  }
}
(globalThis as any).WebSocket = NoWebSocket as any;

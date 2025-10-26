export {};

declare global {
  interface GoogleIdentity {
    accounts?: {
      id?: {
        initialize: (...args: unknown[]) => void;
        prompt: (...args: unknown[]) => void;
        cancel: () => void;
        disableAutoSelect: () => void;
      };
    };
  }

  interface Window {
    google?: GoogleIdentity;
  }
}


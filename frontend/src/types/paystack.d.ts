// types/paystack.d.ts
declare global {
  interface Window {
    PaystackPop?: {
      setup(config: PaystackSetupConfig): PaystackInlineInstance;
    };
  }

  interface PaystackInlineInstance {
    openIframe(): void;
    abort?(): void;
  }

  interface PaystackSetupConfig {
    key: string; // public key
    email: string;
    amount: number; // in kobo (NGN) or lowest denomination for the currency
    currency?: string; // e.g. "NGN", "GHS", "USD", "ZAR"
    ref?: string; // your reference
    metadata?: Record<string, any>;
    label?: string;
    channels?: string[]; // ["card","bank","ussd","qr","mobile_money"]
    callback(response: { status: string; reference: string; [k: string]: any }): void;
    onClose(): void;
  }
}

export {};

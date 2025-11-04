declare module 'react-datepicker';
declare module 'react-window';
declare module '@paystack/inline-js' {
  // Minimal typings for Paystack InlineJS v2 default export
  export default class PaystackInline {
    constructor();
    resumeTransaction(accessCode: string, options: Record<string, unknown>): void;
    newTransaction?(config: Record<string, unknown>): void;
  }
}

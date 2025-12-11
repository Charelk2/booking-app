export interface PersonalizedVideoStorage {
  loadSimulatedOrder(orderId: number): any | null;
  saveSimulatedOrder(orderId: number, order: any): void;
  clearSimulatedOrder(orderId: number): void;

  getThreadIdForOrder(orderId: number): string | null;
  saveThreadIdForOrder(orderId: number, threadId: number | string): void;
  saveOrderIdForThread(threadId: number | string, orderId: number): void;

  loadBriefSeed(orderId: number): any | null;
  saveBriefSeed(orderId: number, seed: any): void;

  loadBriefAnswers(orderId: number): Record<string, any> | null;
  saveBriefAnswers(orderId: number, answers: Record<string, any>): void;

  markBriefComplete(orderId: number): void;
}

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function safeLocalStorageRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

export const pvStorage: PersonalizedVideoStorage = {
  loadSimulatedOrder(orderId) {
    const raw = safeLocalStorageGet(`vo-sim-${orderId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  saveSimulatedOrder(orderId, order) {
    try {
      safeLocalStorageSet(`vo-sim-${orderId}`, JSON.stringify(order));
    } catch {}
  },
  clearSimulatedOrder(orderId) {
    safeLocalStorageRemove(`vo-sim-${orderId}`);
  },
  getThreadIdForOrder(orderId) {
    return safeLocalStorageGet(`vo-thread-${orderId}`);
  },
  saveThreadIdForOrder(orderId, threadId) {
    safeLocalStorageSet(`vo-thread-${orderId}`, String(threadId));
  },
  saveOrderIdForThread(threadId, orderId) {
    safeLocalStorageSet(`vo-order-for-thread-${threadId}`, String(orderId));
  },
  loadBriefSeed(orderId) {
    const raw = safeLocalStorageGet(`vo-brief-seed-${orderId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  saveBriefSeed(orderId, seed) {
    try {
      safeLocalStorageSet(`vo-brief-seed-${orderId}`, JSON.stringify(seed));
    } catch {}
  },
  loadBriefAnswers(orderId) {
    const raw = safeLocalStorageGet(`vo-ans-${orderId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  saveBriefAnswers(orderId, answers) {
    try {
      safeLocalStorageSet(`vo-ans-${orderId}`, JSON.stringify(answers));
    } catch {}
  },
  markBriefComplete(orderId) {
    safeLocalStorageSet(`vo-brief-complete-${orderId}`, "1");
  },
};


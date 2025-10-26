import { trackEvent } from '@/lib/analytics';
import type { AxiosError } from 'axios';

type Listener = () => void;

export interface TransportState {
  online: boolean;
  lastOnlineAt: number | null;
  lastOfflineAt: number | null;
  isDocumentHidden: boolean;
  effectiveType: string | null;
  downlink: number | null;
  saveData: boolean;
}

export interface TransportErrorMeta {
  isNetworkError: boolean;
  isOffline: boolean;
  isTransient: boolean;
  status?: number;
  code?: string | null;
}

interface TransportTaskOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitterMs?: number;
  immediateOnReconnect?: boolean;
  metadata?: Record<string, unknown>;
  onFailure?: (error: unknown) => void;
}

interface InternalTask {
  id: string;
  run: () => Promise<void> | void;
  attempts: number;
  delayMs: number;
  options: Required<TransportTaskOptions>;
  timer: ReturnType<typeof setTimeout> | null;
  lastError: unknown;
}

const DEFAULT_TASK_OPTIONS: Required<TransportTaskOptions> = {
  maxAttempts: 5,
  initialDelayMs: 400,
  maxDelayMs: 15000,
  backoffFactor: 2,
  jitterMs: 250,
  immediateOnReconnect: true,
  metadata: {},
  onFailure: () => {},
};

const listeners = new Set<Listener>();
const taskQueue = new Map<string, InternalTask>();

const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';

const getConnection = () => {
  try {
    if (!hasWindow) return null;
    const nav = window.navigator as any;
    return nav?.connection ?? null;
  } catch {
    return null;
  }
};

const connectionRef = getConnection();

const initialOnline = hasWindow ? window.navigator.onLine !== false : true;
const nowTs = () => Date.now();

let offlineStartedAt: number | null = initialOnline ? null : nowTs();

let state: TransportState = {
  online: initialOnline,
  lastOnlineAt: initialOnline ? nowTs() : null,
  lastOfflineAt: initialOnline ? null : nowTs(),
  isDocumentHidden: hasDocument ? document.visibilityState === 'hidden' : false,
  effectiveType: connectionRef?.effectiveType ?? null,
  downlink: typeof connectionRef?.downlink === 'number' ? connectionRef!.downlink : null,
  saveData: Boolean(connectionRef?.saveData),
};

const notify = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('transport listener error', err);
      }
    }
  });
};

const updateState = (patch: Partial<TransportState>) => {
  state = { ...state, ...patch };
  notify();
};

const scheduleTask = (task: InternalTask) => {
  if (task.timer) {
    clearTimeout(task.timer);
    task.timer = null;
  }

  if (!state.online) {
    return;
  }

  const jitter = Math.round(Math.random() * task.options.jitterMs);
  const delay = Math.max(
    0,
    task.attempts === 0 && task.options.immediateOnReconnect ? 0 : task.delayMs,
  );

  task.timer = setTimeout(() => {
    executeTask(task.id);
  }, delay + jitter);
};

const processQueue = () => {
  taskQueue.forEach((task) => {
    if (!task.timer) {
      scheduleTask(task);
    }
  });
};

// Public helper to nudge queued tasks without waiting for window 'online'.
// Used when realtime (WS) becomes healthy/open to flush sends immediately.
export const flushTransportQueue = () => {
  try { processQueue(); } catch {}
};

const executeTask = (id: string) => {
  const task = taskQueue.get(id);
  if (!task) return;
  if (!state.online) {
    if (task.timer) {
      clearTimeout(task.timer);
      task.timer = null;
    }
    return;
  }

  task.timer = null;
  task.attempts += 1;

  Promise.resolve()
    .then(() => task.run())
    .then(() => {
      taskQueue.delete(id);
      trackEvent('inbox_retry_success', {
        taskId: id,
        attempts: task.attempts,
        ...task.options.metadata,
      });
    })
    .catch((err) => {
      const transient = isTransientTransportError(err);
      task.lastError = err;
      if (transient && task.attempts < task.options.maxAttempts) {
        task.delayMs = Math.min(
          Math.max(task.delayMs * task.options.backoffFactor, task.options.initialDelayMs),
          task.options.maxDelayMs,
        );
        scheduleTask(task);
        trackEvent('inbox_retry_scheduled', {
          taskId: id,
          attempts: task.attempts,
          transient: true,
          ...task.options.metadata,
        });
        return;
      }

      taskQueue.delete(id);
      trackEvent('inbox_retry_failed', {
        taskId: id,
        attempts: task.attempts,
        transient,
        ...task.options.metadata,
      });
      try {
        task.options.onFailure(err);
      } catch {}
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('transport task failed', {
          taskId: id,
          attempts: task.attempts,
          transient,
          error: err,
        });
      }
    });
};

const enqueueTask = (
  id: string,
  run: () => Promise<void> | void,
  options: TransportTaskOptions = {},
) => {
  if (!id) return;
  const merged: Required<TransportTaskOptions> = {
    ...DEFAULT_TASK_OPTIONS,
    ...options,
    metadata: { ...DEFAULT_TASK_OPTIONS.metadata, ...(options.metadata || {}) },
    onFailure: options.onFailure ?? DEFAULT_TASK_OPTIONS.onFailure,
  };

  const existing = taskQueue.get(id);
  const next: InternalTask = existing
    ? {
        ...existing,
        run,
        options: merged,
      }
    : {
        id,
        run,
        attempts: 0,
        delayMs: merged.initialDelayMs,
        options: merged,
        timer: null,
        lastError: null,
      };

  if (!existing) {
    trackEvent('inbox_retry_enqueued', {
      taskId: id,
      ...merged.metadata,
    });
  }

  taskQueue.set(id, next);
  scheduleTask(next);
};

const handleOnline = () => {
  const now = nowTs();
  const duration = offlineStartedAt ? Math.max(now - offlineStartedAt, 0) : 0;
  updateState({ online: true, lastOnlineAt: now });
  offlineStartedAt = null;
  trackEvent('inbox_offline_end', {
    durationMs: duration,
    pendingTasks: taskQueue.size,
  });
  processQueue();
};

const handleOffline = () => {
  const now = nowTs();
  if (!offlineStartedAt) offlineStartedAt = now;
  updateState({ online: false, lastOfflineAt: now });
  trackEvent('inbox_offline_start', {
    pendingTasks: taskQueue.size,
  });
};

const handleVisibility = () => {
  updateState({ isDocumentHidden: hasDocument ? document.visibilityState === 'hidden' : false });
};

const handleConnectionChange = () => {
  const conn = getConnection();
  updateState({
    effectiveType: conn?.effectiveType ?? null,
    downlink: typeof conn?.downlink === 'number' ? conn!.downlink : null,
    saveData: Boolean(conn?.saveData),
  });
};

if (hasWindow) {
  try {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  } catch {}
}

if (hasDocument) {
  try {
    document.addEventListener('visibilitychange', handleVisibility);
  } catch {}
}

try {
  if (connectionRef && typeof connectionRef.addEventListener === 'function') {
    connectionRef.addEventListener('change', handleConnectionChange);
  }
} catch {}

export const subscribeTransportState = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getTransportStateSnapshot = (): TransportState => state;

export const runWithTransport = (
  taskId: string,
  runner: () => Promise<void> | void,
  options: TransportTaskOptions = {},
): Promise<void> | void => {
  if (!taskId || typeof runner !== 'function') return undefined;

  if (!state.online) {
    enqueueTask(taskId, runner, options);
    return undefined;
  }

  return Promise.resolve()
    .then(() => runner())
    .catch((err) => {
      if (isTransientTransportError(err)) {
        enqueueTask(taskId, runner, options);
        return;
      }
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('transport task fatal error', err);
      }
      try {
        options.onFailure?.(err);
      } catch {}
    });
};

export const classifyTransportError = (error: unknown): TransportErrorMeta => {
  if (!error) {
    return { isNetworkError: false, isOffline: false, isTransient: false };
  }

  const meta = (error as any)?.__bookaMeta as TransportErrorMeta | undefined;
  if (meta) {
    return meta;
  }

  const code = (error as any)?.code;
  const status = (error as AxiosError)?.response?.status;
  const message = String((error as Error)?.message || '').toLowerCase();

  const networkCodes = new Set([
    'ECONNABORTED',
    'ERR_NETWORK',
    'ERR_NETWORK_CHANGED',
    'ERR_NETWORK_IO_SUSPENDED',
    'ERR_INTERNET_DISCONNECTED',
    'ERR_CONNECTION_RESET',
    'ERR_CONNECTION_REFUSED',
    'ERR_NAME_NOT_RESOLVED',
    'ENETDOWN',
    'ENETUNREACH',
    'ETIMEDOUT',
  ]);

  const isNetworkError =
    typeof code === 'string' ? networkCodes.has(code) : message.includes('network error');

  const offline = hasWindow ? window.navigator.onLine === false : false;

  let isTransient = false;

  if (!status && isNetworkError) {
    isTransient = true;
  } else if (status) {
    if (status === 408 || status === 425 || status === 429) isTransient = true;
    if (status >= 500) isTransient = true;
  }

  if (
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('load resource')
  ) {
    isTransient = true;
  }

  return {
    isNetworkError,
    isOffline: offline,
    isTransient,
    status: status ?? undefined,
    code: typeof code === 'string' ? code : null,
  };
};

export const isTransientTransportError = (error: unknown): boolean =>
  classifyTransportError(error).isTransient;

export const isOfflineError = (error: unknown): boolean => {
  const meta = classifyTransportError(error);
  if (meta.isOffline) return true;
  if (meta.code === 'ERR_NETWORK_IO_SUSPENDED') return true;
  if (meta.code === 'ERR_NETWORK_CHANGED') return true;
  return false;
};

export const flushTransportQueueForTests = () => {
  taskQueue.forEach((task) => {
    if (task.timer) {
      clearTimeout(task.timer);
      task.timer = null;
    }
    executeTask(task.id);
  });
};

export const getPendingTransportTasks = () => Array.from(taskQueue.keys());

export const setTransportErrorMeta = (error: unknown, meta: Partial<TransportErrorMeta>) => {
  if (!error) return;
  const existing = ((error as any).__bookaMeta || {}) as TransportErrorMeta;
  // Use Object.assign to avoid duplicate-property warnings in strict TS settings
  (error as any).__bookaMeta = Object.assign(
    { isNetworkError: false, isOffline: false, isTransient: false },
    existing || {},
    meta || {},
  );
};

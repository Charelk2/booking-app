'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { User } from '@/types';
import {
  login as apiLogin,
  register as apiRegister,
  verifyMfa as apiVerifyMfa,
  confirmMfa as apiConfirmMfa,
  generateRecoveryCodes as apiGenerateRecoveryCodes,
  disableMfa as apiDisableMfa,
  getCurrentUser,
  getServiceProviderProfileMe,
} from '@/lib/api';
import { clearThreadCaches, getThreadCacheOwner, setThreadCacheOwner } from '@/lib/chat/threadCache';
import { ensureFreshAccess } from '@/lib/refreshCoordinator';
import { getTransportStateSnapshot, runWithTransport } from '@/lib/transportState';

// Guard to prevent double init in React Strict Mode (dev)
let __authDidInit = false;

export type RegisterPayload = {
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  password: string;
  marketing_opt_in?: boolean;
  user_type: 'client' | 'service_provider';
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
    remember?: boolean,
  ) => Promise<{ mfaRequired: true; token: string } | void>;
  verifyMfa: (
    token: string,
    code: string,
    trustedDevice?: boolean,
    deviceId?: string,
  ) => Promise<void>;
  confirmMfa: (code: string) => Promise<void>;
  generateRecoveryCodes: () => Promise<string[]>;
  disableMfa: (code: string) => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  logout: () => void;
  refreshUser?: () => Promise<void>;
  artistViewActive: boolean;
  toggleArtistView: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const logoutInProgressRef = useRef(false);
  const [artistViewActive, setArtistViewActive] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('artistViewActive');
    return stored ? stored === 'true' : true;
  });

  useEffect(() => {
    if (user?.user_type === 'service_provider') {
      localStorage.setItem('artistViewActive', String(artistViewActive));
    }
  }, [artistViewActive, user]);

  const fetchCurrentUserWithArtist = async (options?: { skipRefresh?: boolean }) => {
    const res = await getCurrentUser(options?.skipRefresh ? { _skipRefresh: true } : undefined);
    let userData = res.data;
    if (userData.user_type === 'service_provider') {
      try {
        const profile = await getServiceProviderProfileMe();
        const extras: Partial<User> = {};
        if (profile.data.profile_picture_url) {
          extras.profile_picture_url = profile.data.profile_picture_url;
        }
        if ((profile.data as any).slug) {
          extras.artist_slug = (profile.data as any).slug || null;
        }
        userData = { ...userData, ...extras };
      } catch (err) {
        // Non-fatal: provider profile fetch can fail transiently; avoid loud errors.
        console.warn('Provider profile not available yet or failed to load. Continuing as-is.');
      }
    }
    return userData;
  };

  useEffect(() => {
    // Cookie-only sessions: no token in URL handling
    if (__authDidInit) {
      // StrictMode double-invoke guard in dev
      setLoading(false);
      return;
    }
    __authDidInit = true;

    let storedUser: string | null = null;
    let storagePreference: 'local' | 'session' = 'local';
    try {
      if (typeof window !== 'undefined') {
        const fromLocal = localStorage.getItem('user');
        if (fromLocal) {
          storedUser = fromLocal;
          storagePreference = 'local';
        } else {
          const fromSession = sessionStorage.getItem('user');
          if (fromSession) {
            storedUser = fromSession;
            storagePreference = 'session';
          }
        }
      }
    } catch (e) {
      console.error('Failed to read stored user:', e);
    }

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        storedUser = null;
        try {
          localStorage.removeItem('user');
          sessionStorage.removeItem('user');
        } catch {}
      }
    }

    const doBootstrap = async () => {
      if (!storedUser) {
        // Anonymous boot: do not call /auth/me
        setLoading(false);
        return;
      }
      try {
        const tryFetchOnce = async (skipRefresh: boolean) => fetchCurrentUserWithArtist({ skipRefresh });
        let userData: User | null = null;
        try {
          userData = await tryFetchOnce(!storedUser);
        } catch (e: any) {
          const status = (e?.response?.status ?? e?.status) as number | undefined;
          if (status === 401 && storedUser) {
            try {
              await ensureFreshAccess();
              userData = await tryFetchOnce(true /* skip interceptor */);
            } catch (e2) {
              const statusRefresh = (e2 as any)?.status as number | undefined;
              const detailRefresh = String((e2 as any)?.detail || '');
              const hardExpire =
                typeof statusRefresh === 'number' &&
                statusRefresh === 401 &&
                ['session expired', 'missing refresh token', 'invalid or expired token'].some((msg) =>
                  detailRefresh.toLowerCase().includes(msg),
                );
              if (hardExpire) {
                try {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('app:session-expired'));
                  }
                } catch {}
              } else {
                try {
                  setUser(null);
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('user');
                    sessionStorage.removeItem('user');
                  }
                } catch {}
              }
              return;
            }
          } else {
            // Anonymous bootstrap failing is fine; clear any bogus stored state
            if (!storedUser) {
              try {
                localStorage.removeItem('user');
                sessionStorage.removeItem('user');
              } catch {}
            }
            return;
          }
        }

        if (userData) {
          try {
            const owner = getThreadCacheOwner();
            if (owner && owner !== userData.id) {
              await clearThreadCaches({ includeSession: true });
            }
            setThreadCacheOwner(userData.id);
            if (typeof window !== 'undefined') {
              (window as any).__currentUserId = Number(userData.id || 0) || null;
            }
          } catch {}
          setUser(userData);
          try {
            const serialized = JSON.stringify(userData);
            if (storagePreference === 'session') {
              sessionStorage.setItem('user', serialized);
              localStorage.removeItem('user');
            } else {
              localStorage.setItem('user', serialized);
              sessionStorage.removeItem('user');
            }
          } catch (e) {
            console.error('Failed to persist user payload:', e);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    const ts = getTransportStateSnapshot();
    if (storedUser && ts && ts.online === false) {
      // Defer /auth/me until back online; run immediately on reconnect
      runWithTransport('auth.me.bootstrap', doBootstrap, {
        initialDelayMs: 0,
        jitterMs: 150,
        maxAttempts: 1,
      });
      setLoading(false);
    } else {
      void doBootstrap();
    }
  }, []);

  // Global handler for session expiration broadcasts from the API layer
  useEffect(() => {
    const onExpired = () => {
      if (logoutInProgressRef.current) return;
      try { toast.dismiss(); } catch {}
      try { toast.error('Session expired — please sign in again.'); } catch {}
      try { void import('@/lib/api').then(m => m.logout()); } catch {}
      setUser(null);
      setArtistViewActive(true);
      void clearThreadCaches({ includeSession: true });
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          localStorage.removeItem('artistViewActive');
          sessionStorage.removeItem('user');
          sessionStorage.removeItem('token');
          const path = window.location.pathname + window.location.search;
          const next = encodeURIComponent(path || '/');
          router.replace(`/auth?intent=login&next=${next}`);
          return;
        }
      } catch {}
      router.replace('/auth?intent=login');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('app:session-expired', onExpired);
      return () => window.removeEventListener('app:session-expired', onExpired);
    }
    return () => {};
  }, [router]);

  const login = async (
    email: string,
    password: string,
    remember = true,
  ) => {
    try {
      const response = await apiLogin(email, password);
      if (response.data.mfa_required) {
        return { mfaRequired: true, token: response.data.mfa_token } as const;
      }
      // Dev-only safety net: if Next.js dev proxy drops Set-Cookie from the
      // backend response, set non-HttpOnly cookies on the client so subsequent
      // same-origin requests include them. Production remains HttpOnly only.
      try {
        if (process.env.NODE_ENV === 'development') {
          const a = (response.data as any)?.access_token as string | undefined;
          const r = (response.data as any)?.refresh_token as string | undefined;
          const attrs = 'Path=/; SameSite=Lax';
          if (typeof document !== 'undefined' && a) {
            document.cookie = `access_token=${a}; ${attrs}`;
          }
          if (typeof document !== 'undefined' && r) {
            document.cookie = `refresh_token=${r}; ${attrs}`;
          }
        }
      } catch {}
      // Keep a volatile in-memory token for realtime (WS query param) to avoid relying solely on cookies
      try {
        const a = (response.data as any)?.access_token as string | undefined;
        if (a) setToken(a);
      } catch {}
      const { user: fallbackUser } = response.data;
      const storage = remember ? localStorage : sessionStorage;
      const altStorage = remember ? sessionStorage : localStorage;
      try {
        const userData = await fetchCurrentUserWithArtist();
        try {
          const owner = getThreadCacheOwner();
          if (owner && owner !== userData.id) {
            await clearThreadCaches({ includeSession: true });
          }
          setThreadCacheOwner(userData.id);
          if (typeof window !== 'undefined') {
            (window as any).__currentUserId = Number(userData.id || 0) || null;
          }
        } catch {}
        setUser(userData);
        storage.setItem('user', JSON.stringify(userData));
        altStorage.removeItem('user');
      } catch (err) {
        console.error('Failed to fetch current user:', err);
        try {
          const owner = getThreadCacheOwner();
          if (owner && owner !== fallbackUser.id) {
            await clearThreadCaches({ includeSession: true });
          }
          setThreadCacheOwner(fallbackUser.id);
          if (typeof window !== 'undefined') {
            (window as any).__currentUserId = Number(fallbackUser.id || 0) || null;
          }
        } catch {}
        setUser(fallbackUser);
        storage.setItem('user', JSON.stringify(fallbackUser));
        altStorage.removeItem('user');
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const verifyMfa = async (
    tokenToVerify: string,
    code: string,
    trustedDevice?: boolean,
    deviceId?: string,
  ) => {
    try {
      const response = await apiVerifyMfa(tokenToVerify, code, trustedDevice, deviceId);
      // Same dev-only cookie safety net as in login
      try {
        if (process.env.NODE_ENV === 'development') {
          const a = (response.data as any)?.access_token as string | undefined;
          const r = (response.data as any)?.refresh_token as string | undefined;
          const attrs = 'Path=/; SameSite=Lax';
          if (typeof document !== 'undefined' && a) {
            document.cookie = `access_token=${a}; ${attrs}`;
          }
          if (typeof document !== 'undefined' && r) {
            document.cookie = `refresh_token=${r}; ${attrs}`;
          }
        }
      } catch {}
      // Volatile in-memory token for realtime WS
      try {
        const a = (response.data as any)?.access_token as string | undefined;
        if (a) setToken(a);
      } catch {}
      const { user: fallbackUser } = response.data;
      // Default to persistent storage for MFA completion
      const storage = localStorage;
      const altStorage = sessionStorage;

      try {
        const userData = await fetchCurrentUserWithArtist();
        try {
          const owner = getThreadCacheOwner();
          if (owner && owner !== userData.id) {
            await clearThreadCaches({ includeSession: true });
          }
          setThreadCacheOwner(userData.id);
          if (typeof window !== 'undefined') {
            (window as any).__currentUserId = Number(userData.id || 0) || null;
          }
        } catch {}
        setUser(userData);
        storage.setItem('user', JSON.stringify(userData));
        altStorage.removeItem('user');
      } catch (err) {
        console.error('Failed to fetch current user:', err);
        try {
          const owner = getThreadCacheOwner();
          if (owner && owner !== fallbackUser.id) {
            await clearThreadCaches({ includeSession: true });
          }
          setThreadCacheOwner(fallbackUser.id);
          if (typeof window !== 'undefined') {
            (window as any).__currentUserId = Number(fallbackUser.id || 0) || null;
          }
        } catch {}
        setUser(fallbackUser);
        storage.setItem('user', JSON.stringify(fallbackUser));
        altStorage.removeItem('user');
      }
    } catch (error) {
      console.error('MFA verification failed:', error);
      throw error;
    }
  };

  const confirmMfa = async (code: string) => {
    await apiConfirmMfa(code);
    setUser((prev) => (prev ? { ...prev, mfa_enabled: true } : prev));
  };

  const generateRecoveryCodes = async () => {
    const res = await apiGenerateRecoveryCodes();
    return res.data.codes as string[];
  };

  const disableMfa = async (code: string) => {
    await apiDisableMfa(code);
    setUser((prev) => (prev ? { ...prev, mfa_enabled: false } : prev));
  };

  const refreshUser = async () => {
    try {
      const userData = await fetchCurrentUserWithArtist();
      try {
        const owner = getThreadCacheOwner();
        if (owner && owner !== userData.id) {
          await clearThreadCaches({ includeSession: true });
        }
        setThreadCacheOwner(userData.id);
        if (typeof window !== 'undefined') {
          (window as any).__currentUserId = Number(userData.id || 0) || null;
        }
      } catch {}
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  };

  const toggleArtistView = () => {
    setArtistViewActive((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('artistViewActive', String(next));
      }
      if (user?.user_type === 'service_provider') {
        router.push(next ? '/dashboard/artist' : '/');
      }
      return next;
    });
  };

  const register = async (data: RegisterPayload) => {
    try {
      await apiRegister(data);
      await login(data.email, data.password);
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = () => {
    logoutInProgressRef.current = true;
    // Also invalidate server-side session
    try { void import('@/lib/api').then(m => m.logout()); } catch {}
    // Clear inbox selection and preview caches for the current user
    try {
      if (typeof window !== 'undefined') {
        const role = user?.user_type === 'service_provider' ? 'artist' : 'client';
        const uid = user?.id ? String(user.id) : null;
        if (uid) {
          const base = `inbox:threadsCache:v2:${role}:${uid}`;
          const selKey = `${base}:selected`;
          const persistKey = `${base}:persist`;
          const latestKey = 'inbox:threadsCache:latest';
          try { sessionStorage.removeItem(base); } catch {}
          try { sessionStorage.removeItem(latestKey); } catch {}
          try { sessionStorage.removeItem(selKey); } catch {}
          try { localStorage.removeItem(selKey); } catch {}
          try { localStorage.removeItem(persistKey); } catch {}
        }
      }
    } catch {}
    setUser(null);
    setToken(null);
    setArtistViewActive(true);
    void clearThreadCaches({ includeSession: true });
    try {
      setThreadCacheOwner(null);
      if (typeof window !== 'undefined') {
        delete (window as any).__currentUserId;
      }
    } catch {}
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('artistViewActive');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('token');
    router.push('/');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        verifyMfa,
        confirmMfa,
        generateRecoveryCodes,
        disableMfa,
        register,
        logout,
        refreshUser,
        artistViewActive,
        toggleArtistView,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 

'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
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
    remember?: boolean,
  ) => Promise<void>;
  confirmMfa: (code: string) => Promise<void>;
  generateRecoveryCodes: () => Promise<string[]>;
  disableMfa: (code: string) => Promise<void>;
  register: (data: Partial<User>) => Promise<void>;
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

  const fetchCurrentUserWithArtist = async () => {
    const res = await getCurrentUser();
    let userData = res.data;
    if (userData.user_type === 'service_provider') {
      try {
        const profile = await getServiceProviderProfileMe();
        const extras: Partial<User> = {};
        if (profile.data.profile_picture_url) {
          extras.profile_picture_url = profile.data.profile_picture_url;
        }
        userData = { ...userData, ...extras };
      } catch (err) {
        console.error('Failed to fetch service provider profile:', err);
      }
    }
    return userData;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');

    if (urlToken) {
      sessionStorage.setItem('token', urlToken);
      setToken(urlToken);
      params.delete('token');
      const newUrl = `${window.location.pathname}${
        params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', newUrl);
      (async () => {
        try {
          const userData = await fetchCurrentUserWithArtist();
          setUser(userData);
          sessionStorage.setItem('user', JSON.stringify(userData));
        } catch (err) {
          console.error('Failed to fetch current user:', err);
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    const storedUser =
      localStorage.getItem('user') || sessionStorage.getItem('user');
    const storedToken =
      localStorage.getItem('token') || sessionStorage.getItem('token');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        localStorage.removeItem('user');
        sessionStorage.removeItem('user');
      }
    }
    if (storedToken) {
      setToken(storedToken);
    }
    setLoading(false);
  }, []);

  const login = async (
    email: string,
    password: string,
    remember = false,
  ) => {
    try {
      const response = await apiLogin(email, password);
      if (response.data.mfa_required) {
        return { mfaRequired: true, token: response.data.mfa_token } as const;
      }
      const { user: fallbackUser, access_token } = response.data;
      setToken(access_token);
      const storage = remember ? localStorage : sessionStorage;
      const altStorage = remember ? sessionStorage : localStorage;
      storage.setItem('token', access_token);
      altStorage.removeItem('token');

      try {
        const userData = await fetchCurrentUserWithArtist();
        setUser(userData);
        storage.setItem('user', JSON.stringify(userData));
        altStorage.removeItem('user');
      } catch (err) {
        console.error('Failed to fetch current user:', err);
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
    remember = false,
  ) => {
    try {
      const response = await apiVerifyMfa(tokenToVerify, code);
      const { user: fallbackUser, access_token } = response.data;
      setToken(access_token);
      const storage = remember ? localStorage : sessionStorage;
      const altStorage = remember ? sessionStorage : localStorage;
      storage.setItem('token', access_token);
      altStorage.removeItem('token');

      try {
        const userData = await fetchCurrentUserWithArtist();
        setUser(userData);
        storage.setItem('user', JSON.stringify(userData));
        altStorage.removeItem('user');
      } catch (err) {
        console.error('Failed to fetch current user:', err);
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

  const register = async (data: Partial<User> & { password?: string }) => {
    try {
      await apiRegister(data);
      if (data.email && data.password) {
        await login(data.email, data.password);
      }
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setArtistViewActive(true);
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
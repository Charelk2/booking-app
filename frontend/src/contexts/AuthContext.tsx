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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');

    if (urlToken) {
      localStorage.setItem('token', urlToken);
      setToken(urlToken);
      params.delete('token');
      const newUrl = `${window.location.pathname}${
        params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', newUrl);
      (async () => {
        try {
          const res = await getCurrentUser();
          setUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
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
        const res = await getCurrentUser();
        setUser(res.data);
        storage.setItem('user', JSON.stringify(res.data));
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
        const res = await getCurrentUser();
        setUser(res.data);
        storage.setItem('user', JSON.stringify(res.data));
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
      const res = await getCurrentUser();
      setUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  };

  const register = async (data: Partial<User>) => {
    try {
      const response = await apiRegister(data);
      const userData = response.data;
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
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
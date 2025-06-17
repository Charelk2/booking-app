'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/types';
import {
  login as apiLogin,
  register as apiRegister,
  verifyMfa as apiVerifyMfa,
  confirmMfa as apiConfirmMfa,
  generateRecoveryCodes as apiGenerateRecoveryCodes,
  disableMfa as apiDisableMfa,
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      const { user: userData, access_token } = response.data;
      setUser(userData);
      setToken(access_token);
      const storage = remember ? localStorage : sessionStorage;
      const altStorage = remember ? sessionStorage : localStorage;
      storage.setItem('user', JSON.stringify(userData));
      storage.setItem('token', access_token);
      altStorage.removeItem('user');
      altStorage.removeItem('token');
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
      const { user: userData, access_token } = response.data;
      setUser(userData);
      setToken(access_token);
      const storage = remember ? localStorage : sessionStorage;
      const altStorage = remember ? sessionStorage : localStorage;
      storage.setItem('user', JSON.stringify(userData));
      storage.setItem('token', access_token);
      altStorage.removeItem('user');
      altStorage.removeItem('token');
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
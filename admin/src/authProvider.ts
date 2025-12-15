import type { AuthProvider } from 'react-admin';
import { getAdminToken, inferAdminApiUrl } from './env';

const API_URL = inferAdminApiUrl();

type LoginBody = { email: string; password: string };
type LoginResp = { token: string; user: { id: string; email: string; role: string } };

export const authProvider: AuthProvider = {
  login: async (params: any) => {
    const email = (params?.email || params?.username || '').toString();
    const password = (params?.password || '').toString();
    if (!email || !password) throw new Error('Email and password required');
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password } as LoginBody),
    });
    if (!res.ok) throw new Error('Invalid credentials');
    const data = (await res.json()) as LoginResp;
    localStorage.setItem('booka_admin_token', data.token);
    localStorage.setItem('booka_admin_user', JSON.stringify(data.user));
    return;
  },
  logout: async () => {
    const token = getAdminToken();
    try {
      if (token) {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    localStorage.removeItem('booka_admin_token');
    localStorage.removeItem('booka_admin_user');
    return;
  },
  checkError: async (error) => {
    const status = (error as any)?.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem('booka_admin_token');
      return Promise.reject();
    }
    return Promise.resolve();
  },
  checkAuth: async () => {
    const token = getAdminToken();
    if (!token) return Promise.reject();
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      localStorage.removeItem('booka_admin_token');
      return Promise.reject();
    }
    return;
  },
  getPermissions: async () => {
    const userRaw = localStorage.getItem('booka_admin_user');
    if (!userRaw) return Promise.resolve('support');
    const role = JSON.parse(userRaw)?.role ?? 'support';
    return Promise.resolve(role);
  },
  getIdentity: async () => {
    const userRaw = localStorage.getItem('booka_admin_user');
    if (!userRaw) {
      // Provide a minimal identity to satisfy RA types even before login
      return { id: 'anonymous', fullName: 'Admin', avatar: undefined } as any;
    }
    const user = JSON.parse(userRaw);
    return { id: user.id, fullName: user.email, role: user.role } as any;
  },
};

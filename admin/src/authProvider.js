// Allow zero-config by inferring API URL from hostname if env is missing
const inferApiUrl = () => {
    const env = import.meta.env.VITE_API_URL;
    if (env)
        return env;
    const host = window.location.hostname;
    if (host.endsWith('booka.co.za'))
        return 'https://api.booka.co.za/admin';
    return `${window.location.protocol}//${window.location.hostname}:8000/admin`;
};
const API_URL = inferApiUrl();
export const authProvider = {
    login: async (params) => {
        const email = (params?.email || params?.username || '').toString();
        const password = (params?.password || '').toString();
        if (!email || !password)
            throw new Error('Email and password required');
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok)
            throw new Error('Invalid credentials');
        const data = (await res.json());
        localStorage.setItem('booka_admin_token', data.token);
        localStorage.setItem('booka_admin_user', JSON.stringify(data.user));
        return;
    },
    logout: async () => {
        const token = localStorage.getItem('booka_admin_token');
        try {
            if (token) {
                await fetch(`${API_URL}/auth/logout`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                });
            }
        }
        catch { }
        localStorage.removeItem('booka_admin_token');
        localStorage.removeItem('booka_admin_user');
        return;
    },
    checkError: async (error) => {
        const status = error?.status;
        if (status === 401 || status === 403) {
            localStorage.removeItem('booka_admin_token');
            return Promise.reject();
        }
        return Promise.resolve();
    },
    checkAuth: async () => {
        const token = localStorage.getItem('booka_admin_token');
        if (!token)
            return Promise.reject();
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
        if (!userRaw)
            return Promise.resolve('support');
        const role = JSON.parse(userRaw)?.role ?? 'support';
        return Promise.resolve(role);
    },
    getIdentity: async () => {
        const userRaw = localStorage.getItem('booka_admin_user');
        if (!userRaw) {
            // Provide a minimal identity to satisfy RA types even before login
            return { id: 'anonymous', fullName: 'Admin', avatar: undefined };
        }
        const user = JSON.parse(userRaw);
        return { id: user.id, fullName: user.email, role: user.role };
    },
};

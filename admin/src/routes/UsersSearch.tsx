import * as React from 'react';
import { Card, CardContent, Grid, TextField as MuiTextField, MenuItem } from '@mui/material';
import { Title, useNotify, useDataProvider } from 'react-admin';
import ConfirmButton from '../components/ConfirmButton';

export default function UsersSearch() {
  const [email, setEmail] = React.useState('');
  const [result, setResult] = React.useState<any>(null);
  const dp = useDataProvider() as any;
  const notify = useNotify();
  const [role, setRole] = React.useState('admin');

  const onSearch = async () => {
    if (!email) return;
    try {
      const base = inferApiUrl();
      const token = localStorage.getItem('booka_admin_token');
      const r = await fetch(`${base}/users/search?email=${encodeURIComponent(email)}` , {
        headers: {
          'Accept': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });
      if (!r.ok) throw new Error(`Search failed (${r.status})`);
      const j = await r.json();
      setResult(j);
    } catch (e: any) {
      notify(e?.message || 'Search failed', { type: 'warning' });
    }
  };

  const purge = async (confirmEmail?: string) => {
    if (!result?.user?.id) return;
    try {
      const base = inferApiUrl();
      const token = localStorage.getItem('booka_admin_token');
      const r = await fetch(`${base}/users/${result.user.id}/purge`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ confirm: confirmEmail || '', force: true }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.detail || `Purge failed (${r.status})`);
      }
      notify('app.user.purged', { type: 'info' });
      setResult(null);
    } catch (e: any) {
      const detail = e?.message || 'Purge failed';
      notify(detail, { type: 'warning' });
    }
  };

  const makeAdmin = async () => {
    if (!result?.user?.email) return;
    try {
      const base = inferApiUrl();
      const token = localStorage.getItem('booka_admin_token');
      const r = await fetch(`${base}/admin_users`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ email: result.user.email, role }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.detail || `Grant failed (${r.status})`);
      }
      notify('app.admin.granted', { type: 'info' });
    } catch (e: any) {
      const detail = e?.message || 'Grant failed';
      notify(detail, { type: 'warning' });
    }
  };

  function inferApiUrl(): string {
    const env = (import.meta as any).env?.VITE_API_URL as string | undefined;
    if (env) return env;
    const host = window.location.hostname;
    if (host.endsWith('booka.co.za')) return 'https://api.booka.co.za/admin';
    return `${window.location.protocol}//${window.location.hostname}:8000/admin`;
  }

  return (
    <>
      <Title title="Users" />
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <h3 style={{ marginTop: 0 }}>Search by email</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <MuiTextField fullWidth size="small" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <ConfirmButton label="Search" onConfirm={onSearch} confirmTitle="Confirm search" />
              </div>
              {result && (
                <div style={{ marginTop: 16, lineHeight: 1.7 }}>
                  {result.exists ? (
                    <>
                      <div><strong>ID:</strong> {result.user.id}</div>
                      <div><strong>Email:</strong> {result.user.email}</div>
                      <div><strong>Type:</strong> {result.user.user_type}</div>
                      <div><strong>Active:</strong> {String(result.user.is_active)}</div>
                      <div><strong>Verified:</strong> {String(result.user.is_verified)}</div>
                      <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                        <ConfirmButton
                          label="Purge user"
                          color="error"
                          confirmTitle="Type email to confirm purge"
                          confirmPlaceholder="email@example.com"
                          confirmTextRequired={result.user.email}
                          onConfirm={purge}
                        />
                        <MuiTextField select size="small" label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                          {['support','payments','trust','content','admin','superadmin'].map(r => (
                            <MenuItem key={r} value={r}>{r}</MenuItem>
                          ))}
                        </MuiTextField>
                        <ConfirmButton label="Make admin" onConfirm={makeAdmin} confirmTitle="Confirm grant" />
                      </div>
                    </>
                  ) : (
                    <div>User not found</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}

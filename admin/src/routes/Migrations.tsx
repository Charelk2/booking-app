import * as React from 'react';
import { Title } from 'react-admin';
import { Box, Button, Card, CardContent, CardHeader, Grid, Typography, Alert, Stack } from '@mui/material';

// Infer admin API base (same heuristic as authProvider/dataProvider)
const inferAdminApiUrl = () => {
  const env = (import.meta as any).env?.VITE_API_URL as string | undefined;
  if (env) return env;
  const host = window.location.hostname;
  if (host.endsWith('booka.co.za')) return 'https://api.booka.co.za/admin';
  return `${window.location.protocol}//${window.location.hostname}:8000/admin`;
};

const ADMIN_API_URL = inferAdminApiUrl();
const ROOT_API_URL = ADMIN_API_URL.replace(/\/?admin\/?$/, '');

type MigrateResult = Record<string, number> & { status?: string; error?: string };

export default function Migrations() {
  const [busy, setBusy] = React.useState(false);
  const [profileRes, setProfileRes] = React.useState<MigrateResult | null>(null);
  const [serviceRes, setServiceRes] = React.useState<MigrateResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('booka_admin_token') : null;
  const headers: HeadersInit = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };

  const runProfiles = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${ROOT_API_URL}/api/v1/ops/migrate-profile-images-to-files`, { method: 'POST', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MigrateResult;
      setProfileRes(json);
    } catch (e: any) {
      setError(`Profile images migration failed: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runServices = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${ROOT_API_URL}/api/v1/ops/migrate-service-media-to-files`, { method: 'POST', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MigrateResult;
      setServiceRes(json);
    } catch (e: any) {
      setError(`Service media migration failed: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setProfileRes(null); setServiceRes(null); setError(null); };

  return (
    <Box p={2}>
      <Title title="Migrations" />
      <Typography variant="h6" gutterBottom>
        Image Migrations
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Convert legacy data: URLs to static file URLs so Next.js can optimize images. Safe to run multiple times.
      </Typography>
      <Stack spacing={2} sx={{ my: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardHeader title="Profile Images" subheader="Users & service providers (profile pics, covers, portfolio array)" />
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="contained" onClick={runProfiles} disabled={busy}>
                  Run Migration
                </Button>
                <Button onClick={reset} disabled={busy}>Clear</Button>
              </Stack>
              {profileRes && (
                <Box mt={2}>
                  <Typography variant="subtitle2">Result</Typography>
                  <pre style={{ background: '#f6f8fa', padding: 12, borderRadius: 8, overflowX: 'auto' }}>
                    {JSON.stringify(profileRes, null, 2)}
                  </pre>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardHeader title="Service Media" subheader="Services.media_url data: → /static/portfolio_images" />
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="contained" onClick={runServices} disabled={busy}>
                  Run Migration
                </Button>
                <Button onClick={reset} disabled={busy}>Clear</Button>
              </Stack>
              {serviceRes && (
                <Box mt={2}>
                  <Typography variant="subtitle2">Result</Typography>
                  <pre style={{ background: '#f6f8fa', padding: 12, borderRadius: 8, overflowX: 'auto' }}>
                    {JSON.stringify(serviceRes, null, 2)}
                  </pre>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Box mt={3}>
        <Alert severity="info">
          After running, refresh a service provider page and check Network for <code>/_next/image</code> requests.
        </Alert>
      </Box>
    </Box>
  );
}


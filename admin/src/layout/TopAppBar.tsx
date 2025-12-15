import * as React from 'react';
import { AppBar as RAAppBar, AppBarProps, TitlePortal, useDataProvider, useRedirect } from 'react-admin';
import { Toolbar, TextField, InputAdornment, IconButton, Badge, Select, MenuItem, Tooltip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import NearMeIcon from '@mui/icons-material/NearMe';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { inferAdminApiUrl } from '../env';

const ADMIN_API_URL = inferAdminApiUrl();

export default function TopAppBar(props: AppBarProps) {
  const dp = useDataProvider();
  const redirect = useRedirect();
  const [q, setQ] = React.useState('');
  const [counts, setCounts] = React.useState({ pending: 0, payouts: 0, disputes: 0 });
  const [type, setType] = React.useState<'providers'|'listings'|'users'|'conversations'>('providers');

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        // Prefer a dedicated stats endpoint (single request); fall back to getList totals.
        try {
          const { json } = await (dp as any).httpClient(`${ADMIN_API_URL}/stats`, { method: 'GET' });
          const next = {
            pending: Number(json?.pending_listings ?? 0),
            payouts: Number(json?.queued_payouts ?? 0),
            disputes: Number(json?.open_disputes ?? 0),
          };
          if (!cancelled) setCounts(next);
          return;
        } catch {
          // ignore; fallback below
        }

        const [listings, payouts, disputes] = await Promise.all([
          dp.getList('listings', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'pending_review' } }) as any,
          dp.getList('payouts', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'queued' } }) as any,
          dp.getList('disputes', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'open' } }) as any,
        ]);
        if (!cancelled) setCounts({ pending: Number(listings?.total ?? 0), payouts: Number(payouts?.total ?? 0), disputes: Number(disputes?.total ?? 0) });
      } catch {}
    };

    void run();
    const interval = window.setInterval(run, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [dp]);

  const doSearch = () => {
    if (!q) return;
    if (type === 'providers') {
      redirect(`/providers?filter=${encodeURIComponent(JSON.stringify({ q }))}`);
    } else if (type === 'listings') {
      redirect(`/listings?filter=${encodeURIComponent(JSON.stringify({ q }))}`);
    } else if (type === 'users') {
      redirect(`/users?email=${encodeURIComponent(q)}`);
    } else if (type === 'conversations') {
      redirect(`/conversations?filter=${encodeURIComponent(JSON.stringify({ q }))}`);
    }
  };

  return (
    <RAAppBar {...props}>
      <Toolbar variant="dense" sx={{ gap: 2, display: 'flex', alignItems: 'center' }}>
        <TitlePortal />
        <TextField
          size="small"
          placeholder="Search providers, listings, conversations…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ minWidth: 240, flex: 1, maxWidth: 520, bgcolor: '#fff', borderRadius: 1, alignSelf: 'center', input: { color: '#000' } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon /></InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={doSearch}><SearchIcon /></IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Select size="small" value={type} onChange={(e) => setType(e.target.value as any)} sx={{ minWidth: 140, bgcolor: '#fff', borderRadius: 1, alignSelf: 'center' }}>
          <MenuItem value="providers">Providers</MenuItem>
          <MenuItem value="listings">Listings</MenuItem>
          <MenuItem value="users">Users</MenuItem>
          <MenuItem value="conversations">Conversations</MenuItem>
        </Select>
        <Tooltip title="Pending listings">
          <IconButton color="inherit" onClick={() => redirect('/listings')} aria-label="Pending listings">
            <Badge badgeContent={counts.pending} color="error"><PlaylistAddCheckIcon /></Badge>
          </IconButton>
        </Tooltip>
        <Tooltip title="Queued payouts">
          <IconButton color="inherit" onClick={() => redirect('/payouts')} aria-label="Queued payouts">
            <Badge badgeContent={counts.payouts} color="error"><NearMeIcon /></Badge>
          </IconButton>
        </Tooltip>
        <Tooltip title="Open disputes">
          <IconButton color="inherit" onClick={() => redirect('/disputes')} aria-label="Open disputes">
            <Badge badgeContent={counts.disputes} color="error"><SupportAgentIcon /></Badge>
          </IconButton>
        </Tooltip>
        {/** Duplicate manual refresh removed; React-Admin shows its own refresh in the LoadingIndicator area. */}
      </Toolbar>
      {/* Spacer to push built-in refresh + user menu all the way to the right */}
      <span aria-hidden style={{ flex: 1 }} />
    </RAAppBar>
  );
}

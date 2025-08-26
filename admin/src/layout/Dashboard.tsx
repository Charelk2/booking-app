import * as React from 'react';
import { Card, CardContent, Grid, Typography, TextField, InputAdornment, IconButton, Divider, useMediaQuery } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import NearMeIcon from '@mui/icons-material/NearMe';
import { useDataProvider, Title, useRedirect, Button, SimpleList } from 'react-admin';

export default function Dashboard() {
  const dp = useDataProvider();
  const redirect = useRedirect();
  const isSmall = useMediaQuery('(max-width:900px)');

  const [kpi, setKpi] = React.useState({ bookingsToday: 0, payoutsQueued: 0, disputesOpen: 0, listingsPending: 0 });
  const [pendingListings, setPendingListings] = React.useState<any[]>([]);
  const [recentConvos, setRecentConvos] = React.useState<any[]>([]);
  const [emailQuery, setEmailQuery] = React.useState('');
  const [globalQuery, setGlobalQuery] = React.useState('');

  React.useEffect(() => {
    (async () => {
      try {
        const [bookings, payouts, disputes, listings, pendingList, convos] = await Promise.all([
          dp.getList('bookings', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { today: true } }) as any,
          dp.getList('payouts', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'queued' } }) as any,
          dp.getList('disputes', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'open' } }) as any,
          dp.getList('listings', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { status: 'pending_review' } }) as any,
          dp.getList('listings', { pagination: { page: 1, perPage: 5 }, sort: { field: 'updated_at', order: 'DESC' }, filter: { status: 'pending_review' } }) as any,
          dp.getList('conversations', { pagination: { page: 1, perPage: 5 }, sort: { field: 'last_at', order: 'DESC' }, filter: {} }) as any,
        ]);
        setKpi({
          bookingsToday: bookings.total ?? 0,
          payoutsQueued: payouts.total ?? 0,
          disputesOpen: disputes.total ?? 0,
          listingsPending: listings.total ?? 0,
        });
        setPendingListings(pendingList.data ?? []);
        setRecentConvos(convos.data ?? []);
      } catch {}
    })();
  }, [dp]);

  const CardKPI = ({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) => (
    <Card sx={{ height: 130 }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {icon}{label}
        </Typography>
        <Typography variant="h4" sx={{ mt: 1 }}>{value.toLocaleString('en-ZA')}</Typography>
      </CardContent>
    </Card>
  );

  const QuickAction = ({ label, to, icon }: { label: string; to: string; icon: React.ReactNode }) => (
    <Card sx={{ cursor: 'pointer' }} onClick={() => redirect(to)}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {icon}
          <Typography>{label}</Typography>
        </div>
        <ArrowForwardIcon />
      </CardContent>
    </Card>
  );

  const doEmailSearch = () => {
    if (!emailQuery) return;
    redirect(`/users?email=${encodeURIComponent(emailQuery)}`);
  };
  const doGlobalSearch = () => {
    if (!globalQuery) return;
    redirect(`/providers?filter=${encodeURIComponent(JSON.stringify({ q: globalQuery }))}`);
  };

  return (
    <>
      <Title title="Dashboard" />
      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Global search</Typography>
              <TextField
                fullWidth size="small" placeholder="Search providers, listings, conversations…"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start"><SearchIcon /></InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={doGlobalSearch}><ArrowForwardIcon /></IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" color="text.secondary">Quick user lookup</Typography>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={8} md={9}>
                  <TextField fullWidth size="small" placeholder="email@example.com" value={emailQuery} onChange={(e) => setEmailQuery(e.target.value)} />
                </Grid>
                <Grid item xs={4} md={3}>
                  <Button label="Open" onClick={doEmailSearch} />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Grid container spacing={2}>
            <Grid item xs={6}><CardKPI label="Bookings (Today)" value={kpi.bookingsToday} icon={<NearMeIcon fontSize="small" />} /></Grid>
            <Grid item xs={6}><CardKPI label="Pending Listings" value={kpi.listingsPending} icon={<PlaylistAddCheckIcon fontSize="small" />} /></Grid>
            <Grid item xs={6}><CardKPI label="Payouts Queued" value={kpi.payoutsQueued} icon={<NearMeIcon fontSize="small" />} /></Grid>
            <Grid item xs={6}><CardKPI label="Disputes Open" value={kpi.disputesOpen} icon={<SupportAgentIcon fontSize="small" />} /></Grid>
          </Grid>
        </Grid>

        <Grid item xs={12}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}><QuickAction label="Providers" to="/providers" icon={<PeopleAltIcon />} /></Grid>
            <Grid item xs={12} md={3}><QuickAction label="Support Inbox" to="/conversations" icon={<SupportAgentIcon />} /></Grid>
            <Grid item xs={12} md={3}><QuickAction label="Admin Users" to="/admin_users" icon={<AdminPanelSettingsIcon />} /></Grid>
            <Grid item xs={12} md={3}><QuickAction label="Create Payout Batch" to="/payouts/run" icon={<NearMeIcon />} /></Grid>
          </Grid>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Pending Moderation</Typography>
              {isSmall ? (
                <SimpleList
                  primaryText={(r: any) => r.title}
                  secondaryText={(r: any) => `${r.category ?? ''} · ${r.price ?? ''}`}
                  linkType={(r: any) => ({ pathname: `/listings/${r.id}/show` }) as any}
                  total={pendingListings.length}
                  data={pendingListings as any}
                />
              ) : (
                <Grid container spacing={1}>
                  {pendingListings.map((l: any) => (
                    <Grid item xs={12} key={l.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{l.title}</div>
                          <div style={{ color: '#666', fontSize: 12 }}>{l.category || '—'} · {l.price ?? ''}</div>
                        </div>
                        <Button label="Open" onClick={() => redirect(`/listings/${l.id}/show`)} />
                      </div>
                      <Divider sx={{ my: 1 }} />
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Recent Conversations</Typography>
              {isSmall ? (
                <SimpleList
                  primaryText={(r: any) => r.provider_email}
                  secondaryText={(r: any) => r.last_message}
                  tertiaryText={(r: any) => r.last_at}
                  linkType={(r: any) => ({ pathname: `/conversations/${r.id}/show` }) as any}
                  data={recentConvos as any}
                />
              ) : (
                <Grid container spacing={1}>
                  {recentConvos.map((t: any) => (
                    <Grid item xs={12} key={t.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{t.provider_email}</div>
                          <div style={{ color: '#666', fontSize: 12 }}>{t.last_message || '—'}</div>
                        </div>
                        <Button label="Open" onClick={() => redirect(`/conversations/${t.id}/show`)} />
                      </div>
                      <Divider sx={{ my: 1 }} />
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}

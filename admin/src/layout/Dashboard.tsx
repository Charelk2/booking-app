import * as React from 'react';
import { Card, CardContent, Grid, Typography } from '@mui/material';
import { useDataProvider, Title } from 'react-admin';

// Simple KPI cards pulling lightweight counts
export default function Dashboard() {
  const dataProvider = useDataProvider();
  const [kpi, setKpi] = React.useState<{bookingsToday:number; payoutsQueued:number; disputesOpen:number; listingsPending:number}>({
    bookingsToday: 0, payoutsQueued: 0, disputesOpen: 0, listingsPending: 0
  });

  React.useEffect(() => {
    (async () => {
      try {
        const [bookings, payouts, disputes, listings] = await Promise.all([
          dataProvider.getList('bookings', { pagination:{page:1, perPage:1}, sort:{field:'id', order:'ASC'}, filter:{ today: true } }) as any,
          dataProvider.getList('payouts',  { pagination:{page:1, perPage:1}, sort:{field:'id', order:'ASC'}, filter:{ status: 'queued' } }) as any,
          dataProvider.getList('disputes', { pagination:{page:1, perPage:1}, sort:{field:'id', order:'ASC'}, filter:{ status: 'open' } }) as any,
          dataProvider.getList('listings', { pagination:{page:1, perPage:1}, sort:{field:'id', order:'ASC'}, filter:{ status: 'pending_review' } }) as any,
        ]);
        setKpi({
          bookingsToday: bookings.total ?? 0,
          payoutsQueued: payouts.total ?? 0,
          disputesOpen: disputes.total ?? 0,
          listingsPending: listings.total ?? 0,
        });
      } catch {}
    })();
  }, [dataProvider]);

  const CardKPI = ({label, value}:{label:string; value:number}) => (
    <Card sx={{ height: 120 }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary">{label}</Typography>
        <Typography variant="h4" sx={{ mt: 1 }}>{value.toLocaleString('en-ZA')}</Typography>
      </CardContent>
    </Card>
  );

  return (
    <>
      <Title title="Dashboard" />
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}><CardKPI label="Bookings (Today)" value={kpi.bookingsToday} /></Grid>
        <Grid item xs={12} md={3}><CardKPI label="Payouts Queued" value={kpi.payoutsQueued} /></Grid>
        <Grid item xs={12} md={3}><CardKPI label="Disputes Open" value={kpi.disputesOpen} /></Grid>
        <Grid item xs={12} md={3}><CardKPI label="Listings Pending Review" value={kpi.listingsPending} /></Grid>
      </Grid>
    </>
  );
}


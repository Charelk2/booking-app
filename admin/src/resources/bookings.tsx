import * as React from 'react';
import { List, Datagrid, TextField, DateField, TextInput, SelectInput, Show, SimpleShowLayout, useNotify, useRefresh, Button, useRecordContext, usePermissions } from 'react-admin';
import PaymentsIcon from '@mui/icons-material/Payments';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { ExtendedDataProvider } from '../dataProvider';
import MoneyCell from '../components/MoneyCell';
import TimeCell from '../components/TimeCell';
import { Card, CardContent, Stack, Typography, Divider } from '@mui/material';

const bookingFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn size="small" margin="dense" variant="outlined" />,
  <SelectInput key="status" source="status" choices={[
    { id:'requested', name:'Requested' },
    { id:'quoted', name:'Quoted' },
    { id:'paid_held', name:'Paid (Held)' },
    { id:'completed', name:'Completed' },
    { id:'disputed', name:'Disputed' },
    { id:'refunded', name:'Refunded' },
    { id:'cancelled', name:'Cancelled' },
  ]} alwaysOn size="small" margin="dense" variant="outlined" />
];

const Actions = () => {
  const rec = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const { permissions } = usePermissions();
  const canComplete = ['payments','trust','admin','superadmin'].includes(permissions as string);
  const canRefund = ['payments','admin','superadmin'].includes(permissions as string);
  const markComplete = async () => {
    try {
      await (window as any).raDataProvider.markCompleted(rec.id);
      notify('Booking marked completed'); refresh();
    } catch (e:any) { notify(e.message || 'Failed', { type:'warning' }); }
  };
  const refund = async () => {
    const amount = prompt('Refund amount in ZAR (e.g., 250.00)');
    if (!amount) return;
    const cents = Math.round(parseFloat(amount) * 100);
    try {
      await (window as any).raDataProvider.refundBooking(rec.id, cents);
      notify(`Refunded R${amount}`); refresh();
    } catch (e:any) { notify(e.message || 'Refund failed', { type:'warning' }); }
  };
  return (
    <>
      {canComplete && <Button label="Mark Completed" startIcon={<CheckCircleIcon/>} onClick={markComplete}/>}
      {canRefund && <Button label="Refund" startIcon={<PaymentsIcon/>} onClick={refund}/>}
    </>
  );
};

export const BookingList = () => (
  <List filters={bookingFilters} sort={{ field: 'created_at', order: 'DESC' }} perPage={25}>
    <Datagrid rowClick="show">
      <TextField source="id" />
      <TextField source="status" />
      <DateField source="event_date" showTime />
      <TextField source="location" />
      <TextField source="client_id" label="Client" />
      <TextField source="provider_id" label="Provider" />
      <MoneyCell source="total_amount" />
      <TimeCell source="created_at" />
    </Datagrid>
  </List>
);

export const BookingShow = () => (
  <Show actions={<Actions/>}>
    <SimpleShowLayout>
      <TextField source="id" label="Booking ID" />
      <TextField source="simple_id" label="Simple Booking ID" />
      <TextField source="status" />
      <TextField source="client_id" />
      <TextField source="provider_id" />
      <TextField source="listing_id" />
      <DateField source="event_date" showTime />
      <TextField source="location" />
      <MoneyCell source="total_amount" />
      <TimeCell source="created_at" />
      <PayoutWorksheet />
    </SimpleShowLayout>
  </Show>
);

export const attachDPBookings = (dp: ExtendedDataProvider) => { (window as any).raDataProvider = dp; };

function PayoutWorksheet() {
  const rec = useRecordContext<any>();
  const dp: any = (window as any).raDataProvider;
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let mounted = true;
    async function run() {
      try {
        setLoading(true);
        const simpleId = rec?.simple_id;
        if (!simpleId) { setRows([]); return; }
        const res = await (dp as any).getList('payouts', {
          pagination: { page: 1, perPage: 100 },
          sort: { field: 'id', order: 'ASC' },
          filter: { booking_id: simpleId },
        });
        if (mounted) setRows(res?.data || []);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    run();
    return () => { mounted = false; };
  }, [rec?.id]);

  const meta = React.useMemo(() => {
    // Prefer meta from final50 or first50
    const f = rows.find((r) => String(r.type).toLowerCase() === 'final50');
    const s = rows.find((r) => String(r.type).toLowerCase() === 'first50');
    return (f?.meta || s?.meta || {}) as any;
  }, [rows]);

  const Z = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
  const fmt = (v: any) => Z.format(Number(v || 0));

  if (loading) return null;
  if (!rows.length) return null;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h6">Payout Worksheet</Typography>
          <Typography variant="body2" color="text.secondary">
            Computed at payment time. Commission base is provider subtotal (services + travel + sound). Client service fee (3% + VAT) is charged to the client and not paid to the provider.
          </Typography>
          <Divider />
          <Stack direction="row" justifyContent="space-between"><span>Provider Subtotal (PS)</span><strong>{fmt(meta?.provider_subtotal)}</strong></Stack>
          <Stack direction="row" justifyContent="space-between"><span>Client Service Fee (3% of PS)</span><span>{fmt(meta?.client_fee)}</span></Stack>
          <Stack direction="row" justifyContent="space-between"><span>VAT on Client Fee (15%)</span><span>{fmt(meta?.client_fee_vat)}</span></Stack>
          <Divider />
          <Stack direction="row" justifyContent="space-between"><span>Platform Commission (7.5% of PS)</span><span>- {fmt(meta?.commission)}</span></Stack>
          <Stack direction="row" justifyContent="space-between"><span>VAT on Commission (15%)</span><span>- {fmt(meta?.vat_on_commission)}</span></Stack>
          <Stack direction="row" justifyContent="space-between"><span>Provider Net Total (estimate)</span><strong>{fmt(meta?.provider_net_total_estimate)}</strong></Stack>
          <Divider />
          <Typography variant="subtitle2">Stages</Typography>
          {rows.map((r) => (
            <Stack key={r.id} direction="row" justifyContent="space-between">
              <span>{String(r.type).toUpperCase()} — Scheduled {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '—'}</span>
              <strong>{fmt(r.amount)}</strong>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

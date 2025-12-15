import * as React from 'react';
import { List, Datagrid, TextField, DateField, TextInput, SelectInput, Show, SimpleShowLayout, useNotify, useRefresh, Button, useRecordContext, usePermissions, FunctionField, useDataProvider } from 'react-admin';
import PaymentsIcon from '@mui/icons-material/Payments';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MoneyCell from '../components/MoneyCell';
import TimeCell from '../components/TimeCell';
import { Card, CardContent, Stack, Typography, Divider, Tooltip, IconButton, Chip } from '@mui/material';
import StatusBadge from '../components/StatusBadge';

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
  const dp = useDataProvider() as any;
  const notify = useNotify();
  const refresh = useRefresh();
  const { permissions } = usePermissions();
  const canComplete = ['payments','trust','admin','superadmin'].includes(permissions as string);
  const canRefund = ['payments','admin','superadmin'].includes(permissions as string);
  const markComplete = async () => {
    try {
      await dp.markCompleted(rec.id);
      notify('Booking marked completed'); refresh();
    } catch (e:any) { notify(e.message || 'Failed', { type:'warning' }); }
  };
  const refund = async () => {
    const amount = prompt('Refund amount in ZAR (e.g., 250.00)');
    if (!amount) return;
    const cents = Math.round(parseFloat(amount) * 100);
    try {
      await dp.refundBooking(rec.id, cents);
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

const CopyButton: React.FC<{ value?: string|null; tooltip: string }> = ({ value, tooltip }) => {
  const notify = useNotify();
  if (!value) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      notify('Copied');
    } catch {
      notify('Cannot copy', { type:'warning' });
    }
  };
  return (
    <Tooltip title={tooltip}>
      <IconButton size="small" onClick={copy}>
        <ContentCopyIcon fontSize="inherit" />
      </IconButton>
    </Tooltip>
  );
};

const BookingIdField: React.FC<{ kind: 'booking' | 'simple' }> = ({ kind }) => {
  const rec = useRecordContext<any>();
  const value = kind === 'booking' ? rec?.id : rec?.simple_id;
  const label = kind === 'booking' ? 'Event record (bookings.id)' : 'Finance snapshot (bookings_simple.id)';
  if (!value) return <span>—</span>;
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Tooltip title={label}>
        <Typography component="span" fontSize={13} fontWeight={700} fontFamily="monospace">
          {value}
        </Typography>
      </Tooltip>
      <CopyButton value={value} tooltip={`Copy ${kind === 'booking' ? 'Booking' : 'Simple Booking'} ID`} />
    </Stack>
  );
};

const ContactField: React.FC<{ which: 'client' | 'provider' }> = ({ which }) => {
  const rec = useRecordContext<any>();
  const name = which === 'client' ? rec?.client_name : (rec?.provider_name || rec?.artist_name);
  const email = which === 'client' ? rec?.client_email : (rec?.provider_email || rec?.artist_email);
  const phone = which === 'client' ? rec?.client_phone : (rec?.provider_phone || rec?.artist_phone);
  const id = which === 'client' ? rec?.client_id : (rec?.provider_id || rec?.artist_id);
  if (!name && !email && !phone) return <span>—</span>;
  return (
    <Stack spacing={0} alignItems="flex-start">
      <Typography variant="body2" fontWeight={600}>{name || '—'}</Typography>
      <Typography variant="caption" color="text.secondary">{email || '—'}</Typography>
      <Typography variant="caption" color="text.secondary">{phone || '—'}</Typography>
      {id ? <Typography variant="caption" color="text.secondary">ID: {id}</Typography> : null}
    </Stack>
  );
};

const BankingSummaryField: React.FC = () => {
  const rec = useRecordContext<any>();
  const missing = !!rec?.banking_missing;
  const summary = rec?.banking_summary || 'Missing';
  const title = missing
    ? 'Banking details missing. Add bank name and account in provider profile.'
    : [
        rec?.bank_name ? `Bank: ${rec.bank_name}` : null,
        rec?.bank_account_last4 ? `Account: …${rec.bank_account_last4}` : null,
        rec?.bank_account_name ? `Name: ${rec.bank_account_name}` : null,
        rec?.bank_branch_code ? `Branch: ${rec.bank_branch_code}` : null,
      ].filter(Boolean).join(' • ');
  return (
    <Tooltip title={title || ''}>
      <Chip
        label={summary}
        color={missing ? 'error' : 'default'}
        variant={missing ? 'outlined' : 'filled'}
        size="small"
      />
    </Tooltip>
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
      <FunctionField label="Booking ID" render={() => <BookingIdField kind="booking" />} />
      <FunctionField label="Simple Booking ID" render={() => <BookingIdField kind="simple" />} />
      <TextField source="status" />
      <FunctionField label="Client" render={() => <ContactField which="client" />} />
      <FunctionField label="Artist / Provider" render={() => <ContactField which="provider" />} />
      <FunctionField label="Banking" render={() => <BankingSummaryField />} />
      <TextField source="listing_id" />
      <DateField source="event_date" showTime />
      <TextField source="location" />
      <MoneyCell source="total_amount" />
      <TimeCell source="created_at" />
      <PayoutWorksheet />
    </SimpleShowLayout>
  </Show>
);

function PayoutWorksheet() {
  const rec = useRecordContext<any>();
  const dp = useDataProvider();
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
            <Stack key={r.id} direction="row" justifyContent="space-between" alignItems="center">
              <Stack spacing={0.25} alignItems="flex-start">
                <Typography variant="body2" fontWeight={600}>{String(r.type).toUpperCase()} • Payout {r.id}</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <StatusBadge value={r.status} />
                  <Typography variant="caption" color="text.secondary">
                    {r.scheduled_at ? `Scheduled ${new Date(r.scheduled_at).toLocaleString()}` : 'Scheduled —'}
                    {r.paid_at ? ` • Paid ${new Date(r.paid_at).toLocaleString()}` : ''}
                  </Typography>
                </Stack>
              </Stack>
              <Typography component="span" fontWeight={700}>{fmt(r.amount)}</Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

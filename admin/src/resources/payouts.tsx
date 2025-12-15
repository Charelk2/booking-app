import * as React from 'react';
import { List, Datagrid, TextField, SelectInput, TextInput, useRecordContext, useNotify, useRefresh, FunctionField, useDataProvider } from 'react-admin';
import MoneyCell from '../components/MoneyCell';
import TimeCell from '../components/TimeCell';
import StatusBadge from '../components/StatusBadge';
import { inferAdminApiUrl, inferRootApiUrl } from '../env';
import { Button, Stack, Tooltip, IconButton, Typography, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';

function resolveAdminApiUrl(dp: any): string {
  const url = (dp && typeof dp.API_URL === 'string' && dp.API_URL) ? dp.API_URL : inferAdminApiUrl();
  return url.replace(/\/$/, '');
}

const payoutFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn size="small" margin="dense" variant="outlined" />,
  <SelectInput key="status" source="status" size="small" margin="dense" variant="outlined" choices={[
    { id:'queued', name:'Queued' },
    { id:'paid', name:'Paid' },
    { id:'failed', name:'Failed' },
    { id:'blocked', name:'Blocked' },
  ]} alwaysOn />
];

const Actions = () => {
  const rec = useRecordContext() as any;
  const dp: any = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const markPaid = async () => {
    const method = prompt('Payout method (e.g., EFT)') || 'EFT';
    const reference = prompt('Reference (required)');
    if (!reference) { notify('Reference required', { type:'warning' }); return; }
    try {
      const adminApiUrl = resolveAdminApiUrl(dp);
      await dp.httpClient(`${adminApiUrl}/payouts/${rec.id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ method, reference }),
      });
      notify('Payout marked paid'); refresh();
    } catch (e:any) { notify(e.message || 'Failed', { type:'warning' }); }
  };
  const viewPdf = async () => {
    try {
      const adminApiUrl = resolveAdminApiUrl(dp);
      const { json } = await dp.httpClient(`${adminApiUrl}/payouts/${rec.id}/pdf-url`, { method: 'GET' });
      const url = (json && json.url) ? json.url : null;
      if (url) {
        window.open(url, '_blank');
        return;
      }
      throw new Error('No URL returned');
    } catch (e:any) {
      // Fallback to direct API (may 403 without headers)
      try {
        const adminApiUrl = resolveAdminApiUrl(dp);
        const rootApiUrl = inferRootApiUrl(adminApiUrl);
        const url = `${rootApiUrl}/api/v1/payouts/${rec.id}/pdf`;
        window.open(url, '_blank');
      } catch {}
    }
  };
  return (
    <Stack direction="row" spacing={1}>
      <Button size="small" variant="outlined" onClick={viewPdf}>View PDF</Button>
      <Button size="small" variant="contained" onClick={markPaid}>Mark Paid</Button>
    </Stack>
  );
};

const CopyButton: React.FC<{ value?: string|null; tooltip: string }> = ({ value, tooltip }) => {
  const notify = useNotify();
  if (!value) return null;
  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(String(value));
      notify('Copied');
    } catch {
      notify('Cannot copy', { type: 'warning' });
    }
  };
  return (
    <Tooltip title={tooltip}>
      <IconButton size="small" onClick={onCopy} aria-label="Copy">
        <ContentCopyIcon style={{ fontSize: 14 }} />
      </IconButton>
    </Tooltip>
  );
};

const BookingLinkField: React.FC = () => {
  const rec = useRecordContext<any>();
  const id = rec?.booking_real_id;
  if (!id) return <span>—</span>;
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Tooltip title="Event record (bookings.id)">
        <RouterLink to={`/bookings/${id}/show`}>
          <Typography component="span" fontSize={13} fontWeight={600}>{id}</Typography>
        </RouterLink>
      </Tooltip>
      <CopyButton value={id} tooltip="Copy Booking ID" />
    </Stack>
  );
};

const SimpleBookingField: React.FC = () => {
  const rec = useRecordContext<any>();
  const id = rec?.booking_id;
  if (!id) return <span>—</span>;
  const filterLink = `/payouts?filter=${encodeURIComponent(JSON.stringify({ booking_id: id }))}`;
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Tooltip title="Finance snapshot (bookings_simple.id). Click to filter payouts for this booking.">
        <RouterLink to={filterLink}>
          <Typography component="span" fontSize={13} fontWeight={600}>{id}</Typography>
        </RouterLink>
      </Tooltip>
      <CopyButton value={id} tooltip="Copy Simple Booking ID" />
      <Tooltip title="Filter payouts to this Simple Booking ID">
        <IconButton size="small" component={RouterLink} to={filterLink}>
          <FilterAltOutlinedIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
};

const ContactCell: React.FC<{ which: 'client' | 'provider' }> = ({ which }) => {
  const rec = useRecordContext<any>();
  const name = which === 'client' ? rec?.client_name : (rec?.provider_name || rec?.artist_name);
  const email = which === 'client' ? rec?.client_email : (rec?.provider_email || rec?.artist_email);
  const phone = which === 'client' ? rec?.client_phone : (rec?.provider_phone || rec?.artist_phone);
  const id = which === 'client' ? rec?.client_id : rec?.provider_id || rec?.artist_id;
  const label = which === 'client' ? 'Client' : 'Artist/Provider';
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

const BankingCell: React.FC = () => {
  const rec = useRecordContext<any>();
  const missing = !!rec?.banking_missing;
  const summary = rec?.banking_summary;
  const bankName = rec?.bank_name;
  const last4 = rec?.bank_account_last4;
  const branch = rec?.bank_branch_code;
  const accountName = rec?.bank_account_name;
  const title = missing
    ? 'Banking details missing. Add bank name and account in the provider profile.'
    : [
        bankName ? `Bank: ${bankName}` : null,
        last4 ? `Account: …${last4}` : null,
        accountName ? `Name: ${accountName}` : null,
        branch ? `Branch: ${branch}` : null,
      ].filter(Boolean).join(' • ');
  return (
    <Tooltip title={title || ''}>
      <Chip
        label={summary || 'Missing'}
        color={missing ? 'error' : 'default'}
        variant={missing ? 'outlined' : 'filled'}
        size="small"
        sx={{ maxWidth: 180 }}
      />
    </Tooltip>
  );
};

export const PayoutList = () => (
  <List filters={payoutFilters} perPage={25} sort={{ field:'created_at', order:'DESC' }}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="id" label="Payout ID" />
      <FunctionField label="Booking ID" render={() => <BookingLinkField />} />
      <FunctionField label="Simple Booking ID" render={() => <SimpleBookingField />} />
      <FunctionField label="Client" render={() => <ContactCell which="client" />} />
      <FunctionField label="Artist / Provider" render={() => <ContactCell which="provider" />} />
      <FunctionField label="Banking" render={() => <BankingCell />} />
      <TextField source="type" label="Stage" />
      <MoneyCell source="amount" />
      <StatusBadge source="status" />
      <TimeCell source="scheduled_at" />
      <TimeCell source="paid_at" />
      <TextField source="method" />
      <TextField source="reference" />
      <Actions />
    </Datagrid>
  </List>
);

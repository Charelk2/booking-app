import * as React from 'react';
import { List, Datagrid, TextField, DateField, SelectInput, TextInput, useRecordContext, useNotify, useRefresh } from 'react-admin';
import MoneyCell from '../components/MoneyCell';
import TimeCell from '../components/TimeCell';
import StatusBadge from '../components/StatusBadge';
import { Button, Stack } from '@mui/material';

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
  const notify = useNotify();
  const refresh = useRefresh();
  const markPaid = async () => {
    const method = prompt('Payout method (e.g., EFT)') || 'EFT';
    const reference = prompt('Reference (required)');
    if (!reference) { notify('Reference required', { type:'warning' }); return; }
    try {
      const dp: any = (window as any).raDataProvider;
      await dp.httpClient(`${dp.API_URL}/payouts/${rec.id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ method, reference }),
      });
      notify('Payout marked paid'); refresh();
    } catch (e:any) { notify(e.message || 'Failed', { type:'warning' }); }
  };
  const viewPdf = async () => {
    const dp: any = (window as any).raDataProvider;
    try {
      const { json } = await dp.httpClient(`${dp.API_URL}/payouts/${rec.id}/pdf-url`, { method: 'GET' });
      const url = (json && json.url) ? json.url : null;
      if (url) {
        window.open(url, '_blank');
        return;
      }
      throw new Error('No URL returned');
    } catch (e:any) {
      // Fallback to direct API (may 403 without headers)
      try {
        const apiBase = dp.API_URL.replace(/\/admin$/, '');
        const url = `${apiBase}/api/v1/payouts/${rec.id}/pdf`;
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

export const PayoutList = () => (
  <List filters={payoutFilters} perPage={25} sort={{ field:'created_at', order:'DESC' }}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="id" label="Payout ID" />
      <TextField source="booking_real_id" label="Booking ID" />
      <TextField source="booking_id" label="Simple Booking ID" />
      <TextField source="provider_id" label="Provider ID" />
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

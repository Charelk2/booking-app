import * as React from 'react';
import {
  List, Datagrid, TextField, DateField, TextInput, SelectInput, NumberField,
  Show, SimpleShowLayout, useNotify, useRefresh, Button, useRecordContext, usePermissions
} from 'react-admin';
import PaymentsIcon from '@mui/icons-material/Payments';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { ExtendedDataProvider } from '../dataProvider';

const bookingFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn />,
  <SelectInput key="status" source="status" choices={[
    { id:'requested', name:'Requested' },
    { id:'quoted', name:'Quoted' },
    { id:'paid_held', name:'Paid (Held)' },
    { id:'completed', name:'Completed' },
    { id:'disputed', name:'Disputed' },
    { id:'refunded', name:'Refunded' },
    { id:'cancelled', name:'Cancelled' },
  ]} alwaysOn />
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
      <DateField source="event_date" />
      <TextField source="location" />
      <NumberField source="total_amount" options={{ style:'currency', currency:'ZAR' }} />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

export const BookingShow = () => (
  <Show actions={<Actions/>}>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="status" />
      <TextField source="client_id" />
      <TextField source="provider_id" />
      <TextField source="listing_id" />
      <DateField source="event_date" showTime />
      <TextField source="location" />
      <NumberField source="total_amount" options={{ style:'currency', currency:'ZAR' }} />
      <DateField source="created_at" showTime />
    </SimpleShowLayout>
  </Show>
);

export const attachDPBookings = (dp: ExtendedDataProvider) => { (window as any).raDataProvider = dp; };

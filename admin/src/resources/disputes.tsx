import * as React from 'react';
import { List, Datagrid, TextField, DateField, SelectInput, TextInput, Show, SimpleShowLayout, Button, useRecordContext, useNotify, useRefresh, usePermissions } from 'react-admin';
import { Stack } from '@mui/material';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import InfoIcon from '@mui/icons-material/Info';
import DoneAllIcon from '@mui/icons-material/DoneAll';

const disputeFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn />,
  <SelectInput key="status" source="status" choices={[
    { id:'open', name:'Open' },
    { id:'needs_info', name:'Needs Info' },
    { id:'resolved_refund', name:'Resolved (Refund)' },
    { id:'resolved_release', name:'Resolved (Release)' },
    { id:'denied', name:'Denied' },
  ]} alwaysOn />
];

export const DisputeList = () => (
  <List filters={disputeFilters} perPage={25} sort={{ field:'created_at', order:'DESC' }}>
    <Datagrid rowClick="show">
      <TextField source="id" />
      <TextField source="booking_id" />
      <TextField source="status" />
      <TextField source="reason" />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

export const DisputeShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="booking_id" />
      <TextField source="status" />
      <TextField source="reason" />
      <DateField source="created_at" showTime />
      <ActionsBar />
    </SimpleShowLayout>
  </Show>
);

const ActionsBar = () => {
  const rec = useRecordContext<any>();
  const notify = useNotify();
  const refresh = useRefresh();
  const { permissions } = usePermissions();
  const canAct = ['trust','admin','superadmin'].includes(permissions as string);
  if (!canAct) return null;
  const base = (import.meta as any).env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
  const headers = { 'Content-Type':'application/json', 'Authorization': `Bearer ${localStorage.getItem('booka_admin_token')}` };
  const assign = async () => {
    try { await fetch(`${base}/disputes/${rec.id}/assign`, { method:'POST', headers, body: JSON.stringify({}) }); notify('Assigned'); refresh(); } catch (e:any) { notify(e.message||'Failed', {type:'warning'}); }
  };
  const requestInfo = async () => {
    const note = prompt('Request info note');
    if (note===null) return;
    try { await fetch(`${base}/disputes/${rec.id}/request_info`, { method:'POST', headers, body: JSON.stringify({ note }) }); notify('Requested info'); refresh(); } catch (e:any) { notify(e.message||'Failed', {type:'warning'}); }
  };
  const resolve = async () => {
    const outcome = prompt('Outcome (resolved_refund | resolved_release | denied)');
    if (!outcome) return;
    const note = prompt('Resolution note (optional)') || undefined;
    try { await fetch(`${base}/disputes/${rec.id}/resolve`, { method:'POST', headers, body: JSON.stringify({ outcome, note }) }); notify('Resolved'); refresh(); } catch (e:any) { notify(e.message||'Failed', {type:'warning'}); }
  };
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
      <Button label="Assign to me" startIcon={<AssignmentIndIcon/>} onClick={assign} />
      <Button label="Request Info" startIcon={<InfoIcon/>} onClick={requestInfo} />
      <Button label="Resolve" startIcon={<DoneAllIcon/>} onClick={resolve} />
    </Stack>
  );
};

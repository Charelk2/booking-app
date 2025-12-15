import React from 'react';
import {
  List,
  Datagrid,
  TextField,
  DateField,
  BooleanField,
  TextInput,
  TopToolbar,
  Button,
  useRecordContext,
  useDataProvider,
  useNotify,
  useRefresh,
  SimpleList,
} from 'react-admin';
import { useMediaQuery } from '@mui/material';
import ConfirmButton from '../components/ConfirmButton';
import { getAdminToken, inferAdminApiUrl } from '../env';

const clientFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn />,
  <TextInput key="email" source="email" label="Email" />,
];

const ExportCSVButton: React.FC = () => {
  const handle = async () => {
    try {
      const base = inferAdminApiUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/clients/export`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clients.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('CSV export failed', e);
    }
  };
  return <Button label="Export CSV" onClick={() => void handle()} />;
};

const RowActions: React.FC = () => {
  const rec: any = useRecordContext();
  const dp: any = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  if (!rec) return null;

  const onToggleActive = async () => {
    try {
      if (rec.is_active) await dp.deactivateClient(rec.id);
      else await dp.activateClient(rec.id);
      notify(rec.is_active ? 'Client deactivated' : 'Client activated', { type: 'info' });
      refresh();
    } catch (e) {
      notify('Action failed', { type: 'warning' });
    }
  };

  const onPurge = async (confirmEmail?: string) => {
    try {
      await dp.purgeUser(rec.id, confirmEmail || '', true);
      notify('app.user.purged', { type: 'info' });
      refresh();
    } catch (e: any) {
      notify(e?.message || 'Purge failed', { type: 'warning' });
    }
  };

  const onImpersonate = async () => {
    try {
      const { token } = await dp.impersonateClient(rec.id);
      await navigator.clipboard.writeText(token);
      notify('Impersonation token copied to clipboard', { type: 'info' });
    } catch (e) {
      notify('Failed to impersonate', { type: 'warning' });
    }
  };

  return (
    <>
      <Button label={rec.is_active ? 'Deactivate' : 'Activate'} onClick={() => void onToggleActive()} />
      <Button label="Impersonate" onClick={() => void onImpersonate()} />
      <ConfirmButton
        label="Purge"
        color="error"
        confirmTitle="Type email to confirm purge"
        confirmPlaceholder="email@example.com"
        confirmTextRequired={rec.email}
        onConfirm={onPurge}
      />
    </>
  );
};

export const ClientList: React.FC = () => {
  const isSmall = useMediaQuery('(max-width:600px)');
  const Actions = (
    <TopToolbar>
      <ExportCSVButton />
    </TopToolbar>
  );
  return (
    <List filters={clientFilters} perPage={25} sort={{ field: 'created_at', order: 'DESC' }} actions={Actions}>
      {isSmall ? (
        <SimpleList
          primaryText={(r: any) => r.email}
          secondaryText={(r: any) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim()}
          tertiaryText={(r: any) => `Paid: ${r.bookings_paid_count ?? 0} · Completed: ${r.bookings_completed_count ?? 0}`}
        />
      ) : (
        <Datagrid rowClick={false} bulkActionButtons={false} size="small">
          <TextField source="id" label="ID" />
          <TextField source="email" />
          <TextField source="first_name" label="First" />
          <TextField source="last_name" label="Last" />
          <TextField source="phone_number" label="Phone" />
          <TextField source="bookings_paid_count" label="Paid Bookings" />
          <TextField source="bookings_completed_count" label="Completed" />
          <BooleanField source="is_active" />
          <BooleanField source="is_verified" />
          <DateField source="created_at" />
          <RowActions />
        </Datagrid>
      )}
    </List>
  );
};

export default ClientList;

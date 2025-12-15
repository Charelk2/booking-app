import {
  List,
  Datagrid,
  TextField,
  DateField,
  BooleanField,
  TextInput,
  SelectInput,
  useDataProvider,
  useNotify,
  useRefresh,
  useRecordContext,
  Show,
  SimpleShowLayout,
  TopToolbar,
  ShowButton,
  Button,
  ExportButton,
  useListContext,
} from 'react-admin';
import React from 'react';
import { Card, CardContent, Divider, Tooltip, useMediaQuery, IconButton } from '@mui/material';
import { useRedirect, SimpleList, FunctionField } from 'react-admin';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import ConfirmButton from '../components/ConfirmButton';
import { inferPublicWebOrigin } from '../env';

const providerFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn />,
  <SelectInput
    key="is_active"
    source="is_active"
    label="Status"
    choices={[
      { id: true as any, name: 'Active' },
      { id: false as any, name: 'Inactive' },
    ]}
  />,
];

const RowActions = () => {
  const record = useRecordContext<any>();
  const dp = useDataProvider() as any;
  const notify = useNotify();
  const refresh = useRefresh();
  const redirect = useRedirect();

  if (!record) return null;

  const onToggleActive = async () => {
    try {
      if (record.is_active) await dp.deactivateProvider(record.id);
      else await dp.activateProvider(record.id);
      notify(record.is_active ? 'app.provider.deactivated' : 'app.provider.activated', { type: 'info' });
      refresh();
    } catch (e: any) {
      notify(e?.message || 'Action failed', { type: 'warning' });
    }
  };

  const onMessage = async () => {
    const content = window.prompt('Message to provider');
    if (!content) return;
    try {
      await dp.messageProvider(record.id, content);
      notify('app.message.sent', { type: 'info' });
    } catch (e: any) {
      notify(e?.message || 'Send failed', { type: 'warning' });
    }
  };

  return (
    <>
      <ShowButton label="Details" />
      {/* Public profile quick link */}
      <Tooltip title="Open Public Profile" arrow>
        <IconButton aria-label="Open Public Profile" onClick={() => window.open(`${inferPublicWebOrigin()}/service-providers/${record.id}`, '_blank', 'noopener,noreferrer')} size="small" sx={{ color: '#0f766e' }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M14 3h3a1 1 0 011 1v3a1 1 0 11-2 0V6.414l-6.293 6.293a1 1 0 01-1.414-1.414L14.586 5H14a1 1 0 110-2z" />
            <path d="M5 6a1 1 0 011-1h3a1 1 0 110 2H7v7h7v-2a1 1 0 112 0v3a1 1 0 01-1 1H6a1 1 0 01-1-1V6z" />
          </svg>
        </IconButton>
      </Tooltip>
      <ConfirmButton
        label={record.is_active ? 'Deactivate' : 'Activate'}
        confirmTitle={record.is_active ? 'Deactivate provider?' : 'Activate provider?'}
        confirmContent={record.is_active ? 'The provider will no longer appear publicly.' : 'The provider will be re-enabled.'}
        onConfirm={onToggleActive}
      />
      <Button label="Message" onClick={onMessage} />
    </>
  );
};

const ServicesLinkCell: React.FC = () => {
  const rec = useRecordContext<any>();
  if (!rec) return <span>—</span>;
  const display = typeof rec.services_count === 'number' ? rec.services_count : (rec.services_count || 0);
  const label = (rec.business_name || rec.email || ('#' + rec.id)).toString();
  const to = `/listings?provider=${encodeURIComponent(String(rec.id))}&ephemeral=1`;
  return (
    <Tooltip title={`View services for ${label}`} arrow>
      <Link to={to} style={{ color: '#0f766e', textDecoration: 'none', fontWeight: 600 }}>{display}</Link>
    </Tooltip>
  );
};

export const ProviderList = () => {
  const isSmall = useMediaQuery('(max-width:600px)');
  const location = useLocation();
  const isDeletedView = location.pathname.includes('/providers/deleted');
  const redirect = useRedirect();
  const ActionsBar = (
    <TopToolbar>
      <ExportButton />
      {isDeletedView ? (
        <Button label="Active Providers" onClick={() => redirect('/providers')} />
      ) : (
        <Button label="Deleted Providers" onClick={() => redirect('/providers/deleted')} />
      )}
    </TopToolbar>
  );
  return (
    <List
      resource="providers"
      filters={providerFilters}
      filterDefaultValues={isDeletedView ? { is_active: false as any } : undefined}
      perPage={25}
      sort={{ field: 'created_at', order: 'DESC' }}
      actions={ActionsBar}
    >
      {isSmall ? (
        <SimpleList
          primaryText={(r: any) => r.email}
          secondaryText={(r: any) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim()}
          tertiaryText={(r: any) => r.location || ''}
          linkType="show"
        />
      ) : (
        <Datagrid rowClick={false} bulkActionButtons={isDeletedView ? false : <BulkActions />} size="small">
          <TextField source="id" label="ID" />
          <TextField source="email" />
          <TextField source="first_name" label="First" />
          <TextField source="last_name" label="Last" />
          <TextField source="phone_number" label="Phone" />
          <TextField source="business_name" label="Business" />
          <TextField source="location" />
          <FunctionField label="# Services" render={() => <ServicesLinkCell />} />
          <BooleanField source="is_active" />
          <BooleanField source="is_verified" />
          <DateField source="created_at" />
          {isDeletedView ? null : <RowActions />}
        </Datagrid>
      )}
    </List>
  );
};

const PublicProfileButton: React.FC = () => {
  const rec = useRecordContext<any>();
  if (!rec?.id) return null;
  const url = `${inferPublicWebOrigin()}/service-providers/${rec.id}`;
  return (
    <Tooltip title="Open Public Profile" arrow>
      <Button
        label="Public Profile"
        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        startIcon={(
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M14 3h3a1 1 0 011 1v3a1 1 0 11-2 0V6.414l-6.293 6.293a1 1 0 01-1.414-1.414L14.586 5H14a1 1 0 110-2z" />
            <path d="M5 6a1 1 0 011-1h3a1 1 0 110 2H7v7h7v-2a1 1 0 112 0v3a1 1 0 01-1 1H6a1 1 0 01-1-1V6z" />
          </svg>
        )}
      />
    </Tooltip>
  );
};

export const ProviderShow = () => (
  <Show actions={<TopToolbar><PublicProfileButton /></TopToolbar>}>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="email" />
      <TextField source="first_name" />
      <TextField source="last_name" />
      <TextField source="phone_number" />
      <BooleanField source="is_active" />
      <BooleanField source="is_verified" />
      <TextField source="business_name" />
      <TextField source="location" />
      <TextField source="services_count" />
      <DateField source="created_at" />
      <ConversationPanel />
    </SimpleShowLayout>
  </Show>
);

const ConversationPanel = () => {
  const record = useRecordContext<any>();
  const dp = useDataProvider() as any;
  const notify = useNotify();
  const refresh = useRefresh();
  const [messages, setMessages] = React.useState<Array<{ id: string; sender_type: string; content: string; created_at: string }>>([]);
  const [loading, setLoading] = React.useState(false);
  const redirect2 = useRedirect();

  const load = async () => {
    if (!record?.id) return;
    setLoading(true);
    try {
      const data = await dp.getProviderThread(record.id);
      setMessages(data.messages);
    } catch (e: any) {
      notify(e?.message || 'Failed to load conversation', { type: 'warning' });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { void load(); }, [record?.id]);

  const onSend = async () => {
    const content = window.prompt('Reply to provider');
    if (!content) return;
    try {
      await dp.messageProvider(record.id, content);
      notify('app.message.sent', { type: 'info' });
      await load();
    } catch (e: any) {
      notify(e?.message || 'Send failed', { type: 'warning' });
    }
  };

  const onUnlist = async () => {
    try {
      await dp.unlistProvider(record.id);
      notify('app.provider.all_unlisted', { type: 'info' });
      refresh();
    } catch (e: any) {
      notify(e?.message || 'Unlist failed', { type: 'warning' });
    }
  };

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Support Conversation</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button label="Send message" onClick={onSend} />
            <ConfirmButton
              label="Unlist all services"
              confirmTitle="Unlist all services?"
              confirmContent="All listings for this provider will be set to rejected."
              onConfirm={onUnlist}
            />
            <ConfirmButton
              label="Purge provider"
              color="error"
              confirmTitle="Type provider email to confirm purge"
              confirmPlaceholder="email@example.com"
              confirmTextRequired={record?.email}
              onConfirm={async (val) => {
                // 1) Unlist ALL listings for this provider to remove them from public view
                try { await (dp as any).unlistProvider(record.id); } catch {}
                // 2) Extra safety: explicitly reject ALL listings so they never appear pending
                try {
                  const all = await (dp as any).getList('listings', {
                    pagination: { page: 1, perPage: 1000 },
                    sort: { field: 'id', order: 'ASC' },
                    filter: { provider_id: record.id },
                  });
                  const toReject = (all?.data || []).filter((l: any) => String(l.status).toLowerCase() !== 'rejected').map((l:any) => l.id);
                  if (toReject.length) {
                    await (dp as any).bulkRejectListings(toReject, 'Provider purged');
                  }
                } catch {}

                // 3) Purge the provider account
                await (dp as any).purgeProvider(record.id, val, true);
                notify('app.provider.purged', { type: 'info' });
                redirect2('/providers');
              }}
            />
          </div>
        </div>
        <Divider sx={{ my: 2 }} />
        {loading ? (
          <p>Loading…</p>
        ) : messages.length === 0 ? (
          <p>No messages yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(m => (
              <div key={m.id} style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>{new Date(m.created_at).toLocaleString()} · {m.sender_type || 'user'}</div>
                <div style={{ marginTop: 4 }}>{m.content}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};



const BulkActions = () => {
  const { selectedIds } = useListContext<any>();
  const dp = useDataProvider() as any;
  const notify = useNotify();
  const refresh = useRefresh();
  if (!selectedIds || selectedIds.length === 0) return null;
  const run = async (fn: (id: any) => Promise<any>, msgKey: string) => {
    try {
      await Promise.all(selectedIds.map((id: any) => fn(id)));
      notify(msgKey, { type: 'info' });
      refresh();
    } catch (e: any) {
      notify(e?.message || 'Action failed', { type: 'warning' });
    }
  };
  return (
    <div style={{ display: 'flex', gap: 8, padding: 8 }}>
      <Button label="Deactivate" onClick={() => run((id) => dp.deactivateProvider(id), 'app.provider.deactivated')} />
      <Button label="Activate" onClick={() => run((id) => dp.activateProvider(id), 'app.provider.activated')} />
      <Button label="Unlist all" onClick={() => run((id) => dp.unlistProvider(id), 'app.provider.all_unlisted')} />
    </div>
  );
};

import * as React from 'react';
import {
  List, Datagrid, TextField, DateField, TextInput, SelectInput,
  Button, useRecordContext, useRefresh, useNotify, useListContext, usePermissions,
  Show, SimpleShowLayout
} from 'react-admin';
import { Stack } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import type { ExtendedDataProvider } from '../dataProvider';

const listingFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn />,
  <SelectInput key="status" source="status" choices={[
    { id: 'pending_review', name: 'Pending Review' },
    { id: 'approved', name: 'Approved' },
    { id: 'rejected', name: 'Rejected' },
    { id: 'draft', name: 'Draft' },
  ]} alwaysOn />
];

const ApproveReject = () => {
  const rec = useRecordContext();
  const refresh = useRefresh();
  const notify = useNotify();
  const { permissions } = usePermissions();
  const canModerate = permissions === 'content' || permissions === 'admin' || permissions === 'superadmin';
  if (!canModerate) return null;
  const approve = async () => {
    try {
      await (window as any).raDataProvider.approveListing(rec.id);
      notify('Listing approved', { type: 'info' }); refresh();
    } catch (e:any) { notify(e.message || 'Approve failed', { type: 'warning' }); }
  };
  const reject = async () => {
    const reason = prompt('Reason (optional)');
    try {
      await (window as any).raDataProvider.rejectListing(rec.id, reason || undefined);
      notify('Listing rejected', { type: 'info' }); refresh();
    } catch (e:any) { notify(e.message || 'Reject failed', { type: 'warning' }); }
  };
  return (
    <Stack direction="row" spacing={1}>
      <Button label="Approve" onClick={approve} startIcon={<CheckIcon/>} />
      <Button label="Reject"  onClick={reject}  startIcon={<CloseIcon/>} />
    </Stack>
  );
};

// Thumbnail for list rows
const getThumbUrl = (url?: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;
  try {
    const base = (import.meta as any).env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
    const origin = new URL(base).origin;
    const path = url.startsWith('/static/') ? url : `/static/${url.replace(/^\/+/, '')}`;
    return `${origin}${path}`;
  } catch {
    return url;
  }
};

const Thumb: React.FC = () => {
  const rec = useRecordContext<any>();
  const src = getThumbUrl(rec?.media_url);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={rec?.title || 'thumb'}
      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }}
    />
  );
};

const TitleWithThumb: React.FC = () => {
  const rec = useRecordContext<any>();
  const src = getThumbUrl(rec?.media_url);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {src ? (
        <img src={src} alt={rec?.title || 'thumb'} style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4, border: '1px solid #eee' }} />
      ) : null}
      <span>{rec?.title}</span>
    </span>
  );
};

const StatusBadge: React.FC = () => {
  const rec = useRecordContext<any>();
  const status = String(rec?.status || '').toLowerCase();
  const pretty = (
    status === 'pending_review' ? 'PENDING' :
    status === 'approved' ? 'APPROVED' :
    status === 'rejected' ? 'REJECTED' :
    status === 'draft' ? 'DRAFT' : (rec?.status || '')
  );
  const cls = (
    status === 'approved' ? 'background: #ECFDF5; color:#065F46; border:1px solid #A7F3D0;' :
    status === 'rejected' ? 'background: #FEF2F2; color:#991B1B; border:1px solid #FECACA;' :
    status === 'pending_review' ? 'background:#FFFBEB; color:#92400E; border:1px solid #FDE68A;' :
    'background:#F3F4F6; color:#111827; border:1px solid #E5E7EB;'
  );
  return (
    <span style={{ padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 600, ...styleFromString(cls) }}>{pretty}</span>
  );
};

function styleFromString(styleStr: string): React.CSSProperties {
  return styleStr.split(';').reduce((acc, decl) => {
    const [k, v] = decl.split(':').map((s) => s && s.trim());
    if (k && v) (acc as any)[k as any] = v;
    return acc;
  }, {} as React.CSSProperties);
}

const BulkApprove = () => {
  const { selectedIds } = useListContext();
  const refresh = useRefresh();
  const notify = useNotify();
  const { permissions } = usePermissions();
  const canModerate = permissions === 'content' || permissions === 'admin' || permissions === 'superadmin';
  if (!canModerate) return null;
  const run = async () => {
    if (!selectedIds?.length) return notify('Select rows first', { type:'warning' });
    try {
      const base = (import.meta as any).env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
      await fetch(base + '/listings/bulk_approve', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${localStorage.getItem('booka_admin_token')}` }, body: JSON.stringify({ ids: selectedIds })
      });
      notify('Approved'); refresh();
    } catch (e:any) { notify(e.message || 'Bulk approve failed', { type:'warning' }); }
  };
  return <Button label="Approve Selected" onClick={run} startIcon={<CheckIcon/>}/>;
};

const BulkReject = () => {
  const { selectedIds } = useListContext();
  const refresh = useRefresh();
  const notify = useNotify();
  const { permissions } = usePermissions();
  const canModerate = permissions === 'content' || permissions === 'admin' || permissions === 'superadmin';
  if (!canModerate) return null;
  const run = async () => {
    if (!selectedIds?.length) return notify('Select rows first', { type:'warning' });
    const reason = prompt('Reason (optional)') || undefined;
    try {
      const base = (import.meta as any).env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
      await fetch(base + '/listings/bulk_reject', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${localStorage.getItem('booka_admin_token')}` }, body: JSON.stringify({ ids: selectedIds, reason })
      });
      notify('Rejected'); refresh();
    } catch (e:any) { notify(e.message || 'Bulk reject failed', { type:'warning' }); }
  };
  return <Button label="Reject Selected" onClick={run} startIcon={<CloseIcon/>}/>;
};

const BulkActions = () => (
  <Stack direction="row" spacing={1} sx={{ p:1 }}>
    <BulkApprove/>
    <BulkReject/>
  </Stack>
);

export const ListingList = () => (
  <List
    filters={listingFilters}
    filterDefaultValues={{ status: 'pending_review' }}
    sort={{ field: 'updated_at', order: 'DESC' }}
    perPage={25}
    bulkActionButtons={<BulkActions/>}
  >
    <Datagrid rowClick="show">
      <TextField source="id" />
      <TitleWithThumb />
      <TextField source="category" />
      <StatusBadge />
      <DateField source="updated_at" showTime />
      <ApproveReject />
    </Datagrid>
  </List>
);

// expose dataProvider to window to simplify calling custom actions
export const attachDP = (dp: ExtendedDataProvider) => { (window as any).raDataProvider = dp; };

// ─── Show view with Moderation Logs ───────────────────────────────────────────

type Log = { id: string; action: string; reason?: string | null; at: string; admin_id: string };

const ModerationLogs: React.FC = () => {
  const rec = useRecordContext<any>();
  const [logs, setLogs] = React.useState<Log[]>([]);
  const notify = useNotify();
  React.useEffect(() => {
    let aborted = false;
    const run = async () => {
      try {
        const base = (import.meta as any).env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
        const res = await fetch(`${base}/listings/${rec.id}/moderation_logs`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('booka_admin_token')}` }
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        if (!aborted) setLogs(data);
      } catch (e:any) { if (!aborted) notify(e.message || 'Failed to load logs', { type: 'warning' }); }
    };
    if (rec?.id) run();
    return () => { aborted = true; };
  }, [rec?.id]);
  if (!rec) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <h3>Moderation Logs</h3>
      {logs.length === 0 ? (
        <div>No logs</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 4 }}>When</th>
              <th style={{ textAlign: 'left', padding: 4 }}>Action</th>
              <th style={{ textAlign: 'left', padding: 4 }}>Reason</th>
              <th style={{ textAlign: 'left', padding: 4 }}>Admin</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id}>
                <td style={{ padding: 4 }}>{new Date(l.at).toLocaleString()}</td>
                <td style={{ padding: 4 }}>{l.action}</td>
                <td style={{ padding: 4 }}>{l.reason || ''}</td>
                <td style={{ padding: 4 }}>{l.admin_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// Media helpers
const getMediaUrl = (url?: string | null) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;
  try {
    const origin = new URL(import.meta.env.VITE_API_URL as string).origin;
    const path = url.startsWith('/static/') ? url : `/static/${url.replace(/^\/+/, '')}`;
    return `${origin}${path}`;
  } catch {
    return url;
  }
};

const MediaPreview: React.FC<{ url?: string | null; title?: string | null }> = ({ url, title }) => {
  const src = getMediaUrl(url || undefined);
  if (!src) return null;
  const lower = src.toLowerCase();
  const isImage = /(\.png|\.jpg|\.jpeg|\.webp|\.gif)(\?|$)/.test(lower);
  const isVideo = /(\.mp4|\.webm|\.ogg)(\?|$)/.test(lower);
  return (
    <div style={{ marginTop: 12 }}>
      {isImage && (
        <img src={src} alt={title || 'media'} style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #eee' }} />
      )}
      {isVideo && (
        <video src={src} controls style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #eee' }} />
      )}
      {!isImage && !isVideo && (
        <a href={src} target="_blank" rel="noreferrer">Open media</a>
      )}
    </div>
  );
};

const ListingMediaPreview: React.FC = () => {
  const rec = useRecordContext<any>();
  return <MediaPreview url={rec?.media_url} title={rec?.title} />;
};

export const ListingShow: React.FC = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="title" />
      <TextField source="description" />
      <TextField source="media_url" />
      <ListingMediaPreview />
      <TextField source="price" />
      <TextField source="currency" />
      <TextField source="duration_minutes" />
      <TextField source="display_order" />
      <TextField source="service_category_id" />
      <TextField source="category" />
      <TextField source="status" />
      <DateField source="updated_at" showTime />
      <ApproveReject />
      <ModerationLogs />
    </SimpleShowLayout>
  </Show>
);

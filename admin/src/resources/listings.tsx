import * as React from 'react';
import {
  List, Datagrid, TextField, DateField, TextInput, SelectInput,
  Button, useRecordContext, useRefresh, useNotify, useListContext, usePermissions,
  Show, SimpleShowLayout, ReferenceField, FunctionField
} from 'react-admin';
import { Stack, Tooltip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField as MUITextField } from '@mui/material';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useDataProvider } from 'react-admin';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import type { ExtendedDataProvider } from '../dataProvider';

const listingFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn size="small" margin="dense" variant="outlined" />,
  <SelectInput key="status" source="status" choices={[
    { id: 'pending_review', name: 'Pending Review' },
    { id: 'approved', name: 'Approved' },
    { id: 'rejected', name: 'Rejected' },
    { id: 'draft', name: 'Draft' },
  ]} alwaysOn size="small" margin="dense" variant="outlined" />
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

const ProviderCellInner: React.FC = () => {
  const prov = useRecordContext<any>();
  if (!prov) return <span>—</span>;
  const name = prov.business_name || prov.email || `#${prov.id}`;
  const active = prov.is_active !== undefined ? !!prov.is_active : true;
  const url = `/providers/${prov.id}/show`;
  const getPublicOrigin = (): string => {
    const env = (import.meta as any).env?.VITE_PUBLIC_WEB_ORIGIN as string | undefined;
    if (env) return env.replace(/\/$/, '');
    const { protocol, hostname } = window.location;
    if (/^admin\./i.test(hostname)) return `${protocol}//${hostname.replace(/^admin\./i, '')}`;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:3000`;
    return `${protocol}//${hostname}`;
  };
  const publicUrl = `${getPublicOrigin()}/service-providers/${prov.id}`;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Tooltip title={`Open Provider • ${prov.email || ''}`} arrow>
        <Link to={url} target="_blank" rel="noopener noreferrer" style={{ color: '#0f766e', textDecoration: 'none' }}>{name}</Link>
      </Tooltip>
      <Tooltip title="Open Public Profile" arrow>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" aria-label="Open Public Profile" style={{ color: '#0f766e' }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M14 3h3a1 1 0 011 1v3a1 1 0 11-2 0V6.414l-6.293 6.293a1 1 0 01-1.414-1.414L14.586 5H14a1 1 0 110-2z" />
            <path d="M5 6a1 1 0 011-1h3a1 1 0 110 2H7v7h7v-2a1 1 0 112 0v3a1 1 0 01-1 1H6a1 1 0 01-1-1V6z" />
          </svg>
        </a>
      </Tooltip>
      {active ? (
        <span aria-label="Active" title="Active" style={{ display: 'inline-flex', alignItems: 'center', color: '#065F46' }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.172 7.707 8.879a1 1 0 10-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </span>
      ) : (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 8,
            fontSize: 10,
            fontWeight: 700,
            background: '#FEF2F2',
            color: '#991B1B',
            border: '1px solid #FECACA',
          }}
        >
          INACTIVE
        </span>
      )}
    </span>
  );
};

const StatusBadge: React.FC = () => {
  const rec = useRecordContext<any>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'idle'|'reject'>('idle');
  const [reason, setReason] = React.useState('');
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

  const doApprove = async () => {
    try {
      await (window as any).raDataProvider.approveListing(rec.id);
      notify('Listing approved', { type: 'info' });
      setOpen(false);
      refresh();
    } catch (e:any) { notify(e.message || 'Approve failed', { type:'warning' }); }
  };
  const doReject = async () => {
    try {
      await (window as any).raDataProvider.rejectListing(rec.id, reason || undefined);
      notify('Listing rejected', { type: 'info' });
      setOpen(false);
      setMode('idle');
      setReason('');
      refresh();
    } catch (e:any) { notify(e.message || 'Reject failed', { type:'warning' }); }
  };

  const canApprove = status === 'pending_review' || status === 'rejected' || status === '';
  const canReject = status === 'pending_review' || status === 'approved' || status === '';

  const handleOpen: React.MouseEventHandler<HTMLSpanElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  const handleKey: React.KeyboardEventHandler<HTMLSpanElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    }
  };

  return (
    <>
      <Tooltip title="Change status" arrow>
        <span
          onClick={handleOpen}
          onMouseDown={(e) => { e.stopPropagation(); }}
          onKeyDown={handleKey}
          role="button"
          tabIndex={0}
          style={{
            position: 'relative',
            zIndex: 20,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 600,
            ...styleFromString(cls),
          }}
        >
          {pretty}
        </span>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => { setOpen(false); setMode('idle'); setReason(''); }}
        maxWidth="xs"
        fullWidth
        onClick={(e) => { e.stopPropagation(); }}
        onMouseDown={(e) => { e.stopPropagation(); }}
      >
        <DialogTitle>{mode === 'reject' ? 'Reject listing' : 'Change status'}</DialogTitle>
        <DialogContent onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 14, marginTop: 4, marginBottom: 8 }}>
            Current status: <strong>{pretty}</strong>
          </div>
          {mode === 'reject' ? (
            <MUITextField
              label="Rejection reason (optional)"
              placeholder="Add a short note for the provider"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              multiline
              minRows={3}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div style={{ fontSize: 13, color: '#555' }}>
              Choose a new status action below.
            </div>
          )}
        </DialogContent>
        <DialogActions onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <Button label="Cancel" onClick={() => { setOpen(false); setMode('idle'); setReason(''); }} />
          {mode === 'reject' ? (
            <Button label="Confirm Reject" onClick={doReject} />
          ) : (
            <>
              {canReject && <Button label="Reject" onClick={(e:any) => { e?.stopPropagation?.(); setMode('reject'); }} />}
              {canApprove && <Button label="Approve" onClick={doApprove} />}
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
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
    sort={{ field: 'updated_at', order: 'DESC' }}
    perPage={25}
    bulkActionButtons={<BulkActions/>}
  >
    <EphemeralProviderFilter />
    <ClearProviderFilterButton />
    <Datagrid rowClick="show">
      <TextField source="id" />
      <FunctionField label="Service Name" render={() => <TitleWithThumb />} />
      <ReferenceField label="Provider" source="provider_id" reference="providers">
        <ProviderCellInner />
      </ReferenceField>
      <TextField source="category" />
      <DateField source="updated_at" label="Updated At" showTime />
      <FunctionField label="Status" render={() => <StatusBadge />} />
    </Datagrid>
  </List>
);

// If navigated from Providers with ?provider=ID&ephemeral=1, apply provider filter once,
// then clean the URL to avoid persistence on refresh/navigation.
const EphemeralProviderFilter: React.FC = () => {
  const { setFilters, filterValues } = useListContext();
  const location = useLocation();
  const navigate = useNavigate();
  React.useEffect(() => {
    try {
      const usp = new URLSearchParams(location.search);
      const provider = usp.get('provider');
      const ephemeral = usp.get('ephemeral');
      if (provider && ephemeral === '1') {
        // Apply provider filter from providers page and keep it until user clears manually
        if (String(filterValues.provider_id || '') !== String(provider)) {
          setFilters({ ...filterValues, provider_id: provider });
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  return null;
};

// Small control to clear only the provider filter (if applied)
const ClearProviderFilterButton: React.FC = () => {
  const { setFilters, filterValues } = useListContext();
  const providerId = (filterValues as any)?.provider_id;
  if (!providerId) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', margin: '8px 8px 0' }}>
      <Button label="Clear provider filter" onClick={() => {
        const next = { ...(filterValues as any) };
        delete next.provider_id;
        setFilters(next);
      }} />
    </div>
  );
};

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

const ListingThumbnail: React.FC = () => {
  const rec = useRecordContext<any>();
  const src = getMediaUrl(rec?.media_url);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={rec?.title || 'thumb'}
      style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }}
    />
  );
};

const getProviderIdFromRecord = (rec: any): string | null => {
  if (!rec) return null;
  const nested = rec.provider?.id || rec.provider?.provider_id || rec.provider?.user_id || rec.owner?.id || rec.owner?.provider_id;
  return (
    nested ??
    rec.provider_id ?? rec.providerId ?? rec.user_id ?? rec.userId ??
    rec.service_provider_id ?? rec.serviceProviderId ?? rec.owner_id ?? rec.ownerId ?? null
  );
};

// Backend now includes provider_id on listings; no scan/cache needed.

const ProviderEmailField: React.FC = () => {
  const dp = useDataProvider();
  const rec = useRecordContext<any>();
  const [email, setEmail] = React.useState<string | null>(null);
  React.useEffect(() => {
    let aborted = false;
    const run = async () => {
      try {
        const pid = getProviderIdFromRecord(rec);
        if (!pid) { if (!aborted) setEmail(null); return; }
        const res = await dp.getOne('providers', { id: pid });
        if (!aborted) setEmail((res as any)?.data?.email ?? null);
      } catch { if (!aborted) setEmail(null); }
    };
    run();
    return () => { aborted = true; };
  }, [dp, rec]);
  if (!email) return <span>—</span>;
  return <a href={`mailto:${email}`}>{email}</a>;
};

const MediaUrlCompact: React.FC = () => {
  const rec = useRecordContext<any>();
  const url = rec?.media_url as string | undefined;
  if (!url) return <span>—</span>;
  const short = url.length > 48 ? url.slice(0, 44) + '…' : url;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch {}
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Tooltip title={url}><span style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short}</span></Tooltip>
      <IconButton size="small" onClick={copy} aria-label="Copy media URL"><ContentCopyIcon fontSize="inherit" /></IconButton>
    </span>
  );
};

export const ListingShow: React.FC = () => (
  <Show>
    <SimpleShowLayout>
      <ProviderStatusBanner />
      <TextField source="id" />
      <TextField source="title" />
      <TextField source="description" />
      <MediaUrlCompact />
      <ListingThumbnail />
      <ListingMediaPreview />
      <ProviderIdField />
      <ProviderEmailField />
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

const ProviderIdField: React.FC = () => {
  const rec = useRecordContext<any>();
  const pid = getProviderIdFromRecord(rec);
  return <span>{pid || '—'}</span>;
};

const ProviderStatusBanner: React.FC = () => {
  const dp = useDataProvider();
  const rec = useRecordContext<any>();
  const [status, setStatus] = React.useState<'active'|'inactive'|'missing'|'unknown'>('unknown');
  React.useEffect(() => {
    let aborted = false;
    const run = async () => {
      try {
        const pid = getProviderIdFromRecord(rec);
        if (!pid) { if (!aborted) setStatus('missing'); return; }
        const res = await dp.getOne('providers', { id: pid });
        const active = !!(res as any)?.data?.is_active;
        if (!aborted) setStatus(active ? 'active' : 'inactive');
      } catch {
        if (!aborted) setStatus('missing');
      }
    };
    run();
    return () => { aborted = true; };
  }, [dp, rec]);
  if (status === 'active' || status === 'unknown') return null;
  const msg = status === 'inactive' ? 'Provider is deactivated — read-only' : 'Provider is deleted — listing is archived';
  return (
    <div style={{ background:'#FEF2F2', color:'#991B1B', border:'1px solid #FECACA', borderRadius:8, padding:8, fontWeight:600 }}>
      {msg}
    </div>
  );
};

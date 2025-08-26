import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import * as React from 'react';
import { List, Datagrid, TextField, DateField, TextInput, SelectInput, Button, useRecordContext, useRefresh, useNotify, useListContext, usePermissions, Show, SimpleShowLayout, ReferenceField, FunctionField } from 'react-admin';
import { Stack, Tooltip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField as MUITextField } from '@mui/material';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useDataProvider } from 'react-admin';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
const listingFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "q"),
    _jsx(SelectInput, { source: "status", choices: [
            { id: 'pending_review', name: 'Pending Review' },
            { id: 'approved', name: 'Approved' },
            { id: 'rejected', name: 'Rejected' },
            { id: 'draft', name: 'Draft' },
        ], alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "status")
];
const ApproveReject = () => {
    const rec = useRecordContext();
    const refresh = useRefresh();
    const notify = useNotify();
    const { permissions } = usePermissions();
    const canModerate = permissions === 'content' || permissions === 'admin' || permissions === 'superadmin';
    if (!canModerate)
        return null;
    const approve = async () => {
        try {
            await window.raDataProvider.approveListing(rec.id);
            notify('Listing approved', { type: 'info' });
            refresh();
        }
        catch (e) {
            notify(e.message || 'Approve failed', { type: 'warning' });
        }
    };
    const reject = async () => {
        const reason = prompt('Reason (optional)');
        try {
            await window.raDataProvider.rejectListing(rec.id, reason || undefined);
            notify('Listing rejected', { type: 'info' });
            refresh();
        }
        catch (e) {
            notify(e.message || 'Reject failed', { type: 'warning' });
        }
    };
    return (_jsxs(Stack, { direction: "row", spacing: 1, children: [_jsx(Button, { label: "Approve", onClick: approve, startIcon: _jsx(CheckIcon, {}) }), _jsx(Button, { label: "Reject", onClick: reject, startIcon: _jsx(CloseIcon, {}) })] }));
};
// Thumbnail for list rows
const getThumbUrl = (url) => {
    if (!url)
        return null;
    if (/^https?:\/\//i.test(url) || /^data:/i.test(url))
        return url;
    try {
        const base = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
        const origin = new URL(base).origin;
        const path = url.startsWith('/static/') ? url : `/static/${url.replace(/^\/+/, '')}`;
        return `${origin}${path}`;
    }
    catch {
        return url;
    }
};
const Thumb = () => {
    const rec = useRecordContext();
    const src = getThumbUrl(rec?.media_url);
    if (!src)
        return null;
    return (_jsx("img", { src: src, alt: rec?.title || 'thumb', style: { width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' } }));
};
const TitleWithThumb = () => {
    const rec = useRecordContext();
    const src = getThumbUrl(rec?.media_url);
    return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 8 }, children: [src ? (_jsx("img", { src: src, alt: rec?.title || 'thumb', style: { width: 24, height: 24, objectFit: 'cover', borderRadius: 4, border: '1px solid #eee' } })) : null, _jsx("span", { children: rec?.title })] }));
};
const ProviderCellInner = () => {
    const prov = useRecordContext();
    if (!prov)
        return _jsx("span", { children: "\u2014" });
    const name = prov.business_name || prov.email || `#${prov.id}`;
    const active = prov.is_active !== undefined ? !!prov.is_active : true;
    const url = `/providers/${prov.id}/show`;
    const getPublicOrigin = () => {
        const env = import.meta.env?.VITE_PUBLIC_WEB_ORIGIN;
        if (env)
            return env.replace(/\/$/, '');
        const { protocol, hostname } = window.location;
        if (/^admin\./i.test(hostname))
            return `${protocol}//${hostname.replace(/^admin\./i, '')}`;
        if (hostname === 'localhost' || hostname === '127.0.0.1')
            return `${protocol}//${hostname}:3000`;
        return `${protocol}//${hostname}`;
    };
    const publicUrl = `${getPublicOrigin()}/service-providers/${prov.id}`;
    return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [_jsx(Tooltip, { title: `Open Provider • ${prov.email || ''}`, arrow: true, children: _jsx(Link, { to: url, target: "_blank", rel: "noopener noreferrer", style: { color: '#0f766e', textDecoration: 'none' }, children: name }) }), _jsx(Tooltip, { title: "Open Public Profile", arrow: true, children: _jsx("a", { href: publicUrl, target: "_blank", rel: "noopener noreferrer", "aria-label": "Open Public Profile", style: { color: '#0f766e' }, children: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 20 20", fill: "currentColor", "aria-hidden": "true", children: [_jsx("path", { d: "M14 3h3a1 1 0 011 1v3a1 1 0 11-2 0V6.414l-6.293 6.293a1 1 0 01-1.414-1.414L14.586 5H14a1 1 0 110-2z" }), _jsx("path", { d: "M5 6a1 1 0 011-1h3a1 1 0 110 2H7v7h7v-2a1 1 0 112 0v3a1 1 0 01-1 1H6a1 1 0 01-1-1V6z" })] }) }) }), active ? (_jsx("span", { "aria-label": "Active", title: "Active", style: { display: 'inline-flex', alignItems: 'center', color: '#065F46' }, children: _jsx("svg", { width: "16", height: "16", viewBox: "0 0 20 20", fill: "currentColor", "aria-hidden": "true", children: _jsx("path", { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.172 7.707 8.879a1 1 0 10-1.414 1.414l2 2a1 1 0 001.414 0l4-4z", clipRule: "evenodd" }) }) })) : (_jsx("span", { style: {
                    padding: '1px 6px',
                    borderRadius: 8,
                    fontSize: 10,
                    fontWeight: 700,
                    background: '#FEF2F2',
                    color: '#991B1B',
                    border: '1px solid #FECACA',
                }, children: "INACTIVE" }))] }));
};
const StatusBadge = () => {
    const rec = useRecordContext();
    const notify = useNotify();
    const refresh = useRefresh();
    const [open, setOpen] = React.useState(false);
    const [mode, setMode] = React.useState('idle');
    const [reason, setReason] = React.useState('');
    const status = String(rec?.status || '').toLowerCase();
    const pretty = (status === 'pending_review' ? 'PENDING' :
        status === 'approved' ? 'APPROVED' :
            status === 'rejected' ? 'REJECTED' :
                status === 'draft' ? 'DRAFT' : (rec?.status || ''));
    const cls = (status === 'approved' ? 'background: #ECFDF5; color:#065F46; border:1px solid #A7F3D0;' :
        status === 'rejected' ? 'background: #FEF2F2; color:#991B1B; border:1px solid #FECACA;' :
            status === 'pending_review' ? 'background:#FFFBEB; color:#92400E; border:1px solid #FDE68A;' :
                'background:#F3F4F6; color:#111827; border:1px solid #E5E7EB;');
    const doApprove = async () => {
        try {
            await window.raDataProvider.approveListing(rec.id);
            notify('Listing approved', { type: 'info' });
            setOpen(false);
            refresh();
        }
        catch (e) {
            notify(e.message || 'Approve failed', { type: 'warning' });
        }
    };
    const doReject = async () => {
        try {
            await window.raDataProvider.rejectListing(rec.id, reason || undefined);
            notify('Listing rejected', { type: 'info' });
            setOpen(false);
            setMode('idle');
            setReason('');
            refresh();
        }
        catch (e) {
            notify(e.message || 'Reject failed', { type: 'warning' });
        }
    };
    const canApprove = status === 'pending_review' || status === 'rejected' || status === '';
    const canReject = status === 'pending_review' || status === 'approved' || status === '';
    const handleOpen = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
    };
    const handleKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx(Tooltip, { title: "Change status", arrow: true, children: _jsx("span", { onClick: handleOpen, onMouseDown: (e) => { e.stopPropagation(); }, onKeyDown: handleKey, role: "button", tabIndex: 0, style: {
                        position: 'relative',
                        zIndex: 20,
                        cursor: 'pointer',
                        padding: '2px 6px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 600,
                        ...styleFromString(cls),
                    }, children: pretty }) }), _jsxs(Dialog, { open: open, onClose: () => { setOpen(false); setMode('idle'); setReason(''); }, maxWidth: "xs", fullWidth: true, onClick: (e) => { e.stopPropagation(); }, onMouseDown: (e) => { e.stopPropagation(); }, children: [_jsx(DialogTitle, { children: mode === 'reject' ? 'Reject listing' : 'Change status' }), _jsxs(DialogContent, { onClick: (e) => e.stopPropagation(), onMouseDown: (e) => e.stopPropagation(), children: [_jsxs("div", { style: { fontSize: 14, marginTop: 4, marginBottom: 8 }, children: ["Current status: ", _jsx("strong", { children: pretty })] }), mode === 'reject' ? (_jsx(MUITextField, { label: "Rejection reason (optional)", placeholder: "Add a short note for the provider", value: reason, onChange: (e) => setReason(e.target.value), fullWidth: true, multiline: true, minRows: 3, onClick: (e) => e.stopPropagation(), onMouseDown: (e) => e.stopPropagation() })) : (_jsx("div", { style: { fontSize: 13, color: '#555' }, children: "Choose a new status action below." }))] }), _jsxs(DialogActions, { onClick: (e) => e.stopPropagation(), onMouseDown: (e) => e.stopPropagation(), children: [_jsx(Button, { label: "Cancel", onClick: () => { setOpen(false); setMode('idle'); setReason(''); } }), mode === 'reject' ? (_jsx(Button, { label: "Confirm Reject", onClick: doReject })) : (_jsxs(_Fragment, { children: [canReject && _jsx(Button, { label: "Reject", onClick: (e) => { e?.stopPropagation?.(); setMode('reject'); } }), canApprove && _jsx(Button, { label: "Approve", onClick: doApprove })] }))] })] })] }));
};
function styleFromString(styleStr) {
    return styleStr.split(';').reduce((acc, decl) => {
        const [k, v] = decl.split(':').map((s) => s && s.trim());
        if (k && v)
            acc[k] = v;
        return acc;
    }, {});
}
const BulkApprove = () => {
    const { selectedIds } = useListContext();
    const refresh = useRefresh();
    const notify = useNotify();
    const { permissions } = usePermissions();
    const canModerate = permissions === 'content' || permissions === 'admin' || permissions === 'superadmin';
    if (!canModerate)
        return null;
    const run = async () => {
        if (!selectedIds?.length)
            return notify('Select rows first', { type: 'warning' });
        try {
            const base = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
            await fetch(base + '/listings/bulk_approve', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('booka_admin_token')}` }, body: JSON.stringify({ ids: selectedIds })
            });
            notify('Approved');
            refresh();
        }
        catch (e) {
            notify(e.message || 'Bulk approve failed', { type: 'warning' });
        }
    };
    return _jsx(Button, { label: "Approve Selected", onClick: run, startIcon: _jsx(CheckIcon, {}) });
};
const BulkReject = () => {
    const { selectedIds } = useListContext();
    const refresh = useRefresh();
    const notify = useNotify();
    const { permissions } = usePermissions();
    const canModerate = permissions === 'content' || permissions === 'admin' || permissions === 'superadmin';
    if (!canModerate)
        return null;
    const run = async () => {
        if (!selectedIds?.length)
            return notify('Select rows first', { type: 'warning' });
        const reason = prompt('Reason (optional)') || undefined;
        try {
            const base = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
            await fetch(base + '/listings/bulk_reject', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('booka_admin_token')}` }, body: JSON.stringify({ ids: selectedIds, reason })
            });
            notify('Rejected');
            refresh();
        }
        catch (e) {
            notify(e.message || 'Bulk reject failed', { type: 'warning' });
        }
    };
    return _jsx(Button, { label: "Reject Selected", onClick: run, startIcon: _jsx(CloseIcon, {}) });
};
const BulkActions = () => (_jsxs(Stack, { direction: "row", spacing: 1, sx: { p: 1 }, children: [_jsx(BulkApprove, {}), _jsx(BulkReject, {})] }));
export const ListingList = () => (_jsxs(List, { filters: listingFilters, sort: { field: 'updated_at', order: 'DESC' }, perPage: 25, bulkActionButtons: _jsx(BulkActions, {}), children: [_jsx(EphemeralProviderFilter, {}), _jsx(ClearProviderFilterButton, {}), _jsxs(Datagrid, { rowClick: "show", children: [_jsx(TextField, { source: "id" }), _jsx(FunctionField, { label: "Service Name", render: () => _jsx(TitleWithThumb, {}) }), _jsx(ReferenceField, { label: "Provider", source: "provider_id", reference: "providers", children: _jsx(ProviderCellInner, {}) }), _jsx(TextField, { source: "category" }), _jsx(DateField, { source: "updated_at", label: "Updated At", showTime: true }), _jsx(FunctionField, { label: "Status", render: () => _jsx(StatusBadge, {}) })] })] }));
// If navigated from Providers with ?provider=ID&ephemeral=1, apply provider filter once,
// then clean the URL to avoid persistence on refresh/navigation.
const EphemeralProviderFilter = () => {
    const { setFilters, filterValues, displayedFilters } = useListContext();
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
                    setFilters({ ...filterValues, provider_id: provider }, displayedFilters);
                }
            }
        }
        catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);
    return null;
};
// Small control to clear only the provider filter (if applied)
const ClearProviderFilterButton = () => {
    const { setFilters, filterValues, displayedFilters } = useListContext();
    const providerId = filterValues?.provider_id;
    if (!providerId)
        return null;
    return (_jsx("div", { style: { display: 'flex', justifyContent: 'flex-start', margin: '8px 8px 0' }, children: _jsx(Button, { label: "Clear provider filter", onClick: () => {
                const next = { ...filterValues };
                delete next.provider_id;
                setFilters(next, displayedFilters);
            } }) }));
};
// expose dataProvider to window to simplify calling custom actions
export const attachDP = (dp) => { window.raDataProvider = dp; };
const ModerationLogs = () => {
    const rec = useRecordContext();
    const [logs, setLogs] = React.useState([]);
    const notify = useNotify();
    React.useEffect(() => {
        let aborted = false;
        const run = async () => {
            try {
                const base = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
                const res = await fetch(`${base}/listings/${rec.id}/moderation_logs`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('booka_admin_token')}` }
                });
                if (!res.ok)
                    throw new Error(`Failed: ${res.status}`);
                const data = await res.json();
                if (!aborted)
                    setLogs(data);
            }
            catch (e) {
                if (!aborted)
                    notify(e.message || 'Failed to load logs', { type: 'warning' });
            }
        };
        if (rec?.id)
            run();
        return () => { aborted = true; };
    }, [rec?.id]);
    if (!rec)
        return null;
    return (_jsxs("div", { style: { marginTop: 16 }, children: [_jsx("h3", { children: "Moderation Logs" }), logs.length === 0 ? (_jsx("div", { children: "No logs" })) : (_jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { textAlign: 'left', padding: 4 }, children: "When" }), _jsx("th", { style: { textAlign: 'left', padding: 4 }, children: "Action" }), _jsx("th", { style: { textAlign: 'left', padding: 4 }, children: "Reason" }), _jsx("th", { style: { textAlign: 'left', padding: 4 }, children: "Admin" })] }) }), _jsx("tbody", { children: logs.map(l => (_jsxs("tr", { children: [_jsx("td", { style: { padding: 4 }, children: new Date(l.at).toLocaleString() }), _jsx("td", { style: { padding: 4 }, children: l.action }), _jsx("td", { style: { padding: 4 }, children: l.reason || '' }), _jsx("td", { style: { padding: 4 }, children: l.admin_id })] }, l.id))) })] }))] }));
};
// Media helpers
const getMediaUrl = (url) => {
    if (!url)
        return null;
    if (/^https?:\/\//i.test(url) || /^data:/i.test(url))
        return url;
    try {
        const origin = new URL(import.meta.env.VITE_API_URL).origin;
        const path = url.startsWith('/static/') ? url : `/static/${url.replace(/^\/+/, '')}`;
        return `${origin}${path}`;
    }
    catch {
        return url;
    }
};
const MediaPreview = ({ url, title }) => {
    const src = getMediaUrl(url || undefined);
    if (!src)
        return null;
    const lower = src.toLowerCase();
    const isImage = /(\.png|\.jpg|\.jpeg|\.webp|\.gif)(\?|$)/.test(lower);
    const isVideo = /(\.mp4|\.webm|\.ogg)(\?|$)/.test(lower);
    return (_jsxs("div", { style: { marginTop: 12 }, children: [isImage && (_jsx("img", { src: src, alt: title || 'media', style: { maxWidth: '100%', borderRadius: 8, border: '1px solid #eee' } })), isVideo && (_jsx("video", { src: src, controls: true, style: { maxWidth: '100%', borderRadius: 8, border: '1px solid #eee' } })), !isImage && !isVideo && (_jsx("a", { href: src, target: "_blank", rel: "noreferrer", children: "Open media" }))] }));
};
const ListingMediaPreview = () => {
    const rec = useRecordContext();
    return _jsx(MediaPreview, { url: rec?.media_url, title: rec?.title });
};
const ListingThumbnail = () => {
    const rec = useRecordContext();
    const src = getMediaUrl(rec?.media_url);
    if (!src)
        return null;
    return (_jsx("img", { src: src, alt: rec?.title || 'thumb', style: { width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' } }));
};
const getProviderIdFromRecord = (rec) => {
    if (!rec)
        return null;
    const nested = rec.provider?.id || rec.provider?.provider_id || rec.provider?.user_id || rec.owner?.id || rec.owner?.provider_id;
    return (nested ??
        rec.provider_id ?? rec.providerId ?? rec.user_id ?? rec.userId ??
        rec.service_provider_id ?? rec.serviceProviderId ?? rec.owner_id ?? rec.ownerId ?? null);
};
// Backend now includes provider_id on listings; no scan/cache needed.
const ProviderEmailField = () => {
    const dp = useDataProvider();
    const rec = useRecordContext();
    const [email, setEmail] = React.useState(null);
    React.useEffect(() => {
        let aborted = false;
        const run = async () => {
            try {
                const pid = getProviderIdFromRecord(rec);
                if (!pid) {
                    if (!aborted)
                        setEmail(null);
                    return;
                }
                const res = await dp.getOne('providers', { id: pid });
                if (!aborted)
                    setEmail(res?.data?.email ?? null);
            }
            catch {
                if (!aborted)
                    setEmail(null);
            }
        };
        run();
        return () => { aborted = true; };
    }, [dp, rec]);
    if (!email)
        return _jsx("span", { children: "\u2014" });
    return _jsx("a", { href: `mailto:${email}`, children: email });
};
const MediaUrlCompact = () => {
    const rec = useRecordContext();
    const url = rec?.media_url;
    if (!url)
        return _jsx("span", { children: "\u2014" });
    const short = url.length > 48 ? url.slice(0, 44) + '…' : url;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
        }
        catch { }
    };
    return (_jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [_jsx(Tooltip, { title: url, children: _jsx("span", { style: { maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: short }) }), _jsx(IconButton, { size: "small", onClick: copy, "aria-label": "Copy media URL", children: _jsx(ContentCopyIcon, { fontSize: "inherit" }) })] }));
};
export const ListingShow = () => (_jsx(Show, { children: _jsxs(SimpleShowLayout, { children: [_jsx(ProviderStatusBanner, {}), _jsx(TextField, { source: "id" }), _jsx(TextField, { source: "title" }), _jsx(TextField, { source: "description" }), _jsx(MediaUrlCompact, {}), _jsx(ListingThumbnail, {}), _jsx(ListingMediaPreview, {}), _jsx(ProviderIdField, {}), _jsx(ProviderEmailField, {}), _jsx(TextField, { source: "price" }), _jsx(TextField, { source: "currency" }), _jsx(TextField, { source: "duration_minutes" }), _jsx(TextField, { source: "display_order" }), _jsx(TextField, { source: "service_category_id" }), _jsx(TextField, { source: "category" }), _jsx(TextField, { source: "status" }), _jsx(DateField, { source: "updated_at", showTime: true }), _jsx(ApproveReject, {}), _jsx(ModerationLogs, {})] }) }));
const ProviderIdField = () => {
    const rec = useRecordContext();
    const pid = getProviderIdFromRecord(rec);
    return _jsx("span", { children: pid || '—' });
};
const ProviderStatusBanner = () => {
    const dp = useDataProvider();
    const rec = useRecordContext();
    const [status, setStatus] = React.useState('unknown');
    React.useEffect(() => {
        let aborted = false;
        const run = async () => {
            try {
                const pid = getProviderIdFromRecord(rec);
                if (!pid) {
                    if (!aborted)
                        setStatus('missing');
                    return;
                }
                const res = await dp.getOne('providers', { id: pid });
                const active = !!res?.data?.is_active;
                if (!aborted)
                    setStatus(active ? 'active' : 'inactive');
            }
            catch {
                if (!aborted)
                    setStatus('missing');
            }
        };
        run();
        return () => { aborted = true; };
    }, [dp, rec]);
    if (status === 'active' || status === 'unknown')
        return null;
    const msg = status === 'inactive' ? 'Provider is deactivated — read-only' : 'Provider is deleted — listing is archived';
    return (_jsx("div", { style: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, padding: 8, fontWeight: 600 }, children: msg }));
};

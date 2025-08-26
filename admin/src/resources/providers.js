import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, BooleanField, TextInput, SelectInput, useDataProvider, useNotify, useRefresh, useRecordContext, Show, SimpleShowLayout, TopToolbar, ShowButton, Button, ExportButton, useListContext, } from 'react-admin';
import React from 'react';
import { Card, CardContent, Divider, Tooltip, useMediaQuery, IconButton } from '@mui/material';
import { useRedirect, SimpleList, FunctionField } from 'react-admin';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import ConfirmButton from '../components/ConfirmButton';
const providerFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true }, "q"),
    _jsx(SelectInput, { source: "is_active", label: "Status", choices: [
            { id: true, name: 'Active' },
            { id: false, name: 'Inactive' },
        ] }, "is_active"),
];
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
const RowActions = () => {
    const record = useRecordContext();
    const dp = useDataProvider();
    const notify = useNotify();
    const refresh = useRefresh();
    const redirect = useRedirect();
    if (!record)
        return null;
    const onToggleActive = async () => {
        try {
            if (record.is_active)
                await dp.deactivateProvider(record.id);
            else
                await dp.activateProvider(record.id);
            notify(record.is_active ? 'app.provider.deactivated' : 'app.provider.activated', { type: 'info' });
            refresh();
        }
        catch (e) {
            notify(e?.message || 'Action failed', { type: 'warning' });
        }
    };
    const onMessage = async () => {
        const content = window.prompt('Message to provider');
        if (!content)
            return;
        try {
            await dp.messageProvider(record.id, content);
            notify('app.message.sent', { type: 'info' });
        }
        catch (e) {
            notify(e?.message || 'Send failed', { type: 'warning' });
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx(ShowButton, { label: "Details" }), _jsx(Tooltip, { title: "Open Public Profile", arrow: true, children: _jsx(IconButton, { "aria-label": "Open Public Profile", onClick: () => window.open(`${getPublicOrigin()}/service-providers/${record.id}`, '_blank', 'noopener,noreferrer'), size: "small", sx: { color: '#0f766e' }, children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 20 20", fill: "currentColor", "aria-hidden": "true", children: [_jsx("path", { d: "M14 3h3a1 1 0 011 1v3a1 1 0 11-2 0V6.414l-6.293 6.293a1 1 0 01-1.414-1.414L14.586 5H14a1 1 0 110-2z" }), _jsx("path", { d: "M5 6a1 1 0 011-1h3a1 1 0 110 2H7v7h7v-2a1 1 0 112 0v3a1 1 0 01-1 1H6a1 1 0 01-1-1V6z" })] }) }) }), _jsx(ConfirmButton, { label: record.is_active ? 'Deactivate' : 'Activate', confirmTitle: record.is_active ? 'Deactivate provider?' : 'Activate provider?', confirmContent: record.is_active ? 'The provider will no longer appear publicly.' : 'The provider will be re-enabled.', onConfirm: onToggleActive }), _jsx(Button, { label: "Message", onClick: onMessage })] }));
};
const ServicesLinkCell = () => {
    const rec = useRecordContext();
    if (!rec)
        return _jsx("span", { children: "\u2014" });
    const display = typeof rec.services_count === 'number' ? rec.services_count : (rec.services_count || 0);
    const label = (rec.business_name || rec.email || ('#' + rec.id)).toString();
    const to = `/listings?provider=${encodeURIComponent(String(rec.id))}&ephemeral=1`;
    return (_jsx(Tooltip, { title: `View services for ${label}`, arrow: true, children: _jsx(Link, { to: to, style: { color: '#0f766e', textDecoration: 'none', fontWeight: 600 }, children: display }) }));
};
export const ProviderList = () => {
    const isSmall = useMediaQuery('(max-width:600px)');
    const location = useLocation();
    const isDeletedView = location.pathname.includes('/providers/deleted');
    const redirect = useRedirect();
    const ActionsBar = (_jsxs(TopToolbar, { children: [_jsx(ExportButton, {}), isDeletedView ? (_jsx(Button, { label: "Active Providers", onClick: () => redirect('/providers') })) : (_jsx(Button, { label: "Deleted Providers", onClick: () => redirect('/providers/deleted') }))] }));
    return (_jsx(List, { filters: providerFilters, filterDefaultValues: isDeletedView ? { is_active: false } : undefined, perPage: 25, sort: { field: 'created_at', order: 'DESC' }, actions: ActionsBar, children: isSmall ? (_jsx(SimpleList, { primaryText: (r) => r.email, secondaryText: (r) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(), tertiaryText: (r) => r.location || '', linkType: "show" })) : (_jsxs(Datagrid, { rowClick: false, bulkActionButtons: isDeletedView ? false : _jsx(BulkActions, {}), size: "small", children: [_jsx(TextField, { source: "id", label: "ID" }), _jsx(TextField, { source: "email" }), _jsx(TextField, { source: "first_name", label: "First" }), _jsx(TextField, { source: "last_name", label: "Last" }), _jsx(TextField, { source: "phone_number", label: "Phone" }), _jsx(TextField, { source: "business_name", label: "Business" }), _jsx(TextField, { source: "location" }), _jsx(FunctionField, { label: "# Services", render: () => _jsx(ServicesLinkCell, {}) }), _jsx(BooleanField, { source: "is_active" }), _jsx(BooleanField, { source: "is_verified" }), _jsx(DateField, { source: "created_at" }), isDeletedView ? null : _jsx(RowActions, {})] })) }));
};
const PublicProfileButton = () => {
    const rec = useRecordContext();
    if (!rec?.id)
        return null;
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
    const url = `${getPublicOrigin()}/service-providers/${rec.id}`;
    return (_jsx(Tooltip, { title: "Open Public Profile", arrow: true, children: _jsx(Button, { label: "Public Profile", onClick: () => window.open(url, '_blank', 'noopener,noreferrer'), startIcon: (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 20 20", fill: "currentColor", "aria-hidden": "true", children: [_jsx("path", { d: "M14 3h3a1 1 0 011 1v3a1 1 0 11-2 0V6.414l-6.293 6.293a1 1 0 01-1.414-1.414L14.586 5H14a1 1 0 110-2z" }), _jsx("path", { d: "M5 6a1 1 0 011-1h3a1 1 0 110 2H7v7h7v-2a1 1 0 112 0v3a1 1 0 01-1 1H6a1 1 0 01-1-1V6z" })] })) }) }));
};
export const ProviderShow = () => (_jsx(Show, { actions: _jsx(TopToolbar, { children: _jsx(PublicProfileButton, {}) }), children: _jsxs(SimpleShowLayout, { children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "email" }), _jsx(TextField, { source: "first_name" }), _jsx(TextField, { source: "last_name" }), _jsx(TextField, { source: "phone_number" }), _jsx(BooleanField, { source: "is_active" }), _jsx(BooleanField, { source: "is_verified" }), _jsx(TextField, { source: "business_name" }), _jsx(TextField, { source: "location" }), _jsx(TextField, { source: "services_count" }), _jsx(DateField, { source: "created_at" }), _jsx(ConversationPanel, {})] }) }));
const ConversationPanel = () => {
    const record = useRecordContext();
    const dp = useDataProvider();
    const notify = useNotify();
    const refresh = useRefresh();
    const [messages, setMessages] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const redirect2 = useRedirect();
    const load = async () => {
        if (!record?.id)
            return;
        setLoading(true);
        try {
            const data = await dp.getProviderThread(record.id);
            setMessages(data.messages);
        }
        catch (e) {
            notify(e?.message || 'Failed to load conversation', { type: 'warning' });
        }
        finally {
            setLoading(false);
        }
    };
    React.useEffect(() => { void load(); }, [record?.id]);
    const onSend = async () => {
        const content = window.prompt('Reply to provider');
        if (!content)
            return;
        try {
            await dp.messageProvider(record.id, content);
            notify('app.message.sent', { type: 'info' });
            await load();
        }
        catch (e) {
            notify(e?.message || 'Send failed', { type: 'warning' });
        }
    };
    const onUnlist = async () => {
        try {
            await dp.unlistProvider(record.id);
            notify('app.provider.all_unlisted', { type: 'info' });
            refresh();
        }
        catch (e) {
            notify(e?.message || 'Unlist failed', { type: 'warning' });
        }
    };
    return (_jsx(Card, { variant: "outlined", sx: { mt: 2 }, children: _jsxs(CardContent, { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("h3", { style: { margin: 0 }, children: "Support Conversation" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx(Button, { label: "Send message", onClick: onSend }), _jsx(ConfirmButton, { label: "Unlist all services", confirmTitle: "Unlist all services?", confirmContent: "All listings for this provider will be set to rejected.", onConfirm: onUnlist }), _jsx(ConfirmButton, { label: "Purge provider", color: "error", confirmTitle: "Type provider email to confirm purge", confirmPlaceholder: "email@example.com", confirmTextRequired: record?.email, onConfirm: async (val) => {
                                        // 1) Unlist ALL listings for this provider to remove them from public view
                                        try {
                                            await dp.unlistProvider(record.id);
                                        }
                                        catch { }
                                        // 2) Extra safety: explicitly reject ALL listings so they never appear pending
                                        try {
                                            const all = await dp.getList('listings', {
                                                pagination: { page: 1, perPage: 1000 },
                                                sort: { field: 'id', order: 'ASC' },
                                                filter: { provider_id: record.id },
                                            });
                                            const toReject = (all?.data || []).filter((l) => String(l.status).toLowerCase() !== 'rejected').map((l) => l.id);
                                            if (toReject.length) {
                                                const base = (dp.API_URL) || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
                                                await fetch(base + '/listings/bulk_reject', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${localStorage.getItem('booka_admin_token')}`
                                                    },
                                                    body: JSON.stringify({ ids: toReject, reason: 'Provider purged' }),
                                                });
                                            }
                                        }
                                        catch { }
                                        // 3) Purge the provider account
                                        await dp.purgeProvider(record.id, val, true);
                                        notify('app.provider.purged', { type: 'info' });
                                        redirect2('/providers');
                                    } })] })] }), _jsx(Divider, { sx: { my: 2 } }), loading ? (_jsx("p", { children: "Loading\u2026" })) : messages.length === 0 ? (_jsx("p", { children: "No messages yet." })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: messages.map(m => (_jsxs("div", { style: { padding: 8, border: '1px solid #eee', borderRadius: 6 }, children: [_jsxs("div", { style: { fontSize: 12, color: '#666' }, children: [new Date(m.created_at).toLocaleString(), " \u00B7 ", m.sender_type || 'user'] }), _jsx("div", { style: { marginTop: 4 }, children: m.content })] }, m.id))) }))] }) }));
};
const BulkActions = () => {
    const { selectedIds } = useListContext();
    const dp = useDataProvider();
    const notify = useNotify();
    const refresh = useRefresh();
    if (!selectedIds || selectedIds.length === 0)
        return null;
    const run = async (fn, msgKey) => {
        try {
            await Promise.all(selectedIds.map((id) => fn(id)));
            notify(msgKey, { type: 'info' });
            refresh();
        }
        catch (e) {
            notify(e?.message || 'Action failed', { type: 'warning' });
        }
    };
    return (_jsxs("div", { style: { display: 'flex', gap: 8, padding: 8 }, children: [_jsx(Button, { label: "Deactivate", onClick: () => run((id) => dp.deactivateProvider(id), 'app.provider.deactivated') }), _jsx(Button, { label: "Activate", onClick: () => run((id) => dp.activateProvider(id), 'app.provider.activated') }), _jsx(Button, { label: "Unlist all", onClick: () => run((id) => dp.unlistProvider(id), 'app.provider.all_unlisted') })] }));
};

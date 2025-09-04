import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, BooleanField, TextInput, TopToolbar, Button, useRecordContext, useDataProvider, useNotify, useRefresh, SimpleList, } from 'react-admin';
import { useMediaQuery } from '@mui/material';
const clientFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true }, "q"),
    _jsx(TextInput, { source: "email", label: "Email" }, "email"),
];
const ExportCSVButton = () => {
    const dp = useDataProvider();
    const handle = async () => {
        try {
            const base = (dp?.API_URL) || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
            const token = localStorage.getItem('booka_admin_token');
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
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.warn('CSV export failed', e);
        }
    };
    return _jsx(Button, { label: "Export CSV", onClick: () => void handle() });
};
const RowActions = () => {
    const rec = useRecordContext();
    const dp = useDataProvider();
    const notify = useNotify();
    const refresh = useRefresh();
    if (!rec)
        return null;
    const onToggleActive = async () => {
        try {
            if (rec.is_active)
                await dp.deactivateClient(rec.id);
            else
                await dp.activateClient(rec.id);
            notify(rec.is_active ? 'Client deactivated' : 'Client activated', { type: 'info' });
            refresh();
        }
        catch (e) {
            notify('Action failed', { type: 'warning' });
        }
    };
    const onImpersonate = async () => {
        try {
            const { token } = await dp.impersonateClient(rec.id);
            await navigator.clipboard.writeText(token);
            notify('Impersonation token copied to clipboard', { type: 'info' });
        }
        catch (e) {
            notify('Failed to impersonate', { type: 'warning' });
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx(Button, { label: rec.is_active ? 'Deactivate' : 'Activate', onClick: () => void onToggleActive() }), _jsx(Button, { label: "Impersonate", onClick: () => void onImpersonate() })] }));
};
export const ClientList = () => {
    const isSmall = useMediaQuery('(max-width:600px)');
    const Actions = (_jsx(TopToolbar, { children: _jsx(ExportCSVButton, {}) }));
    return (_jsx(List, { filters: clientFilters, perPage: 25, sort: { field: 'created_at', order: 'DESC' }, actions: Actions, children: isSmall ? (_jsx(SimpleList, { primaryText: (r) => r.email, secondaryText: (r) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(), tertiaryText: (r) => `Paid: ${r.bookings_paid_count ?? 0} · Completed: ${r.bookings_completed_count ?? 0}` })) : (_jsxs(Datagrid, { rowClick: false, bulkActionButtons: false, size: "small", children: [_jsx(TextField, { source: "id", label: "ID" }), _jsx(TextField, { source: "email" }), _jsx(TextField, { source: "first_name", label: "First" }), _jsx(TextField, { source: "last_name", label: "Last" }), _jsx(TextField, { source: "phone_number", label: "Phone" }), _jsx(TextField, { source: "bookings_paid_count", label: "Paid Bookings" }), _jsx(TextField, { source: "bookings_completed_count", label: "Completed" }), _jsx(BooleanField, { source: "is_active" }), _jsx(BooleanField, { source: "is_verified" }), _jsx(DateField, { source: "created_at" }), _jsx(RowActions, {})] })) }));
};
export default ClientList;

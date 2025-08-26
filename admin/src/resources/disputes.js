import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, SelectInput, TextInput, Show, SimpleShowLayout, Button, useRecordContext, useNotify, useRefresh, usePermissions } from 'react-admin';
import { Stack } from '@mui/material';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import InfoIcon from '@mui/icons-material/Info';
import DoneAllIcon from '@mui/icons-material/DoneAll';
const disputeFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "q"),
    _jsx(SelectInput, { source: "status", size: "small", margin: "dense", variant: "outlined", choices: [
            { id: 'open', name: 'Open' },
            { id: 'needs_info', name: 'Needs Info' },
            { id: 'resolved_refund', name: 'Resolved (Refund)' },
            { id: 'resolved_release', name: 'Resolved (Release)' },
            { id: 'denied', name: 'Denied' },
        ], alwaysOn: true }, "status")
];
export const DisputeList = () => (_jsx(List, { filters: disputeFilters, perPage: 25, sort: { field: 'created_at', order: 'DESC' }, children: _jsxs(Datagrid, { rowClick: "show", children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "booking_id" }), _jsx(TextField, { source: "status" }), _jsx(TextField, { source: "reason" }), _jsx(DateField, { source: "created_at", showTime: true })] }) }));
export const DisputeShow = () => (_jsx(Show, { children: _jsxs(SimpleShowLayout, { children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "booking_id" }), _jsx(TextField, { source: "status" }), _jsx(TextField, { source: "reason" }), _jsx(DateField, { source: "created_at", showTime: true }), _jsx(ActionsBar, {})] }) }));
const ActionsBar = () => {
    const rec = useRecordContext();
    const notify = useNotify();
    const refresh = useRefresh();
    const { permissions } = usePermissions();
    const canAct = ['trust', 'admin', 'superadmin'].includes(permissions);
    if (!canAct)
        return null;
    const base = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/admin`;
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('booka_admin_token')}` };
    const assign = async () => {
        try {
            await fetch(`${base}/disputes/${rec.id}/assign`, { method: 'POST', headers, body: JSON.stringify({}) });
            notify('Assigned');
            refresh();
        }
        catch (e) {
            notify(e.message || 'Failed', { type: 'warning' });
        }
    };
    const requestInfo = async () => {
        const note = prompt('Request info note');
        if (note === null)
            return;
        try {
            await fetch(`${base}/disputes/${rec.id}/request_info`, { method: 'POST', headers, body: JSON.stringify({ note }) });
            notify('Requested info');
            refresh();
        }
        catch (e) {
            notify(e.message || 'Failed', { type: 'warning' });
        }
    };
    const resolve = async () => {
        const outcome = prompt('Outcome (resolved_refund | resolved_release | denied)');
        if (!outcome)
            return;
        const note = prompt('Resolution note (optional)') || undefined;
        try {
            await fetch(`${base}/disputes/${rec.id}/resolve`, { method: 'POST', headers, body: JSON.stringify({ outcome, note }) });
            notify('Resolved');
            refresh();
        }
        catch (e) {
            notify(e.message || 'Failed', { type: 'warning' });
        }
    };
    return (_jsxs(Stack, { direction: "row", spacing: 1, sx: { mt: 2 }, children: [_jsx(Button, { label: "Assign to me", startIcon: _jsx(AssignmentIndIcon, {}), onClick: assign }), _jsx(Button, { label: "Request Info", startIcon: _jsx(InfoIcon, {}), onClick: requestInfo }), _jsx(Button, { label: "Resolve", startIcon: _jsx(DoneAllIcon, {}), onClick: resolve })] }));
};

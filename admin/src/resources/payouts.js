import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, SelectInput, TextInput, useRecordContext, useNotify, useRefresh, FunctionField } from 'react-admin';
import MoneyCell from '../components/MoneyCell';
import TimeCell from '../components/TimeCell';
import StatusBadge from '../components/StatusBadge';
import { Button, Stack, Tooltip, IconButton, Typography, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
const payoutFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "q"),
    _jsx(SelectInput, { source: "status", size: "small", margin: "dense", variant: "outlined", choices: [
            { id: 'queued', name: 'Queued' },
            { id: 'paid', name: 'Paid' },
            { id: 'failed', name: 'Failed' },
            { id: 'blocked', name: 'Blocked' },
        ], alwaysOn: true }, "status")
];
const Actions = () => {
    const rec = useRecordContext();
    const notify = useNotify();
    const refresh = useRefresh();
    const markPaid = async () => {
        const method = prompt('Payout method (e.g., EFT)') || 'EFT';
        const reference = prompt('Reference (required)');
        if (!reference) {
            notify('Reference required', { type: 'warning' });
            return;
        }
        try {
            const dp = window.raDataProvider;
            await dp.httpClient(`${dp.API_URL}/payouts/${rec.id}/mark-paid`, {
                method: 'POST',
                body: JSON.stringify({ method, reference }),
            });
            notify('Payout marked paid');
            refresh();
        }
        catch (e) {
            notify(e.message || 'Failed', { type: 'warning' });
        }
    };
    const viewPdf = async () => {
        const dp = window.raDataProvider;
        try {
            const { json } = await dp.httpClient(`${dp.API_URL}/payouts/${rec.id}/pdf-url`, { method: 'GET' });
            const url = (json && json.url) ? json.url : null;
            if (url) {
                window.open(url, '_blank');
                return;
            }
            throw new Error('No URL returned');
        }
        catch (e) {
            // Fallback to direct API (may 403 without headers)
            try {
                const apiBase = dp.API_URL.replace(/\/admin$/, '');
                const url = `${apiBase}/api/v1/payouts/${rec.id}/pdf`;
                window.open(url, '_blank');
            }
            catch { }
        }
    };
    return (_jsxs(Stack, { direction: "row", spacing: 1, children: [_jsx(Button, { size: "small", variant: "outlined", onClick: viewPdf, children: "View PDF" }), _jsx(Button, { size: "small", variant: "contained", onClick: markPaid, children: "Mark Paid" })] }));
};
const CopyButton = ({ value, tooltip }) => {
    const notify = useNotify();
    if (!value)
        return null;
    const onCopy = async (e) => {
        e.preventDefault();
        try {
            await navigator.clipboard.writeText(String(value));
            notify('Copied');
        }
        catch {
            notify('Cannot copy', { type: 'warning' });
        }
    };
    return (_jsx(Tooltip, { title: tooltip, children: _jsx(IconButton, { size: "small", onClick: onCopy, "aria-label": "Copy", children: _jsx(ContentCopyIcon, { style: { fontSize: 14 } }) }) }));
};
const BookingLinkField = () => {
    const rec = useRecordContext();
    const id = rec?.booking_real_id;
    if (!id)
        return _jsx("span", { children: "\u2014" });
    return (_jsxs(Stack, { direction: "row", spacing: 0.5, alignItems: "center", children: [_jsx(Tooltip, { title: "Event record (bookings.id)", children: _jsx(RouterLink, { to: `/bookings/${id}/show`, children: _jsx(Typography, { component: "span", fontSize: 13, fontWeight: 600, children: id }) }) }), _jsx(CopyButton, { value: id, tooltip: "Copy Booking ID" })] }));
};
const SimpleBookingField = () => {
    const rec = useRecordContext();
    const id = rec?.booking_id;
    if (!id)
        return _jsx("span", { children: "\u2014" });
    const filterLink = `/payouts?filter=${encodeURIComponent(JSON.stringify({ booking_id: id }))}`;
    return (_jsxs(Stack, { direction: "row", spacing: 0.5, alignItems: "center", children: [_jsx(Tooltip, { title: "Finance snapshot (bookings_simple.id). Click to filter payouts for this booking.", children: _jsx(RouterLink, { to: filterLink, children: _jsx(Typography, { component: "span", fontSize: 13, fontWeight: 600, children: id }) }) }), _jsx(CopyButton, { value: id, tooltip: "Copy Simple Booking ID" }), _jsx(Tooltip, { title: "Filter payouts to this Simple Booking ID", children: _jsx(IconButton, { size: "small", component: RouterLink, to: filterLink, children: _jsx(FilterAltOutlinedIcon, { fontSize: "inherit" }) }) })] }));
};
const ContactCell = ({ which }) => {
    const rec = useRecordContext();
    const name = which === 'client' ? rec?.client_name : (rec?.provider_name || rec?.artist_name);
    const email = which === 'client' ? rec?.client_email : (rec?.provider_email || rec?.artist_email);
    const phone = which === 'client' ? rec?.client_phone : (rec?.provider_phone || rec?.artist_phone);
    const id = which === 'client' ? rec?.client_id : rec?.provider_id || rec?.artist_id;
    const label = which === 'client' ? 'Client' : 'Artist/Provider';
    if (!name && !email && !phone)
        return _jsx("span", { children: "\u2014" });
    return (_jsxs(Stack, { spacing: 0, alignItems: "flex-start", children: [_jsx(Typography, { variant: "body2", fontWeight: 600, children: name || '—' }), _jsx(Typography, { variant: "caption", color: "text.secondary", children: email || '—' }), _jsx(Typography, { variant: "caption", color: "text.secondary", children: phone || '—' }), id ? _jsxs(Typography, { variant: "caption", color: "text.secondary", children: ["ID: ", id] }) : null] }));
};
const BankingCell = () => {
    const rec = useRecordContext();
    const missing = !!rec?.banking_missing;
    const summary = rec?.banking_summary;
    const bankName = rec?.bank_name;
    const last4 = rec?.bank_account_last4;
    const branch = rec?.bank_branch_code;
    const accountName = rec?.bank_account_name;
    const title = missing
        ? 'Banking details missing. Add bank name and account in the provider profile.'
        : [
            bankName ? `Bank: ${bankName}` : null,
            last4 ? `Account: …${last4}` : null,
            accountName ? `Name: ${accountName}` : null,
            branch ? `Branch: ${branch}` : null,
        ].filter(Boolean).join(' • ');
    return (_jsx(Tooltip, { title: title || '', children: _jsx(Chip, { label: summary || 'Missing', color: missing ? 'error' : 'default', variant: missing ? 'outlined' : 'filled', size: "small", sx: { maxWidth: 180 } }) }));
};
export const PayoutList = () => (_jsx(List, { filters: payoutFilters, perPage: 25, sort: { field: 'created_at', order: 'DESC' }, children: _jsxs(Datagrid, { bulkActionButtons: false, rowClick: false, children: [_jsx(TextField, { source: "id", label: "Payout ID" }), _jsx(FunctionField, { label: "Booking ID", render: () => _jsx(BookingLinkField, {}) }), _jsx(FunctionField, { label: "Simple Booking ID", render: () => _jsx(SimpleBookingField, {}) }), _jsx(FunctionField, { label: "Client", render: () => _jsx(ContactCell, { which: "client" }) }), _jsx(FunctionField, { label: "Artist / Provider", render: () => _jsx(ContactCell, { which: "provider" }) }), _jsx(FunctionField, { label: "Banking", render: () => _jsx(BankingCell, {}) }), _jsx(TextField, { source: "type", label: "Stage" }), _jsx(MoneyCell, { source: "amount" }), _jsx(StatusBadge, { source: "status" }), _jsx(TimeCell, { source: "scheduled_at" }), _jsx(TimeCell, { source: "paid_at" }), _jsx(TextField, { source: "method" }), _jsx(TextField, { source: "reference" }), _jsx(Actions, {})] }) }));

import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from 'react';
import { List, Datagrid, TextField, DateField, TextInput, SelectInput, Show, SimpleShowLayout, useNotify, useRefresh, Button, useRecordContext, usePermissions, FunctionField } from 'react-admin';
import PaymentsIcon from '@mui/icons-material/Payments';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MoneyCell from '../components/MoneyCell';
import TimeCell from '../components/TimeCell';
import { Card, CardContent, Stack, Typography, Divider, Tooltip, IconButton, Chip } from '@mui/material';
import StatusBadge from '../components/StatusBadge';
const bookingFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "q"),
    _jsx(SelectInput, { source: "status", choices: [
            { id: 'requested', name: 'Requested' },
            { id: 'quoted', name: 'Quoted' },
            { id: 'paid_held', name: 'Paid (Held)' },
            { id: 'completed', name: 'Completed' },
            { id: 'disputed', name: 'Disputed' },
            { id: 'refunded', name: 'Refunded' },
            { id: 'cancelled', name: 'Cancelled' },
        ], alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "status")
];
const Actions = () => {
    const rec = useRecordContext();
    const notify = useNotify();
    const refresh = useRefresh();
    const { permissions } = usePermissions();
    const canComplete = ['payments', 'trust', 'admin', 'superadmin'].includes(permissions);
    const canRefund = ['payments', 'admin', 'superadmin'].includes(permissions);
    const markComplete = async () => {
        try {
            await window.raDataProvider.markCompleted(rec.id);
            notify('Booking marked completed');
            refresh();
        }
        catch (e) {
            notify(e.message || 'Failed', { type: 'warning' });
        }
    };
    const refund = async () => {
        const amount = prompt('Refund amount in ZAR (e.g., 250.00)');
        if (!amount)
            return;
        const cents = Math.round(parseFloat(amount) * 100);
        try {
            await window.raDataProvider.refundBooking(rec.id, cents);
            notify(`Refunded R${amount}`);
            refresh();
        }
        catch (e) {
            notify(e.message || 'Refund failed', { type: 'warning' });
        }
    };
    return (_jsxs(_Fragment, { children: [canComplete && _jsx(Button, { label: "Mark Completed", startIcon: _jsx(CheckCircleIcon, {}), onClick: markComplete }), canRefund && _jsx(Button, { label: "Refund", startIcon: _jsx(PaymentsIcon, {}), onClick: refund })] }));
};
const CopyButton = ({ value, tooltip }) => {
    const notify = useNotify();
    if (!value)
        return null;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(String(value));
            notify('Copied');
        }
        catch {
            notify('Cannot copy', { type: 'warning' });
        }
    };
    return (_jsx(Tooltip, { title: tooltip, children: _jsx(IconButton, { size: "small", onClick: copy, children: _jsx(ContentCopyIcon, { fontSize: "inherit" }) }) }));
};
const BookingIdField = ({ kind }) => {
    const rec = useRecordContext();
    const value = kind === 'booking' ? rec?.id : rec?.simple_id;
    const label = kind === 'booking' ? 'Event record (bookings.id)' : 'Finance snapshot (bookings_simple.id)';
    if (!value)
        return _jsx("span", { children: "\u2014" });
    return (_jsxs(Stack, { direction: "row", spacing: 0.5, alignItems: "center", children: [_jsx(Tooltip, { title: label, children: _jsx(Typography, { component: "span", fontSize: 13, fontWeight: 700, fontFamily: "monospace", children: value }) }), _jsx(CopyButton, { value: value, tooltip: `Copy ${kind === 'booking' ? 'Booking' : 'Simple Booking'} ID` })] }));
};
const ContactField = ({ which }) => {
    const rec = useRecordContext();
    const name = which === 'client' ? rec?.client_name : (rec?.provider_name || rec?.artist_name);
    const email = which === 'client' ? rec?.client_email : (rec?.provider_email || rec?.artist_email);
    const phone = which === 'client' ? rec?.client_phone : (rec?.provider_phone || rec?.artist_phone);
    const id = which === 'client' ? rec?.client_id : (rec?.provider_id || rec?.artist_id);
    if (!name && !email && !phone)
        return _jsx("span", { children: "\u2014" });
    return (_jsxs(Stack, { spacing: 0, alignItems: "flex-start", children: [_jsx(Typography, { variant: "body2", fontWeight: 600, children: name || '—' }), _jsx(Typography, { variant: "caption", color: "text.secondary", children: email || '—' }), _jsx(Typography, { variant: "caption", color: "text.secondary", children: phone || '—' }), id ? _jsxs(Typography, { variant: "caption", color: "text.secondary", children: ["ID: ", id] }) : null] }));
};
const BankingSummaryField = () => {
    const rec = useRecordContext();
    const missing = !!rec?.banking_missing;
    const summary = rec?.banking_summary || 'Missing';
    const title = missing
        ? 'Banking details missing. Add bank name and account in provider profile.'
        : [
            rec?.bank_name ? `Bank: ${rec.bank_name}` : null,
            rec?.bank_account_last4 ? `Account: …${rec.bank_account_last4}` : null,
            rec?.bank_account_name ? `Name: ${rec.bank_account_name}` : null,
            rec?.bank_branch_code ? `Branch: ${rec.bank_branch_code}` : null,
        ].filter(Boolean).join(' • ');
    return (_jsx(Tooltip, { title: title || '', children: _jsx(Chip, { label: summary, color: missing ? 'error' : 'default', variant: missing ? 'outlined' : 'filled', size: "small" }) }));
};
export const BookingList = () => (_jsx(List, { filters: bookingFilters, sort: { field: 'created_at', order: 'DESC' }, perPage: 25, children: _jsxs(Datagrid, { rowClick: "show", children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "status" }), _jsx(DateField, { source: "event_date", showTime: true }), _jsx(TextField, { source: "location" }), _jsx(TextField, { source: "client_id", label: "Client" }), _jsx(TextField, { source: "provider_id", label: "Provider" }), _jsx(MoneyCell, { source: "total_amount" }), _jsx(TimeCell, { source: "created_at" })] }) }));
export const BookingShow = () => (_jsx(Show, { actions: _jsx(Actions, {}), children: _jsxs(SimpleShowLayout, { children: [_jsx(FunctionField, { label: "Booking ID", render: () => _jsx(BookingIdField, { kind: "booking" }) }), _jsx(FunctionField, { label: "Simple Booking ID", render: () => _jsx(BookingIdField, { kind: "simple" }) }), _jsx(TextField, { source: "status" }), _jsx(FunctionField, { label: "Client", render: () => _jsx(ContactField, { which: "client" }) }), _jsx(FunctionField, { label: "Artist / Provider", render: () => _jsx(ContactField, { which: "provider" }) }), _jsx(FunctionField, { label: "Banking", render: () => _jsx(BankingSummaryField, {}) }), _jsx(TextField, { source: "listing_id" }), _jsx(DateField, { source: "event_date", showTime: true }), _jsx(TextField, { source: "location" }), _jsx(MoneyCell, { source: "total_amount" }), _jsx(TimeCell, { source: "created_at" }), _jsx(PayoutWorksheet, {})] }) }));
export const attachDPBookings = (dp) => { window.raDataProvider = dp; };
function PayoutWorksheet() {
    const rec = useRecordContext();
    const dp = window.raDataProvider;
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    React.useEffect(() => {
        let mounted = true;
        async function run() {
            try {
                setLoading(true);
                const simpleId = rec?.simple_id;
                if (!simpleId) {
                    setRows([]);
                    return;
                }
                const res = await dp.getList('payouts', {
                    pagination: { page: 1, perPage: 100 },
                    sort: { field: 'id', order: 'ASC' },
                    filter: { booking_id: simpleId },
                });
                if (mounted)
                    setRows(res?.data || []);
            }
            finally {
                if (mounted)
                    setLoading(false);
            }
        }
        run();
        return () => { mounted = false; };
    }, [rec?.id]);
    const meta = React.useMemo(() => {
        // Prefer meta from final50 or first50
        const f = rows.find((r) => String(r.type).toLowerCase() === 'final50');
        const s = rows.find((r) => String(r.type).toLowerCase() === 'first50');
        return (f?.meta || s?.meta || {});
    }, [rows]);
    const Z = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
    const fmt = (v) => Z.format(Number(v || 0));
    if (loading)
        return null;
    if (!rows.length)
        return null;
    return (_jsx(Card, { variant: "outlined", sx: { mt: 2 }, children: _jsx(CardContent, { children: _jsxs(Stack, { spacing: 1, children: [_jsx(Typography, { variant: "h6", children: "Payout Worksheet" }), _jsx(Typography, { variant: "body2", color: "text.secondary", children: "Computed at payment time. Commission base is provider subtotal (services + travel + sound). Client service fee (3% + VAT) is charged to the client and not paid to the provider." }), _jsx(Divider, {}), _jsxs(Stack, { direction: "row", justifyContent: "space-between", children: [_jsx("span", { children: "Provider Subtotal (PS)" }), _jsx("strong", { children: fmt(meta?.provider_subtotal) })] }), _jsxs(Stack, { direction: "row", justifyContent: "space-between", children: [_jsx("span", { children: "Client Service Fee (3% of PS)" }), _jsx("span", { children: fmt(meta?.client_fee) })] }), _jsxs(Stack, { direction: "row", justifyContent: "space-between", children: [_jsx("span", { children: "VAT on Client Fee (15%)" }), _jsx("span", { children: fmt(meta?.client_fee_vat) })] }), _jsx(Divider, {}), _jsxs(Stack, { direction: "row", justifyContent: "space-between", children: [_jsx("span", { children: "Platform Commission (7.5% of PS)" }), _jsxs("span", { children: ["- ", fmt(meta?.commission)] })] }), _jsxs(Stack, { direction: "row", justifyContent: "space-between", children: [_jsx("span", { children: "VAT on Commission (15%)" }), _jsxs("span", { children: ["- ", fmt(meta?.vat_on_commission)] })] }), _jsxs(Stack, { direction: "row", justifyContent: "space-between", children: [_jsx("span", { children: "Provider Net Total (estimate)" }), _jsx("strong", { children: fmt(meta?.provider_net_total_estimate) })] }), _jsx(Divider, {}), _jsx(Typography, { variant: "subtitle2", children: "Stages" }), rows.map((r) => (_jsxs(Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", children: [_jsxs(Stack, { spacing: 0.25, alignItems: "flex-start", children: [_jsxs(Typography, { variant: "body2", fontWeight: 600, children: [String(r.type).toUpperCase(), " \u2022 Payout ", r.id] }), _jsxs(Stack, { direction: "row", spacing: 1, alignItems: "center", children: [_jsx(StatusBadge, { value: r.status }), _jsxs(Typography, { variant: "caption", color: "text.secondary", children: [r.scheduled_at ? `Scheduled ${new Date(r.scheduled_at).toLocaleString()}` : 'Scheduled —', r.paid_at ? ` • Paid ${new Date(r.paid_at).toLocaleString()}` : ''] })] })] }), _jsx(Typography, { component: "span", fontWeight: 700, children: fmt(r.amount) })] }, r.id)))] }) }) }));
}

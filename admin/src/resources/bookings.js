import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, TextInput, SelectInput, NumberField, Show, SimpleShowLayout, useNotify, useRefresh, Button, useRecordContext, usePermissions } from 'react-admin';
import PaymentsIcon from '@mui/icons-material/Payments';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
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
export const BookingList = () => (_jsx(List, { filters: bookingFilters, sort: { field: 'created_at', order: 'DESC' }, perPage: 25, children: _jsxs(Datagrid, { rowClick: "show", children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "status" }), _jsx(DateField, { source: "event_date" }), _jsx(TextField, { source: "location" }), _jsx(NumberField, { source: "total_amount", options: { style: 'currency', currency: 'ZAR' } }), _jsx(DateField, { source: "created_at", showTime: true })] }) }));
export const BookingShow = () => (_jsx(Show, { actions: _jsx(Actions, {}), children: _jsxs(SimpleShowLayout, { children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "status" }), _jsx(TextField, { source: "client_id" }), _jsx(TextField, { source: "provider_id" }), _jsx(TextField, { source: "listing_id" }), _jsx(DateField, { source: "event_date", showTime: true }), _jsx(TextField, { source: "location" }), _jsx(NumberField, { source: "total_amount", options: { style: 'currency', currency: 'ZAR' } }), _jsx(DateField, { source: "created_at", showTime: true })] }) }));
export const attachDPBookings = (dp) => { window.raDataProvider = dp; };

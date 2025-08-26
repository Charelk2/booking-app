import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import * as React from 'react';
import { Card, CardContent, Stack, Typography, Button, TextField } from '@mui/material';
import { Title, useDataProvider, useNotify } from 'react-admin';
export default function PayoutsRun() {
    const dp = useDataProvider();
    const notify = useNotify();
    const [bookingIds, setBookingIds] = React.useState('');
    const createBatch = async () => {
        const ids = bookingIds.split(',').map(s => s.trim()).filter(Boolean);
        if (!ids.length)
            return notify('Add booking IDs (comma-separated)', { type: 'warning' });
        try {
            await dp.createPayoutBatch({ bookingIds: ids });
            notify('Payout batch created', { type: 'info' });
            setBookingIds('');
        }
        catch (e) {
            notify(e.message || 'Failed to create batch', { type: 'warning' });
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx(Title, { title: "Create Payout Batch" }), _jsx(Card, { children: _jsx(CardContent, { children: _jsxs(Stack, { spacing: 2, children: [_jsx(Typography, { variant: "h6", children: "Create Payout Batch" }), _jsx(Typography, { variant: "body2", color: "text.secondary", children: "Paste one or more eligible Booking IDs (comma-separated). The backend will compute provider nets, group by payee, and initiate disbursement via your payout rail." }), _jsx(TextField, { label: "Booking IDs", placeholder: "bk_123, bk_456, bk_789", value: bookingIds, onChange: (e) => setBookingIds(e.target.value), fullWidth: true }), _jsx(Button, { variant: "contained", onClick: createBatch, children: "Create Batch" })] }) }) })] }));
}

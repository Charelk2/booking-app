import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, SelectInput, TextInput } from 'react-admin';
const smsFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "q"),
    _jsx(SelectInput, { source: "status", choices: [
            { id: 'queued', name: 'Queued' },
            { id: 'sent', name: 'Sent' },
            { id: 'delivered', name: 'Delivered' },
            { id: 'undelivered', name: 'Undelivered' },
            { id: 'failed', name: 'Failed' },
        ], alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "status")
];
export const SmsEventList = () => (_jsx(List, { filters: smsFilters, perPage: 50, sort: { field: 'created_at', order: 'DESC' }, children: _jsxs(Datagrid, { children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "sid" }), _jsx(TextField, { source: "to" }), _jsx(TextField, { source: "status" }), _jsx(TextField, { source: "booking_id" }), _jsx(TextField, { source: "user_id" }), _jsx(DateField, { source: "created_at", showTime: true })] }) }));

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, SelectInput, TextInput } from 'react-admin';
const emailFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "q"),
    _jsx(SelectInput, { source: "event", choices: [
            { id: 'processed', name: 'Processed' },
            { id: 'delivered', name: 'Delivered' },
            { id: 'open', name: 'Open' },
            { id: 'click', name: 'Click' },
            { id: 'bounce', name: 'Bounce' },
            { id: 'dropped', name: 'Dropped' },
        ], alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "event")
];
export const EmailEventList = () => (_jsx(List, { filters: emailFilters, perPage: 50, sort: { field: 'created_at', order: 'DESC' }, children: _jsxs(Datagrid, { children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "message_id" }), _jsx(TextField, { source: "to" }), _jsx(TextField, { source: "template" }), _jsx(TextField, { source: "event" }), _jsx(TextField, { source: "booking_id" }), _jsx(TextField, { source: "user_id" }), _jsx(DateField, { source: "created_at", showTime: true })] }) }));

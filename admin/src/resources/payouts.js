import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, NumberField, SelectInput, TextInput } from 'react-admin';
const payoutFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "q"),
    _jsx(SelectInput, { source: "status", size: "small", margin: "dense", variant: "outlined", choices: [
            { id: 'queued', name: 'Queued' },
            { id: 'processing', name: 'Processing' },
            { id: 'paid', name: 'Paid' },
            { id: 'failed', name: 'Failed' },
        ], alwaysOn: true }, "status")
];
export const PayoutList = () => (_jsx(List, { filters: payoutFilters, perPage: 25, sort: { field: 'created_at', order: 'DESC' }, children: _jsxs(Datagrid, { children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "provider_id" }), _jsx(NumberField, { source: "amount", options: { style: 'currency', currency: 'ZAR' } }), _jsx(TextField, { source: "status" }), _jsx(TextField, { source: "batch_id" }), _jsx(DateField, { source: "created_at", showTime: true })] }) }));

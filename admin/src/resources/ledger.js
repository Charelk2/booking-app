import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, NumberField, SelectInput, TextInput } from 'react-admin';
const ledgerFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "q"),
    _jsx(SelectInput, { source: "type", size: "small", margin: "dense", variant: "outlined", choices: [
            { id: 'charge', name: 'Charge' },
            { id: 'fee', name: 'Fee' },
            { id: 'refund', name: 'Refund' },
            { id: 'payout', name: 'Payout' },
            { id: 'chargeback', name: 'Chargeback' },
        ], alwaysOn: true }, "type")
];
export const LedgerList = () => (_jsx(List, { filters: ledgerFilters, perPage: 50, sort: { field: 'created_at', order: 'DESC' }, children: _jsxs(Datagrid, { children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "booking_id" }), _jsx(TextField, { source: "type" }), _jsx(NumberField, { source: "amount", options: { style: 'currency', currency: 'ZAR' } }), _jsx(DateField, { source: "created_at", showTime: true })] }) }));

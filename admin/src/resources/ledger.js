import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, SelectInput, TextInput } from 'react-admin';
import MoneyCell from '../components/MoneyCell';
import TimeCell from '../components/TimeCell';
import JsonButton from '../components/JsonButton';
const ledgerFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "q"),
    _jsx(SelectInput, { source: "type", size: "small", margin: "dense", variant: "outlined", choices: [
            { id: 'charge', name: 'Charge' },
            { id: 'provider_escrow_in', name: 'Provider Escrow In (50%)' },
            { id: 'provider_escrow_hold', name: 'Provider Escrow Hold (50%)' },
            { id: 'provider_payout_out', name: 'Provider Payout Out' },
            { id: 'refund', name: 'Refund' },
        ], alwaysOn: true }, "type")
];
export const LedgerList = () => (_jsx(List, { filters: ledgerFilters, perPage: 50, sort: { field: 'created_at', order: 'DESC' }, children: _jsxs(Datagrid, { bulkActionButtons: false, rowClick: false, children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "booking_id" }), _jsx(TextField, { source: "type" }), _jsx(MoneyCell, { source: "amount" }), _jsx(TimeCell, { source: "created_at" }), _jsx(JsonButton, { source: "meta", title: "Meta" })] }) }));

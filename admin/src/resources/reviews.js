import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, NumberField, BooleanField, SelectInput, TextInput } from 'react-admin';
const reviewFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "q"),
    _jsx(SelectInput, { source: "verified", choices: [
            { id: true, name: 'Verified' }, { id: false, name: 'Unverified' }
        ], alwaysOn: true, size: "small", margin: "dense", variant: "outlined" }, "verified")
];
export const ReviewList = () => (_jsx(List, { filters: reviewFilters, perPage: 25, sort: { field: 'created_at', order: 'DESC' }, children: _jsxs(Datagrid, { children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "booking_id" }), _jsx(TextField, { source: "provider_id" }), _jsx(NumberField, { source: "rating" }), _jsx(BooleanField, { source: "verified" }), _jsx(TextField, { source: "text" }), _jsx(DateField, { source: "created_at", showTime: true })] }) }));

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, SelectInput, TextInput, Edit, SimpleForm, Create } from 'react-admin';
const adminFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true, size: "small", margin: "dense", variant: "outlined", sx: { minWidth: 220 } }, "q"),
    _jsx(SelectInput, { source: "role", size: "small", margin: "dense", variant: "outlined", sx: { minWidth: 200 }, choices: [
            { id: 'support', name: 'Support' },
            { id: 'payments', name: 'Payments Ops' },
            { id: 'trust', name: 'Trust & Safety' },
            { id: 'content', name: 'Content Mod' },
            { id: 'admin', name: 'Admin' },
            { id: 'superadmin', name: 'Super Admin' },
        ], alwaysOn: true }, "role")
];
export const AdminUserList = () => (_jsx(List, { filters: adminFilters, perPage: 25, sort: { field: 'created_at', order: 'DESC' }, children: _jsxs(Datagrid, { rowClick: "edit", children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "email" }), _jsx(TextField, { source: "role" }), _jsx(DateField, { source: "created_at", showTime: true })] }) }));
export const AdminUserEdit = () => (_jsx(Edit, { children: _jsxs(SimpleForm, { children: [_jsx(TextField, { source: "id" }), _jsx(TextInput, { source: "email" }), _jsx(SelectInput, { source: "role", choices: [
                    { id: 'support', name: 'Support' },
                    { id: 'payments', name: 'Payments Ops' },
                    { id: 'trust', name: 'Trust & Safety' },
                    { id: 'content', name: 'Content Mod' },
                    { id: 'admin', name: 'Admin' },
                    { id: 'superadmin', name: 'Super Admin' },
                ] }), _jsx(DateField, { source: "created_at" })] }) }));
export const AdminUserCreate = () => (_jsx(Create, { children: _jsxs(SimpleForm, { children: [_jsx(TextInput, { source: "email", required: true }), _jsx(SelectInput, { source: "role", choices: [
                    { id: 'support', name: 'Support' },
                    { id: 'payments', name: 'Payments Ops' },
                    { id: 'trust', name: 'Trust & Safety' },
                    { id: 'content', name: 'Content Mod' },
                    { id: 'admin', name: 'Admin' },
                    { id: 'superadmin', name: 'Super Admin' },
                ], defaultValue: 'admin' })] }) }));

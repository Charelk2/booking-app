import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { List, Datagrid, TextField, DateField, TextInput } from 'react-admin';
const auditFilters = [
    _jsx(TextInput, { source: "q", label: "Search", alwaysOn: true }, "q"),
    _jsx(TextInput, { source: "entity", label: "Entity", alwaysOn: true }, "entity"),
];
export const AuditList = () => (_jsx(List, { filters: auditFilters, perPage: 50, sort: { field: 'at', order: 'DESC' }, children: _jsxs(Datagrid, { children: [_jsx(TextField, { source: "id" }), _jsx(TextField, { source: "actor_admin_id" }), _jsx(TextField, { source: "entity" }), _jsx(TextField, { source: "entity_id" }), _jsx(TextField, { source: "action" }), _jsx(TextField, { source: "before" }), _jsx(TextField, { source: "after" }), _jsx(DateField, { source: "at", showTime: true })] }) }));

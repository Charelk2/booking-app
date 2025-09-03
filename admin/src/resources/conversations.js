import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { List, Datagrid, TextField, DateField, TextInput, Show, SimpleShowLayout, useRecordContext, useDataProvider, useNotify, SimpleList } from 'react-admin';
import { Card, CardContent, Divider, Button, useMediaQuery } from '@mui/material';
const filters = [_jsx(TextInput, { source: "q", label: "Search", alwaysOn: true }, "q")];
export const ConversationList = () => {
    const isSmall = useMediaQuery('(max-width:600px)');
    return (_jsx(List, { filters: filters, perPage: 25, sort: { field: 'last_at', order: 'DESC' }, children: isSmall ? (_jsx(SimpleList, { primaryText: (r) => r.provider_email, secondaryText: (r) => r.last_message, tertiaryText: (r) => r.last_at, linkType: "show" })) : (_jsxs(Datagrid, { rowClick: "show", bulkActionButtons: false, children: [_jsx(TextField, { source: "id", label: "Thread" }), _jsx(TextField, { source: "provider_email", label: "Provider Email" }), _jsx(TextField, { source: "provider_name", label: "Provider Name" }), _jsx(TextField, { source: "last_message", label: "Last Message" }), _jsx(DateField, { source: "last_at", label: "Updated" })] })) }));
};
export const ConversationShow = () => (_jsx(Show, { children: _jsxs(SimpleShowLayout, { children: [_jsx(TextField, { source: "id" }), _jsx(MessagesPanel, {})] }) }));
const MessagesPanel = () => {
    const record = useRecordContext();
    const dp = useDataProvider();
    const notify = useNotify();
    const [messages, setMessages] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const load = async () => {
        if (!record?.id)
            return;
        setLoading(true);
        try {
            const data = await dp.getConversation(record.id);
            setMessages(data.messages);
        }
        catch (e) {
            notify(e?.message || 'Failed to load conversation', { type: 'warning' });
        }
        finally {
            setLoading(false);
        }
    };
    React.useEffect(() => { void load(); }, [record?.id]);
    const onReply = async () => {
        const content = window.prompt('Reply');
        if (!content)
            return;
        try {
            await dp.replyConversation(record.id, content);
            notify('app.message.sent', { type: 'info' });
            await load();
        }
        catch (e) {
            notify(e?.message || 'Send failed', { type: 'warning' });
        }
    };
    return (_jsx(Card, { variant: "outlined", sx: { mt: 2 }, children: _jsxs(CardContent, { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("h3", { style: { margin: 0 }, children: "Messages" }), _jsx(Button, { variant: "contained", onClick: onReply, children: "Reply" })] }), _jsx(Divider, { sx: { my: 2 } }), loading ? (_jsx("p", { children: "Loading\u2026" })) : messages.length === 0 ? (_jsx("p", { children: "No messages yet." })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: messages.map(m => (_jsxs("div", { style: { padding: 8, border: '1px solid #eee', borderRadius: 6 }, children: [_jsxs("div", { style: { fontSize: 12, color: '#666' }, children: [new Date(m.created_at).toLocaleString(), " \u00B7 ", m.sender_type || 'user'] }), _jsx("div", { style: { marginTop: 4 }, children: m.content })] }, m.id))) }))] }) }));
};

import React from 'react';
import { List, Datagrid, TextField, DateField, TextInput, Show, SimpleShowLayout, useRecordContext, useDataProvider, useNotify, SimpleList } from 'react-admin';
import { Card, CardContent, Divider, Button, useMediaQuery } from '@mui/material';

const filters = [<TextInput key="q" source="q" label="Search" alwaysOn />];

export const ConversationList = () => {
  const isSmall = useMediaQuery('(max-width:600px)');
  return (
    <List filters={filters} perPage={25} sort={{ field: 'last_at', order: 'DESC' }}>
      {isSmall ? (
        <SimpleList
          primaryText={(r: any) => r.provider_email}
          secondaryText={(r: any) => r.last_message}
          tertiaryText={(r: any) => r.last_at}
          linkType="show"
        />
      ) : (
        <Datagrid rowClick="show" bulkActionButtons={false}>
          <TextField source="id" label="Thread" />
          <TextField source="provider_email" label="Provider Email" />
          <TextField source="provider_name" label="Provider Name" />
          <TextField source="last_message" label="Last Message" />
          <DateField source="last_at" label="Updated" />
        </Datagrid>
      )}
    </List>
  );
};

export const ConversationShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <MessagesPanel />
    </SimpleShowLayout>
  </Show>
);

const MessagesPanel = () => {
  const record = useRecordContext<any>();
  const dp = useDataProvider() as any;
  const notify = useNotify();
  const [messages, setMessages] = React.useState<Array<{ id: string; sender_type: string; content: string; created_at: string }>>([]);
  const [loading, setLoading] = React.useState(false);

  const load = async () => {
    if (!record?.id) return;
    setLoading(true);
    try {
      const data = await dp.getConversation(record.id);
      setMessages(data.messages);
    } catch (e: any) {
      notify(e?.message || 'Failed to load conversation', { type: 'warning' });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { void load(); }, [record?.id]);

  const onReply = async () => {
    const content = window.prompt('Reply');
    if (!content) return;
    try {
      await dp.replyConversation(record.id, content);
      notify('app.message.sent', { type: 'info' });
      await load();
    } catch (e: any) {
      notify(e?.message || 'Send failed', { type: 'warning' });
    }
  };

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Messages</h3>
          <Button variant="contained" onClick={onReply}>Reply</Button>
        </div>
        <Divider sx={{ my: 2 }} />
        {loading ? (
          <p>Loading…</p>
        ) : messages.length === 0 ? (
          <p>No messages yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(m => (
              <div key={m.id} style={{ padding: 8, border: '1px solid #eee', borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: '#666' }}>{new Date(m.created_at).toLocaleString()} · {m.sender_type || 'user'}</div>
                <div style={{ marginTop: 4 }}>{m.content}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

import * as React from 'react';
import { List, Datagrid, TextField, DateField, SelectInput, TextInput } from 'react-admin';

const emailFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn size="small" margin="dense" variant="outlined" />,
  <SelectInput key="event" source="event" choices={[
    { id:'processed', name:'Processed' },
    { id:'delivered', name:'Delivered' },
    { id:'open', name:'Open' },
    { id:'click', name:'Click' },
    { id:'bounce', name:'Bounce' },
    { id:'dropped', name:'Dropped' },
  ]} alwaysOn size="small" margin="dense" variant="outlined" />
];

export const EmailEventList = () => (
  <List filters={emailFilters} perPage={50} sort={{ field:'created_at', order:'DESC' }}>
    <Datagrid>
      <TextField source="id" />
      <TextField source="message_id" />
      <TextField source="to" />
      <TextField source="template" />
      <TextField source="event" />
      <TextField source="booking_id" />
      <TextField source="user_id" />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

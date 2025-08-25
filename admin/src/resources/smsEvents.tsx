import * as React from 'react';
import { List, Datagrid, TextField, DateField, SelectInput, TextInput } from 'react-admin';

const smsFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn />,
  <SelectInput key="status" source="status" choices={[
    { id:'queued', name:'Queued' },
    { id:'sent', name:'Sent' },
    { id:'delivered', name:'Delivered' },
    { id:'undelivered', name:'Undelivered' },
    { id:'failed', name:'Failed' },
  ]} alwaysOn />
];

export const SmsEventList = () => (
  <List filters={smsFilters} perPage={50} sort={{ field:'created_at', order:'DESC' }}>
    <Datagrid>
      <TextField source="id" />
      <TextField source="sid" />
      <TextField source="to" />
      <TextField source="status" />
      <TextField source="booking_id" />
      <TextField source="user_id" />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);


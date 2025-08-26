import * as React from 'react';
import { List, Datagrid, TextField, DateField, NumberField, SelectInput, TextInput } from 'react-admin';

const payoutFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn size="small" margin="dense" variant="outlined" />,
  <SelectInput key="status" source="status" size="small" margin="dense" variant="outlined" choices={[
    { id:'queued', name:'Queued' },
    { id:'processing', name:'Processing' },
    { id:'paid', name:'Paid' },
    { id:'failed', name:'Failed' },
  ]} alwaysOn />
];

export const PayoutList = () => (
  <List filters={payoutFilters} perPage={25} sort={{ field:'created_at', order:'DESC' }}>
    <Datagrid>
      <TextField source="id" />
      <TextField source="provider_id" />
      <NumberField source="amount" options={{ style:'currency', currency:'ZAR' }} />
      <TextField source="status" />
      <TextField source="batch_id" />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

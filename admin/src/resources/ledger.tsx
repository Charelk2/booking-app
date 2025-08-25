import * as React from 'react';
import { List, Datagrid, TextField, DateField, NumberField, SelectInput, TextInput } from 'react-admin';

const ledgerFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn />,
  <SelectInput key="type" source="type" choices={[
    { id:'charge', name:'Charge' },
    { id:'fee', name:'Fee' },
    { id:'refund', name:'Refund' },
    { id:'payout', name:'Payout' },
    { id:'chargeback', name:'Chargeback' },
  ]} alwaysOn />
];

export const LedgerList = () => (
  <List filters={ledgerFilters} perPage={50} sort={{ field:'created_at', order:'DESC' }}>
    <Datagrid>
      <TextField source="id" />
      <TextField source="booking_id" />
      <TextField source="type" />
      <NumberField source="amount" options={{ style:'currency', currency:'ZAR' }} />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);


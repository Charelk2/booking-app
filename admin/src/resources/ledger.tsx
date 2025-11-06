import * as React from 'react';
import { List, Datagrid, TextField, SelectInput, TextInput } from 'react-admin';
import MoneyCell from '../components/MoneyCell';
import TimeCell from '../components/TimeCell';
import JsonButton from '../components/JsonButton';

const ledgerFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn size="small" margin="dense" variant="outlined" />,
  <SelectInput key="type" source="type" size="small" margin="dense" variant="outlined" choices={[
    { id:'charge', name:'Charge' },
    { id:'provider_escrow_in', name:'Provider Escrow In (50%)' },
    { id:'provider_escrow_hold', name:'Provider Escrow Hold (50%)' },
    { id:'provider_payout_out', name:'Provider Payout Out' },
    { id:'refund', name:'Refund' },
  ]} alwaysOn />
];

export const LedgerList = () => (
  <List filters={ledgerFilters} perPage={50} sort={{ field:'created_at', order:'DESC' }}>
    <Datagrid bulkActionButtons={false} rowClick={false}>
      <TextField source="id" />
      <TextField source="booking_id" />
      <TextField source="type" />
      <MoneyCell source="amount" />
      <TimeCell source="created_at" />
      <JsonButton source="meta" title="Meta" />
    </Datagrid>
  </List>
);

import * as React from 'react';
import { List, Datagrid, TextField, DateField, NumberField, BooleanField, SelectInput, TextInput } from 'react-admin';

const reviewFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn size="small" margin="dense" variant="outlined" />,
  <SelectInput key="verified" source="verified" choices={[
    { id:true, name:'Verified' }, { id:false, name:'Unverified' }
  ]} alwaysOn size="small" margin="dense" variant="outlined" />
];

export const ReviewList = () => (
  <List filters={reviewFilters} perPage={25} sort={{ field:'created_at', order:'DESC' }}>
    <Datagrid>
      <TextField source="id" />
      <TextField source="booking_id" />
      <TextField source="provider_id" />
      <NumberField source="rating" />
      <BooleanField source="verified" />
      <TextField source="text" />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

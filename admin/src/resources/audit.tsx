import * as React from 'react';
import { List, Datagrid, TextField, DateField, TextInput } from 'react-admin';

const auditFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn />, 
  <TextInput key="entity" source="entity" label="Entity" alwaysOn />,
];

export const AuditList = () => (
  <List filters={auditFilters} perPage={50} sort={{ field:'at', order:'DESC' }}>
    <Datagrid>
      <TextField source="id" />
      <TextField source="actor_admin_id" />
      <TextField source="entity" />
      <TextField source="entity_id" />
      <TextField source="action" />
      <TextField source="before" />
      <TextField source="after" />
      <DateField source="at" showTime />
    </Datagrid>
  </List>
);


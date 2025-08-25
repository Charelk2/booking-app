import * as React from 'react';
import { List, Datagrid, TextField, DateField, SelectInput, TextInput, Edit, SimpleForm } from 'react-admin';

const adminFilters = [
  <TextInput key="q" source="q" label="Search" alwaysOn />,
  <SelectInput key="role" source="role" choices={[
    { id:'support', name:'Support' },
    { id:'payments', name:'Payments Ops' },
    { id:'trust', name:'Trust & Safety' },
    { id:'content', name:'Content Mod' },
    { id:'admin', name:'Admin' },
    { id:'superadmin', name:'Super Admin' },
  ]} alwaysOn />
];

export const AdminUserList = () => (
  <List filters={adminFilters} perPage={25} sort={{ field:'created_at', order:'DESC' }}>
    <Datagrid rowClick="edit">
      <TextField source="id" />
      <TextField source="email" />
      <TextField source="role" />
      <DateField source="created_at" showTime />
    </Datagrid>
  </List>
);

export const AdminUserEdit = () => (
  <Edit>
    <SimpleForm>
      <TextField source="id" />
      <TextInput source="email" />
      <SelectInput source="role" choices={[
        { id:'support', name:'Support' },
        { id:'payments', name:'Payments Ops' },
        { id:'trust', name:'Trust & Safety' },
        { id:'content', name:'Content Mod' },
        { id:'admin', name:'Admin' },
        { id:'superadmin', name:'Super Admin' },
      ]}/>
      <DateField source="created_at" />
    </SimpleForm>
  </Edit>
);


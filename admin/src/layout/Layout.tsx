import * as React from 'react';
import { Layout } from 'react-admin';
import CustomMenu from './Menu';
import Dashboard from './Dashboard';

export default function AdminLayout(props:any) {
  return <Layout {...props} menu={CustomMenu} dashboard={Dashboard} />;
}


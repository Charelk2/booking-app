import * as React from 'react';
import { Layout, useSidebarState } from 'react-admin';
import { useLocation } from 'react-router-dom';
import CustomMenu from './Menu';
import Dashboard from './Dashboard';
import TopAppBar from './TopAppBar';

export default function AdminLayout(props: any) {
  const location = useLocation();
  const [open, setOpen] = useSidebarState();

  // Auto-compact the sidebar on Providers routes; auto-open elsewhere
  React.useEffect(() => {
    const isProviders = location.pathname.startsWith('/providers');
    setOpen(!isProviders);
  }, [location.pathname, setOpen]);

  return <Layout {...props} menu={CustomMenu} dashboard={Dashboard} appBar={TopAppBar} />;
}

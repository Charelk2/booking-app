import * as React from 'react';
import { Menu } from 'react-admin';
import { ADMIN_MENU_ITEMS } from '../adminConfig';

export default function CustomMenu() {
  return (
    <Menu>
      <Menu.DashboardItem />
      {ADMIN_MENU_ITEMS.map((item) => (
        <Menu.Item key={item.to} to={item.to} primaryText={item.label} leftIcon={item.icon} />
      ))}
    </Menu>
  );
}

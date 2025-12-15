import * as React from 'react';
import { Admin, Resource, CustomRoutes } from 'react-admin';
import { BrowserRouter, Route } from 'react-router-dom';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import englishMessages from 'ra-language-english';
import { authProvider } from './authProvider';
import theme from './theme';
import { dataProvider as dp } from './dataProvider';

import AdminLayout from './layout/Layout';
import Dashboard from './layout/Dashboard';
import { ADMIN_RESOURCES, ADMIN_ROUTES } from './adminConfig';

const customEn = {
  app: {
    provider: {
      purged: 'Provider purged successfully.',
      activated: 'Provider activated.',
      deactivated: 'Provider deactivated.',
      all_unlisted: 'All services were unlisted.',
    },
    user: {
      purged: 'User purged successfully.',
    },
    admin: {
      granted: 'Admin role granted.',
    },
    message: {
      sent: 'Message sent.',
    },
  },
};

const i18nProvider = polyglotI18nProvider(() => ({
  ...englishMessages,
  ...customEn,
}), 'en');

export default function App() {
  return (
    <BrowserRouter>
      <Admin
        title={import.meta.env.VITE_ADMIN_TITLE || 'Booka Admin'}
        authProvider={authProvider}
        dataProvider={dp as any}
        i18nProvider={i18nProvider}
        layout={AdminLayout}
        theme={theme}
        dashboard={Dashboard}
        disableTelemetry
      >
        {ADMIN_RESOURCES.map((r) => (
          <Resource
            key={r.name}
            name={r.name}
            list={r.list}
            show={r.show}
            edit={r.edit}
            create={r.create}
          />
        ))}

        <CustomRoutes>
          {ADMIN_ROUTES.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </CustomRoutes>
      </Admin>
    </BrowserRouter>
  );
}

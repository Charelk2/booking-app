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

// Resources
import { ListingList, ListingShow, attachDP as attachDPListings } from './resources/listings';
import { BookingList, BookingShow, attachDPBookings } from './resources/bookings';
import { LedgerList } from './resources/ledger';
import { PayoutList } from './resources/payouts';
import { DisputeList, DisputeShow } from './resources/disputes';
import { EmailEventList } from './resources/emailEvents';
import { SmsEventList } from './resources/smsEvents';
import { ReviewList } from './resources/reviews';
import { AuditList } from './resources/audit';
import { AdminUserList, AdminUserEdit, AdminUserCreate } from './resources/adminUsers';
import { ProviderList, ProviderShow } from './resources/providers';
import { ConversationList, ConversationShow } from './resources/conversations';

// Custom pages
import PayoutsRun from './routes/PayoutsRun';
import UsersSearch from './routes/UsersSearch';

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
  // Attach custom dataProvider actions for convenience
  React.useEffect(() => {
    attachDPListings(dp as any);
    attachDPBookings(dp as any);
  }, []);

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
        <Resource name="listings" list={ListingList} show={ListingShow} />
        <Resource name="bookings" list={BookingList} show={BookingShow} />
        <Resource name="ledger" list={LedgerList} />
        <Resource name="payouts" list={PayoutList} />
        <Resource name="disputes" list={DisputeList} show={DisputeShow} />
        <Resource name="email_events" list={EmailEventList} />
        <Resource name="sms_events" list={SmsEventList} />
        <Resource name="reviews" list={ReviewList} />
        <Resource name="audit_events" list={AuditList} />
        <Resource name="admin_users" list={AdminUserList} edit={AdminUserEdit} create={AdminUserCreate} />
        <Resource name="providers" list={ProviderList} show={ProviderShow} />
        <Resource name="conversations" list={ConversationList} show={ConversationShow} />

        <CustomRoutes>
          <Route path="/payouts/run" element={<PayoutsRun />} />
          <Route path="/users" element={<UsersSearch />} />
          <Route path="/providers/deleted" element={<ProviderList />} />
        </CustomRoutes>
      </Admin>
    </BrowserRouter>
  );
}

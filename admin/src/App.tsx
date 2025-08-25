import * as React from 'react';
import { Admin, Resource, CustomRoutes } from 'react-admin';
import { BrowserRouter, Route } from 'react-router-dom';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import englishMessages from 'ra-language-english';
import { authProvider } from './authProvider';
import { dataProvider as dp } from './dataProvider';

import AdminLayout from './layout/Layout';

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
import { AdminUserList, AdminUserEdit } from './resources/adminUsers';

// Custom pages
import PayoutsRun from './routes/PayoutsRun';

const i18nProvider = polyglotI18nProvider(() => englishMessages, 'en');

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
        <Resource name="admin_users" list={AdminUserList} edit={AdminUserEdit} />

        <CustomRoutes>
          <Route path="/payouts/run" element={<PayoutsRun />} />
        </CustomRoutes>
      </Admin>
    </BrowserRouter>
  );
}

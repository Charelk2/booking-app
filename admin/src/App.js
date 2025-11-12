import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { ClientList } from './resources/clients';
import { ConversationList, ConversationShow } from './resources/conversations';
// Custom pages
import UsersSearch from './routes/UsersSearch';
import Migrations from './routes/Migrations';
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
        attachDPListings(dp);
        attachDPBookings(dp);
    }, []);
    return (_jsx(BrowserRouter, { children: _jsxs(Admin, { title: import.meta.env.VITE_ADMIN_TITLE || 'Booka Admin', authProvider: authProvider, dataProvider: dp, i18nProvider: i18nProvider, layout: AdminLayout, theme: theme, dashboard: Dashboard, disableTelemetry: true, children: [_jsx(Resource, { name: "listings", list: ListingList, show: ListingShow }), _jsx(Resource, { name: "bookings", list: BookingList, show: BookingShow }), _jsx(Resource, { name: "ledger", list: LedgerList }), _jsx(Resource, { name: "payouts", list: PayoutList }), _jsx(Resource, { name: "disputes", list: DisputeList, show: DisputeShow }), _jsx(Resource, { name: "email_events", list: EmailEventList }), _jsx(Resource, { name: "sms_events", list: SmsEventList }), _jsx(Resource, { name: "reviews", list: ReviewList }), _jsx(Resource, { name: "audit_events", list: AuditList }), _jsx(Resource, { name: "admin_users", list: AdminUserList, edit: AdminUserEdit, create: AdminUserCreate }), _jsx(Resource, { name: "providers", list: ProviderList, show: ProviderShow }), _jsx(Resource, { name: "clients", list: ClientList }), _jsx(Resource, { name: "conversations", list: ConversationList, show: ConversationShow }), _jsxs(CustomRoutes, { children: [_jsx(Route, { path: "/users", element: _jsx(UsersSearch, {}) }), _jsx(Route, { path: "/ops/migrations", element: _jsx(Migrations, {}) }), _jsx(Route, { path: "/providers/deleted", element: _jsx(ProviderList, {}) })] })] }) }));
}

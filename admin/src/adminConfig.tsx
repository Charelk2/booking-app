import * as React from 'react';
import type { ComponentType, ReactElement } from 'react';

import PaymentsIcon from '@mui/icons-material/Payments';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ReviewsIcon from '@mui/icons-material/RateReview';
import SecurityIcon from '@mui/icons-material/Security';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import NearMeIcon from '@mui/icons-material/NearMe';
import ListAltIcon from '@mui/icons-material/ListAlt';
import BugReportIcon from '@mui/icons-material/BugReport';
import EmailIcon from '@mui/icons-material/Email';
import SmsIcon from '@mui/icons-material/Sms';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import ChatIcon from '@mui/icons-material/Chat';
import BuildIcon from '@mui/icons-material/Build';
import InsightsIcon from '@mui/icons-material/Insights';

// Resources
import { ListingList, ListingShow } from './resources/listings';
import { BookingList, BookingShow } from './resources/bookings';
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
import PayoutsRun from './routes/PayoutsRun';
import UsersSearch from './routes/UsersSearch';
import Migrations from './routes/Migrations';
import Analytics from './routes/Analytics';

export type AdminResourceConfig = {
  name: string;
  list?: ComponentType<any>;
  show?: ComponentType<any>;
  edit?: ComponentType<any>;
  create?: ComponentType<any>;
};

export type AdminMenuItemConfig = {
  to: string;
  label: string;
  icon: ReactElement;
};

export type AdminRouteConfig = {
  path: string;
  element: ReactElement;
};

export const ADMIN_RESOURCES: AdminResourceConfig[] = [
  { name: 'providers', list: ProviderList, show: ProviderShow },
  { name: 'conversations', list: ConversationList, show: ConversationShow },
  { name: 'listings', list: ListingList, show: ListingShow },
  { name: 'bookings', list: BookingList, show: BookingShow },
  { name: 'ledger', list: LedgerList },
  { name: 'payouts', list: PayoutList },
  { name: 'disputes', list: DisputeList, show: DisputeShow },
  { name: 'email_events', list: EmailEventList },
  { name: 'sms_events', list: SmsEventList },
  { name: 'reviews', list: ReviewList },
  { name: 'audit_events', list: AuditList },
  { name: 'admin_users', list: AdminUserList, edit: AdminUserEdit, create: AdminUserCreate },
  { name: 'clients', list: ClientList },
];

export const ADMIN_MENU_ITEMS: AdminMenuItemConfig[] = [
  { to: '/providers', label: 'Providers', icon: <PeopleAltIcon /> },
  { to: '/conversations', label: 'Support Inbox', icon: <ChatIcon /> },

  { to: '/listings', label: 'Listings (Moderation)', icon: <ListAltIcon /> },
  { to: '/bookings', label: 'Bookings', icon: <AssignmentIcon /> },

  { to: '/ledger', label: 'Payments · Ledger', icon: <PaymentsIcon /> },
  { to: '/payouts', label: 'Payouts', icon: <NearMeIcon /> },
  { to: '/payouts/run', label: 'Create Payout Batch', icon: <NearMeIcon /> },

  { to: '/disputes', label: 'Resolution Center', icon: <BugReportIcon /> },

  { to: '/email_events', label: 'Email Events', icon: <EmailIcon /> },
  { to: '/sms_events', label: 'SMS Events', icon: <SmsIcon /> },

  { to: '/reviews', label: 'Reviews', icon: <ReviewsIcon /> },
  { to: '/audit_events', label: 'Audit Log', icon: <SecurityIcon /> },
  { to: '/admin_users', label: 'Admin Users', icon: <AdminPanelSettingsIcon /> },
  { to: '/users', label: 'Users', icon: <ManageAccountsIcon /> },
  { to: '/analytics', label: 'Analytics', icon: <InsightsIcon /> },
  { to: '/ops/migrations', label: 'Migrations', icon: <BuildIcon /> },
];

export const ADMIN_ROUTES: AdminRouteConfig[] = [
  { path: '/payouts/run', element: <PayoutsRun /> },
  { path: '/users', element: <UsersSearch /> },
  { path: '/analytics', element: <Analytics /> },
  { path: '/ops/migrations', element: <Migrations /> },
  { path: '/providers/deleted', element: <ProviderList /> },
];


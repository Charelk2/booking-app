import * as React from 'react';
import { Menu } from 'react-admin';
import PaymentsIcon from '@mui/icons-material/Payments';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChatIcon from '@mui/icons-material/Chat';
import ReviewsIcon from '@mui/icons-material/RateReview';
import SecurityIcon from '@mui/icons-material/Security';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import NearMeIcon from '@mui/icons-material/NearMe';
import ListAltIcon from '@mui/icons-material/ListAlt';
import BugReportIcon from '@mui/icons-material/BugReport';
import EmailIcon from '@mui/icons-material/Email';
import SmsIcon from '@mui/icons-material/Sms';

export default function CustomMenu() {
  return (
    <Menu>
      <Menu.DashboardItem />

      <Menu.Item to="/listings" primaryText="Listings (Moderation)" leftIcon={<ListAltIcon/>} />
      <Menu.Item to="/bookings" primaryText="Bookings" leftIcon={<AssignmentIcon/>} />

      <Menu.Item to="/ledger" primaryText="Payments · Ledger" leftIcon={<PaymentsIcon/>} />
      <Menu.Item to="/payouts" primaryText="Payouts" leftIcon={<NearMeIcon/>} />
      <Menu.Item to="/payouts/run" primaryText="Create Payout Batch" leftIcon={<NearMeIcon/>} />

      <Menu.Item to="/disputes" primaryText="Resolution Center" leftIcon={<BugReportIcon/>} />

      <Menu.Item to="/email_events" primaryText="Email Events" leftIcon={<EmailIcon/>} />
      <Menu.Item to="/sms_events" primaryText="SMS Events" leftIcon={<SmsIcon/>} />

      <Menu.Item to="/reviews" primaryText="Reviews" leftIcon={<ReviewsIcon/>} />
      <Menu.Item to="/audit_events" primaryText="Audit Log" leftIcon={<SecurityIcon/>} />
      <Menu.Item to="/admin_users" primaryText="Admin Users" leftIcon={<AdminPanelSettingsIcon/>} />
    </Menu>
  );
}


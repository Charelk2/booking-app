import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Menu } from 'react-admin';
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
export default function CustomMenu() {
    return (_jsxs(Menu, { children: [_jsx(Menu.DashboardItem, {}), _jsx(Menu.Item, { to: "/providers", primaryText: "Providers", leftIcon: _jsx(PeopleAltIcon, {}) }), _jsx(Menu.Item, { to: "/conversations", primaryText: "Support Inbox", leftIcon: _jsx(ChatIcon, {}) }), _jsx(Menu.Item, { to: "/listings", primaryText: "Listings (Moderation)", leftIcon: _jsx(ListAltIcon, {}) }), _jsx(Menu.Item, { to: "/bookings", primaryText: "Bookings", leftIcon: _jsx(AssignmentIcon, {}) }), _jsx(Menu.Item, { to: "/ledger", primaryText: "Payments \u00B7 Ledger", leftIcon: _jsx(PaymentsIcon, {}) }), _jsx(Menu.Item, { to: "/payouts", primaryText: "Payouts", leftIcon: _jsx(NearMeIcon, {}) }), _jsx(Menu.Item, { to: "/payouts/run", primaryText: "Create Payout Batch", leftIcon: _jsx(NearMeIcon, {}) }), _jsx(Menu.Item, { to: "/disputes", primaryText: "Resolution Center", leftIcon: _jsx(BugReportIcon, {}) }), _jsx(Menu.Item, { to: "/email_events", primaryText: "Email Events", leftIcon: _jsx(EmailIcon, {}) }), _jsx(Menu.Item, { to: "/sms_events", primaryText: "SMS Events", leftIcon: _jsx(SmsIcon, {}) }), _jsx(Menu.Item, { to: "/reviews", primaryText: "Reviews", leftIcon: _jsx(ReviewsIcon, {}) }), _jsx(Menu.Item, { to: "/audit_events", primaryText: "Audit Log", leftIcon: _jsx(SecurityIcon, {}) }), _jsx(Menu.Item, { to: "/admin_users", primaryText: "Admin Users", leftIcon: _jsx(AdminPanelSettingsIcon, {}) }), _jsx(Menu.Item, { to: "/users", primaryText: "Users", leftIcon: _jsx(ManageAccountsIcon, {}) }), _jsx(Menu.Item, { to: "/ops/migrations", primaryText: "Migrations", leftIcon: _jsx(BuildIcon, {}) })] }));
}

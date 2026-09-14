import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { AuthProvider } from "./features/auth/AuthContext";
import { GuestRoute, ProtectedRoute } from "./features/auth/ProtectedRoute";
import { LoginPage } from "./features/auth/pages/LoginPage";
import { RegisterPage } from "./features/auth/pages/RegisterPage";
import { VerifyEmailPage } from "./features/auth/pages/VerifyEmailPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ExpensesPage } from "./features/expenses/ExpensesPage";
import { PersonalExpensesPage } from "./features/expenses/PersonalExpensesPage";
import { GroupDetailPage } from "./features/groups/GroupDetailPage";
import { GroupsPage } from "./features/groups/GroupsPage";
import { NotificationsPage } from "./features/notifications/NotificationsPage";
import { UnreadNotificationsProvider } from "./features/notifications/UnreadCountProvider";
import { BalancesPage } from "./features/balances/BalancesPage";
import { SettlementsPage } from "./features/settlements/SettlementsPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { ToolsPage } from "./features/tools/ToolsPage";
import { ToastProvider } from "./components/ui/Toast";
import "./styles/ui.css";

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      {/* Public on purpose: the email link must work whether or not a session
          exists, and clicking it should never be impossible while logged out. */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route
        element={
          <ProtectedRoute>
            <UnreadNotificationsProvider>
              <AppLayout />
            </UnreadNotificationsProvider>
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/:groupId" element={<GroupDetailPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/expenses/personal" element={<PersonalExpensesPage />} />
        <Route path="/balances" element={<BalancesPage />} />
        <Route path="/settlements" element={<SettlementsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/tools/:tool" element={<ToolsPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
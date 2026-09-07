import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { AuthProvider } from "./features/auth/AuthContext";
import { GuestRoute, ProtectedRoute } from "./features/auth/ProtectedRoute";
import { LoginPage } from "./features/auth/pages/LoginPage";
import { RegisterPage } from "./features/auth/pages/RegisterPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { GroupDetailPage } from "./features/groups/GroupDetailPage";
import { GroupsPage } from "./features/groups/GroupsPage";
import { NotificationsPage } from "./features/notifications/NotificationsPage";
import { UnreadNotificationsProvider } from "./features/notifications/UnreadCountProvider";
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
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
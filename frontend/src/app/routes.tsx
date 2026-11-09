import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ProtectedRoute } from '../components/routing/ProtectedRoute';
import { RoleGuard } from '../components/routing/RoleGuard';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { HomePage } from '../pages/HomePage';
import { DashboardPage } from '../pages/DashboardPage';
import { SectionPlaceholderPage } from '../pages/SectionPlaceholderPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';

/**
 * Application route table.
 *
 * Public:  /, /login (redirects signed-in users to /dashboard)
 * Authenticated: everything below /dashboard etc. (ProtectedRoute)
 * Role-restricted: ADMIN-only areas wrapped in RoleGuard.
 *
 * NOTE: backend authorization remains mandatory for all APIs — this
 * table is UX-level protection only, never the security boundary.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/calendar" element={<SectionPlaceholderPage title="Calendar" />} />
        <Route path="/events" element={<SectionPlaceholderPage title="Events" />} />
        <Route path="/requests" element={<SectionPlaceholderPage title="Requests" />} />
        <Route path="/notifications" element={<SectionPlaceholderPage title="Notifications" />} />
        <Route
          path="/inventory"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <SectionPlaceholderPage title="Inventory" />
            </RoleGuard>
          }
        />
        <Route
          path="/users"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <SectionPlaceholderPage title="User Management" />
            </RoleGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <RoleGuard allowedRoles={['ADMIN']}>
              <SectionPlaceholderPage title="Settings" />
            </RoleGuard>
          }
        />
        <Route
          path="/profile"
          element={
            <RoleGuard allowedRoles={['EXECUTOR']}>
              <SectionPlaceholderPage title="My Profile" />
            </RoleGuard>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

  import { Suspense, lazy } from 'react';
  import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
  import { AppLayout } from '../components/layout/AppLayout';
  import { ProtectedRoute } from '../components/routing/ProtectedRoute';
  import { RoleGuard } from '../components/routing/RoleGuard';
  import { RootRedirect } from '../components/routing/RootRedirect';
  import { RouteFallback } from '../components/routing/RouteFallback';
  import { LoginPage } from '../pages/LoginPage';
  import { NotFoundPage } from '../pages/NotFoundPage';
  import { UnauthorizedPage } from '../pages/UnauthorizedPage';


/**
 * Route-level lazy loading. Each page chunk is fetched on first navigation,
 * and the Suspense fallback (RouteFallback) renders immediately so the user
 * always sees a designed loading state — never a blank screen.
 */
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const CalendarPage = lazy(() => import('../pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const EventsListPage = lazy(() => import('../pages/EventsListPage').then((m) => ({ default: m.EventsListPage })));
const EventNewPage = lazy(() => import('../pages/EventNewPage').then((m) => ({ default: m.EventNewPage })));
const EventDetailPage = lazy(() => import('../pages/EventDetailPage').then((m) => ({ default: m.EventDetailPage })));
const DishesPage = lazy(() => import('../pages/DishesPage').then((m) => ({ default: m.DishesPage })));
const DishDetailPage = lazy(() => import('../pages/DishDetailPage').then((m) => ({ default: m.DishDetailPage })));
const InventoryPage = lazy(() => import('../pages/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const FoodItemsPage = lazy(() => import('../pages/FoodItemsPage').then((m) => ({ default: m.FoodItemsPage })));
const FoodItemDetailPage = lazy(() => import('../pages/FoodItemDetailPage').then((m) => ({ default: m.FoodItemDetailPage })));
const CategoriesPage = lazy(() => import('../pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const UnitsPage = lazy(() => import('../pages/UnitsPage').then((m) => ({ default: m.UnitsPage })));
const LedgerPage = lazy(() => import('../pages/LedgerPage').then((m) => ({ default: m.LedgerPage })));
const RequestsPage = lazy(() => import('../pages/RequestsPage').then((m) => ({ default: m.RequestsPage })));
const RequestDetailPage = lazy(() => import('../pages/RequestDetailPage').then((m) => ({ default: m.RequestDetailPage })));
const ReturnsPage = lazy(() => import('../pages/ReturnsPage').then((m) => ({ default: m.ReturnsPage })));
const ReturnDetailPage = lazy(() => import('../pages/ReturnDetailPage').then((m) => ({ default: m.ReturnDetailPage })));
const NotificationsPage = lazy(() => import('../pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const UsersPage = lazy(() => import('../pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const UserDetailPage = lazy(() => import('../pages/UserDetailPage').then((m) => ({ default: m.UserDetailPage })));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Landing decision: signed in -> /dashboard, signed out -> /login */}
          <Route path="/" element={<RootRedirect />} />

          {/* Authenticated shell: layout + session guard wrapping all app pages */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/calendar" element={<CalendarPage />} />

            {/* Events */}
            <Route path="/events" element={<EventsListPage />} />
            <Route path="/events/calendar" element={<Navigate to="/calendar" replace />} />
            <Route path="/events/new" element={<EventNewPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />

            {/* Dishes — Dish Master is ADMIN-only */}
            <Route
              path="/dishes"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <DishesPage />
                </RoleGuard>
              }
            />
            <Route
              path="/dishes/:id"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <DishDetailPage />
                </RoleGuard>
              }
            />

            {/* Inventory — ADMIN only */}
            <Route
              path="/inventory"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <InventoryPage />
                </RoleGuard>
              }
            />
            <Route
              path="/inventory/stock"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <InventoryPage />
                </RoleGuard>
              }
            />
            <Route path="/inventory/stock-in" element={<Navigate to="/inventory?stockIn=1" replace />} />
            <Route
              path="/inventory/items"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <FoodItemsPage />
                </RoleGuard>
              }
            />
            <Route
              path="/inventory/food-items"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <FoodItemsPage />
                </RoleGuard>
              }
            />
            <Route
              path="/inventory/food-items/:id"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <FoodItemDetailPage />
                </RoleGuard>
              }
            />
            <Route
              path="/inventory/items/:id"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <FoodItemDetailPage />
                </RoleGuard>
              }
            />
            <Route
              path="/inventory/categories"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <CategoriesPage />
                </RoleGuard>
              }
            />
            <Route
              path="/inventory/units"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <UnitsPage />
                </RoleGuard>
              }
            />
            <Route
              path="/inventory/ledger"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <LedgerPage />
                </RoleGuard>
              }
            />

            {/* Material Requests (both roles, service enforces scope) */}
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/requests/:id" element={<RequestDetailPage />} />

            {/* Material Returns (both roles; list + review scoped server-side) */}
            <Route path="/returns" element={<ReturnsPage />} />
            <Route path="/returns/:id" element={<ReturnDetailPage />} />

            <Route path="/notifications" element={<NotificationsPage />} />

            {/* Users — ADMIN only */}
            <Route
              path="/users"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <UsersPage />
                </RoleGuard>
              }
            />
            <Route
              path="/users/:id"
              element={
                <RoleGuard allowedRoles={['ADMIN']}>
                  <UserDetailPage />
                </RoleGuard>
              }
            />

            {/* Profile — both roles */}
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

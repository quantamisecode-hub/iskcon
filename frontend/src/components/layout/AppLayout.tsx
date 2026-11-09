import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { NAV_ITEMS } from '../../constants/navItems';
import { PageLoader } from '../common/PageLoader';

/**
 * Authenticated application shell with ROLE-AWARE navigation.
 * Prepared for the ISKCON brand identity (logo/palette) arriving later.
 */
export function AppLayout() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();

  if (status === 'loading' || !user) {
    return <PageLoader label="Loading your session…" />;
  }

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-wide text-slate-900">
              FOOD INVENTORY SYSTEM
            </span>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{user.role}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">
              {user.firstName} {user.lastName}
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto w-full max-w-6xl px-4 pb-2">
          <ul className="flex flex-wrap gap-1">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-3">
        <p className="mx-auto w-full max-w-6xl px-4 text-xs text-slate-500">
          Business modules arrive in later phases — navigation is role-based and prepared already.
        </p>
      </footer>
    </div>
  );
}

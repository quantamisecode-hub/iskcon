import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { NAV_ITEMS } from '../../constants/navItems';
import {
  BoxIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  FileTextIcon,
  FlagIcon,
  GridIcon,
  LayersIcon,
  PackageIcon,
  TruckIcon,
  TagIcon,
  UserIcon,
  UsersIcon,
  UtensilsIcon,
  XIcon,
  type IconProps,
} from '../ui/icons';

/**
 * Application sidebar — collapsible (expanded 256px ↔ icon rail 72px),
 * persistent on desktop, slide-in drawer on mobile.
 * Collapse state persists in localStorage. Navigation is role-aware;
 * the backend independently enforces every rule.
 */

const ICONS: Record<string, ComponentType<IconProps>> = {
  '/dashboard': GridIcon,
  '/calendar': CalendarIcon,
  '/events': FlagIcon,
  '/dishes': UtensilsIcon,
  '/inventory': BoxIcon,
  '/requests': FileTextIcon,
  '/users': UsersIcon,
  '/profile': UserIcon,
};

const CHILD_ICONS: Record<string, ComponentType<IconProps>> = {
  '/inventory?stockIn=1': PackageIcon,
  '/inventory?stockOut=1': TruckIcon,
  '/inventory/ledger': FileTextIcon,
  '/inventory/categories': LayersIcon,
  '/inventory/food-items': TagIcon,
};

const INVENTORY_SUB_KEY = 'iskcon.inventoryNavOpen';

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isInventoryRoute = location.pathname.startsWith('/inventory');
  const currentPath = `${location.pathname}${location.search}`;

  const [subOpen, setSubOpen] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(INVENTORY_SUB_KEY) : null;
    if (saved === '0' || saved === '1') return saved === '1';
    return location.pathname.startsWith('/inventory');
  });

  // Auto-expand the sub-menu when *navigating into* inventory routes — but respect
  // an explicit collapse gesture on mount (localStorage wins) and don't re-open after a manual collapse.
  const cameFromNonInventory = useRef(!isInventoryRoute);
  useEffect(() => {
    if (isInventoryRoute && cameFromNonInventory.current) setSubOpen(true);
    cameFromNonInventory.current = !isInventoryRoute;
  }, [isInventoryRoute]);

  const toggleSub = () => {
    setSubOpen((open) => {
      try {
        window.localStorage.setItem(INVENTORY_SUB_KEY, open ? '0' : '1');
      } catch {
        /* storage unavailable — toggle still works for this session */
      }
      return !open;
    });
  };

  const items = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role));

  // Close the mobile drawer on navigation + lock body scroll while open.
  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCloseMobile();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen, onCloseMobile]);

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  const navLinkClass = (isActive: boolean, isCollapsed: boolean) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
      isActive
        ? 'bg-[#fbf6ef] text-primary-deep shadow-sm'
        : 'text-[#f5e6d8]/90 hover:bg-white/10 hover:text-white'
    } ${isCollapsed ? 'justify-center px-0 py-3' : ''}`;

  const subLinkClass = (isActive: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
      isActive ? 'bg-[#fbf6ef] text-primary-deep shadow-sm' : 'text-[#f5e6d8]/80 hover:bg-white/10 hover:text-white'
    }`;

  const navList = (isCollapsed: boolean) => (
    <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {items.map((item) => {
        const Icon = ICONS[item.to] ?? GridIcon;

        // Expandable group (Inventory) — hidden in the icon rail; rail keeps the plain link.
        if (item.children?.length && !isCollapsed) {
          const parentActive = isInventoryRoute;
          return (
            <div key={item.to}>
              <div
                className={`flex items-center rounded-xl transition ${
                  parentActive
                    ? 'bg-[#fbf6ef] text-primary-deep shadow-sm'
                    : 'text-[#f5e6d8]/90 hover:bg-white/10 hover:text-white'
                }`}
              >
                <NavLink
                  to={item.to}
                  end
                  aria-label={item.label}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <Icon className="h-5 w-5 flex-none" />
                  <span className="flex-1 truncate">{item.label}</span>
                </NavLink>
                <button
                  type="button"
                  onClick={toggleSub}
                  aria-expanded={subOpen}
                  aria-controls="inventory-submenu"
                  aria-label={subOpen ? 'Collapse inventory menu' : 'Expand inventory menu'}
                  className="mr-1 flex-none rounded-lg p-2 transition hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform duration-300 ease-in-out motion-reduce:transition-none ${subOpen ? '' : '-rotate-90'}`}
                  />
                </button>
              </div>
              <div
                id="inventory-submenu"
                role="group"
                aria-label="Inventory submenu"
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none ${
                  subOpen ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="ml-6 mt-1 space-y-1 border-l border-white/15 py-1 pl-3">
                    {item.children.map((child) => {
                      const ChildIcon = CHILD_ICONS[child.to] ?? FileTextIcon;
                      const childActive = child.to.includes('?')
                        ? currentPath === child.to
                        : location.pathname === child.to;
                      return (
                        <Link
                          key={child.to}
                          to={child.to}
                          aria-current={childActive ? 'page' : undefined}
                          className={subLinkClass(childActive)}
                        >
                          <ChildIcon className="h-4 w-4 flex-none" />
                          <span className="flex-1 truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return (
          <NavLink
            key={item.to}
            to={item.to}
            title={isCollapsed ? item.label : undefined}
            aria-label={isCollapsed ? item.label : undefined}
            className={({ isActive }) => navLinkClass(isActive, isCollapsed)}
          >
            <Icon className="h-5 w-5 flex-none" />
            {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
          </NavLink>
        );
      })}
    </nav>
  );

  const brandRow = (isCollapsed: boolean, onClickClose?: () => void) => (
    <div className={`flex items-center gap-3 border-b border-white/10 px-4 py-4 ${isCollapsed ? 'justify-center px-2' : ''}`}>
      <Link
        to="/dashboard"
        aria-label="ISKCON — go to Dashboard"
        className={`flex items-center gap-3 rounded-2xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
          isCollapsed ? '' : 'min-w-0'
        }`}
      >
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white p-1.5 shadow-md">
          <img src="/iskcon-logo.png" alt="" className="h-full w-auto" />
        </span>
        {!isCollapsed && (
          <span className="leading-tight">
            <span className="block text-sm font-bold tracking-[0.22em] text-[#fbf6ef]">ISKCON</span>
            <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wider text-[#f5e6d8]/70">
              Food Inventory
            </span>
          </span>
        )}
      </Link>
      {onClickClose && (
        <button
          type="button"
          onClick={onClickClose}
          aria-label="Close menu"
          className="ml-auto rounded-xl p-2 text-[#f5e6d8]/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <XIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );

  const footerRow = (isCollapsed: boolean, onLogout: () => void) => user && (
    <div className={`border-t border-white/10 px-3 py-3 ${isCollapsed ? 'flex justify-center' : ''}`}>
      {!isCollapsed && (
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-10 w-10 flex-none rounded-full border border-white/30 object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#fbf6ef] text-xs font-bold text-primary-deep"
            >
              {user.firstName.charAt(0)}{user.lastName.charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-[#fbf6ef]">{user.firstName} {user.lastName}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-[#f5e6d8]/70">{user.role}</p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onLogout}
        title={isCollapsed ? 'Log out' : undefined}
        aria-label={isCollapsed ? 'Log out' : undefined}
        className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-[#f5e6d8]/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${isCollapsed ? 'mt-0 w-11 justify-center px-0' : ''}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
        {!isCollapsed && <span>Log out</span>}
      </button>
    </div>
  );

  const collapseToggle = (
    <button
      type="button"
      onClick={onToggleCollapsed}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="hidden items-center justify-center gap-2 border-t border-white/10 px-3 py-3 text-[#f5e6d8]/70 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 lg:flex"
    >
      {collapsed ? <ChevronsRightIcon className="h-5 w-5" /> : <ChevronsLeftIcon className="h-5 w-5" />}
      {!collapsed && <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Collapse</span>}
    </button>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-black/20 bg-gradient-to-b from-primary-deep via-[#6e2418] to-primary-deep transition-[width] duration-300 ease-in-out lg:flex ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
        aria-label="Sidebar navigation"
      >
        {brandRow(collapsed)}
        {navList(collapsed)}
        {footerRow(collapsed, handleLogout)}
        {collapseToggle}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 h-full w-full cursor-default bg-black/55 backdrop-blur-[2px]"
            onClick={onCloseMobile}
          />
          <aside
            id="mobile-sidebar"
            className="animate-drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-black/20 bg-gradient-to-b from-primary-deep via-[#6e2418] to-primary-deep shadow-2xl"
            aria-label="Mobile navigation"
          >
            {brandRow(false, onCloseMobile)}
            {navList(false)}
            {footerRow(false, handleLogout)}
          </aside>
        </div>
      )}
    </>
  );
}

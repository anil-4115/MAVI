import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { Icon, type IconName } from "../../components/ui/Icon";
import { useAuth } from "../../features/auth/useAuth";
import { useUnreadCount } from "../../features/notifications/useUnreadCount";
import "./AppLayout.css";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  activeOnlyOnExact?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard", activeOnlyOnExact: true },
  { to: "/groups", label: "Groups", icon: "groups" },
  { to: "/expenses", label: "Expenses", icon: "expenses" },
  { to: "/balances", label: "Balances", icon: "balances" },
  { to: "/settlements", label: "Settlements", icon: "settlements" },
];

const INSIGHTS_NAV: NavItem[] = [
  { to: "/reports", label: "Reports", icon: "reports" },
  { to: "/notifications", label: "Notifications", icon: "notifications" },
];

const TOOLS_NAV: NavItem[] = [
  { to: "/tools/budget", label: "Budget Planner", icon: "wallet" },
  { to: "/tools/recurring", label: "Recurring Expenses", icon: "clock" },
  { to: "/tools/reminders", label: "Reminders", icon: "bell-off" },
];

const ACCOUNT_NAV: NavItem[] = [
  { to: "/profile", label: "Profile", icon: "user", activeOnlyOnExact: true },
  { to: "/profile?tab=settings", label: "Settings", icon: "settings" },
  { to: "/profile?tab=help", label: "Help & Support", icon: "help" },
];

const HEADER_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Your finances at a glance." },
  "/groups": { title: "Groups", subtitle: "Split shared expenses with friends and family." },
  "/expenses": { title: "Expenses", subtitle: "Personal and group expenses." },
  "/balances": { title: "Balances", subtitle: "Who owes whom, at a glance." },
  "/settlements": { title: "Settlements", subtitle: "Recent settlements across your groups." },
  "/reports": { title: "Reports", subtitle: "Filter, understand and export your spending." },
  "/notifications": { title: "Notifications", subtitle: "Activity across your groups." },
  "/profile": { title: "Profile", subtitle: "Manage your MAVI account." },
  "/tools/recurring": { title: "Recurring Expenses", subtitle: "Automate recurring bills for yourself or a group." },
};

function NavLinkItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { count } = useUnreadCount();
  return (
    <NavLink
      to={item.to}
      end={item.activeOnlyOnExact}
      onClick={onNavigate}
      className={({ isActive }) => `app-nav__link${isActive ? " app-nav__link--active" : ""}`}
    >
      <span className="app-nav__label">
        <Icon name={item.icon} size={18} aria-hidden="true" />
        <span>{item.label}</span>
      </span>
      {item.to === "/notifications" && count > 0 && (
        <span className="app-nav__badge" aria-label={`${count} unread notifications`}>
          {count}
        </span>
      )}
    </NavLink>
  );
}

function NavSection({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate?: () => void }) {
  return (
    <div className="app-nav__section">
      <p className="app-nav__section-title">{title}</p>
      {items.map((item) => (
        <NavLinkItem key={item.to} item={item} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function UserCard({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    onNavigate?.();
    navigate("/login", { replace: true });
  };

  const closeMenu = (): void => setMenuOpen(false);

  return (
    <div className="app-user" ref={menuRef}>
      <button
        type="button"
        className="app-user__trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Avatar name={user?.name} size="sm" />
        <span className="app-user__info">
          <span className="app-user__name">{user?.name ?? "Unknown"}</span>
          <span className="app-user__email">{user?.email}</span>
        </span>
        <Icon name="chevron-down" size={16} className="app-user__chevron" />
      </button>

      {menuOpen && (
        <div className="app-user__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              navigate("/profile");
            }}
          >
            <Icon name="user" size={16} /> Profile
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              navigate("/profile?tab=settings");
            }}
          >
            <Icon name="settings" size={16} /> Settings
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              navigate("/profile?tab=help");
            }}
          >
            <Icon name="help" size={16} /> Help & Support
          </button>
          <hr className="app-user__divider" />
          <button type="button" role="menuitem" className="app-user__menu-logout" onClick={handleLogout}>
            <Icon name="logout" size={16} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarFooter() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };
  return (
    <div className="app-user app-user--static">
      <Avatar name={user?.name} size="sm" />
      <div className="app-user__info">
        <span className="app-user__name">{user?.name ?? "Unknown"}</span>
        <span className="app-user__email">{user?.email}</span>
      </div>
      <button type="button" className="icon-btn icon-btn--ghost" aria-label="Log out" onClick={handleLogout}>
        <Icon name="logout" size={17} />
      </button>
    </div>
  );
}

function HeaderBell() {
  const { count } = useUnreadCount();
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname === "/notifications";
  return (
    <button
      type="button"
      className={`icon-btn${active ? " icon-btn--accent" : ""}`}
      aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
      onClick={() => navigate("/notifications")}
    >
      <Icon name="notifications" size={18} />
      {count > 0 && (
        <span className="app-header__badge" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}

const BOTTOM_NAV: { to: string; label: string; icon: IconName; exact?: boolean }[] = [
  { to: "/dashboard", label: "Home", icon: "home", exact: true },
  { to: "/groups", label: "Groups", icon: "groups" },
  { to: "/notifications", label: "Activity", icon: "activity" },
  { to: "/balances", label: "Balances", icon: "balances" },
];

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const closeDrawer = (): void => setDrawerOpen(false);

  const pathname = location.pathname;
  const tab = new URLSearchParams(location.search).get("tab");
  const headerKey = tab === "settings" || tab === "help" ? `/profile?tab=${tab}` : pathname;
  const header = HEADER_TITLES[headerKey] ?? HEADER_TITLES[pathname] ?? {
    title: "MAVI",
    subtitle: "Split Smarter. Together.",
  };

  const pageTitle = header.title;

  return (
    <div className="app-shell">
      <aside className={`app-sidebar${drawerOpen ? " app-sidebar--open" : ""}`}>
        <NavLink to="/dashboard" className="app-brand" onClick={closeDrawer}>
          <span className="app-brand__mark" aria-hidden="true">
            M
          </span>
          <span className="app-brand__text">
            <span className="app-brand__name">MAVI</span>
            <span className="app-brand__tagline">Split Smarter. Together.</span>
          </span>
        </NavLink>

        <nav className="app-nav" aria-label="Main navigation">
          <NavSection title="Main" items={MAIN_NAV} onNavigate={closeDrawer} />
          <NavSection title="Insights" items={INSIGHTS_NAV} onNavigate={closeDrawer} />
          <NavSection title="Tools" items={TOOLS_NAV} onNavigate={closeDrawer} />
          <NavSection title="Account" items={ACCOUNT_NAV} onNavigate={closeDrawer} />
        </nav>

        <div className="app-sidebar__footer">
          <SidebarFooter />
        </div>
      </aside>

      {drawerOpen && (
        <button type="button" className="app-backdrop" aria-label="Close navigation" onClick={closeDrawer} />
      )}

      <div className="app-main">
        <header className="app-header">
          <button
            type="button"
            className="icon-btn app-header__menu"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <Icon name="menu" size={19} />
          </button>

          <div className="app-header__title">
            <h1 className="app-header__heading">{pageTitle}</h1>
            <p className="app-header__subtitle">{header.subtitle}</p>
          </div>

          <div className="app-header__actions">
            <HeaderBell />
            <UserCard onNavigate={closeDrawer} />
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>

      <nav className="app-bottom-nav" aria-label="Quick navigation">
        {BOTTOM_NAV.slice(0, 2).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `app-bottom-nav__link${isActive ? " app-bottom-nav__link--active" : ""}`
            }
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className="app-bottom-nav__add"
          aria-label="Add expense"
          onClick={() => navigate("/expenses?add=1")}
        >
          <span className="app-bottom-nav__add-ring">
            <Icon name="plus" size={22} />
          </span>
        </button>
        {BOTTOM_NAV.slice(2).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `app-bottom-nav__link${isActive ? " app-bottom-nav__link--active" : ""}`
            }
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
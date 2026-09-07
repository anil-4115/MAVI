import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/useAuth";
import { useUnreadCount } from "../../features/notifications/useUnreadCount";
import "./AppLayout.css";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", end: true },
  { to: "/groups", label: "Groups" },
  { to: "/notifications", label: "Notifications" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { count } = useUnreadCount();

  return (
    <nav className="app-nav" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) => `app-nav__link${isActive ? " app-nav__link--active" : ""}`}
        >
          <span>{item.label}</span>
          {item.to === "/notifications" && count > 0 && (
            <span className="app-nav__badge" aria-label={`${count} unread notifications`}>
              {count}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function UserSection({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    onNavigate?.();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-user">
      <div className="app-user__info">
        <span className="app-user__name">{user?.name ?? "Unknown"}</span>
        <span className="app-user__email">{user?.email}</span>
      </div>
      <button className="btn btn--secondary btn--sm" type="button" onClick={handleLogout}>
        Log out
      </button>
    </div>
  );
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="app-shell">
      <aside className={`app-sidebar${menuOpen ? " app-sidebar--open" : ""}`}>
        <NavLink to="/dashboard" className="app-brand" onClick={closeMenu}>
          MAVI
        </NavLink>
        <NavLinks onNavigate={closeMenu} />
        <div className="app-sidebar__footer">
          <UserSection onNavigate={closeMenu} />
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          className="app-backdrop"
          aria-label="Close navigation"
          onClick={closeMenu}
        />
      )}

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="app-topbar__menu"
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
          <NavLink to="/dashboard" className="app-topbar__brand">
            MAVI
          </NavLink>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
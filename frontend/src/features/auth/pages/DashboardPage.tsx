import { useNavigate } from "react-router-dom";
import { useAuth } from "../useAuth";
import "../auth.css";

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <h1 className="dashboard-title">MAVI</h1>
        <button className="auth-button auth-button--secondary" type="button" onClick={handleLogout}>
          Log out
        </button>
      </header>

      <section className="dashboard-card">
        <p className="dashboard-label">Signed in as</p>
        {user ? (
          <>
            <h2 className="dashboard-name">{user.name}</h2>
            <p className="dashboard-email">{user.email}</p>
          </>
        ) : (
          <p>Session unavailable.</p>
        )}
        <p className="dashboard-note">
          Your dashboard is on its way. Authentication is working correctly.
        </p>
      </section>
    </main>
  );
}
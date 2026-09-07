import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../useAuth";
import { validateEmail, validateLoginPassword } from "../validation";
import "../auth.css";

type FieldErrors = Partial<Record<"email" | "password", string | null>>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/dashboard";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const errors: FieldErrors = {
      email: validateEmail(email),
      password: validateLoginPassword(password),
    };
    setFieldErrors(errors);
    setFormError(null);

    if (errors.email || errors.password) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your MAVI account</p>

        {formError && (
          <div className="auth-banner" role="alert">
            {formError}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className={`auth-field${fieldErrors.email ? " auth-field--invalid" : ""}`}>
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            />
            {fieldErrors.email && (
              <span id="login-email-error" className="auth-field-error">
                {fieldErrors.email}
              </span>
            )}
          </div>

          <div className={`auth-field${fieldErrors.password ? " auth-field--invalid" : ""}`}>
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
            />
            {fieldErrors.password && (
              <span id="login-password-error" className="auth-field-error">
                {fieldErrors.password}
              </span>
            )}
          </div>

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-switch">
          Don&apos;t have an account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </main>
  );
}
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../useAuth";
import {
  validateConfirmPassword,
  validateEmail,
  validateName,
  validatePassword,
} from "../validation";
import "../auth.css";

type FieldErrors = Partial<
  Record<"name" | "email" | "password" | "confirmPassword", string | null>
>;

export function RegisterPage() {
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const errors: FieldErrors = {
      name: validateName(name),
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: validateConfirmPassword(confirmPassword, password),
    };
    setFieldErrors(errors);
    setFormError(null);

    if (errors.name || errors.email || errors.password || errors.confirmPassword) {
      return;
    }

    setIsSubmitting(true);
    try {
      // The account must be verified by email before it can sign in.
      const message = await register({ name, email, password });
      setSuccessMessage(message);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successMessage) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-brand" aria-hidden="true">
            <span className="auth-brand__mark">M</span>
            <span className="auth-brand__name">MAVI</span>
          </div>
          <h1 className="auth-title">Check your email</h1>
          <div className="auth-success" role="status">
            <div className="auth-success__icon" aria-hidden="true">
              ✓
            </div>
            <p className="auth-success__text">{successMessage}</p>
            <p className="auth-success__hint">
              We emailed <strong>{email}</strong>. Open the link in that message to activate
              your account — check your spam folder if it does not arrive shortly.
            </p>
          </div>
          <p className="auth-switch">
            Already verified? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-brand" aria-hidden="true">
          <span className="auth-brand__mark">M</span>
          <span className="auth-brand__name">MAVI</span>
        </div>
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Join MAVI in seconds</p>

        {formError && (
          <div className="auth-banner" role="alert">
            {formError}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className={`auth-field${fieldErrors.name ? " auth-field--invalid" : ""}`}>
            <label htmlFor="register-name">Name</label>
            <input
              id="register-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
              autoFocus
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "register-name-error" : undefined}
            />
            {fieldErrors.name && (
              <span id="register-name-error" className="auth-field-error">
                {fieldErrors.name}
              </span>
            )}
          </div>

          <div className={`auth-field${fieldErrors.email ? " auth-field--invalid" : ""}`}>
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
            />
            {fieldErrors.email && (
              <span id="register-email-error" className="auth-field-error">
                {fieldErrors.email}
              </span>
            )}
          </div>

          <div className={`auth-field${fieldErrors.password ? " auth-field--invalid" : ""}`}>
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters, letters and numbers"
              autoComplete="new-password"
              minLength={8}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "register-password-error" : undefined}
            />
            {fieldErrors.password && (
              <span id="register-password-error" className="auth-field-error">
                {fieldErrors.password}
              </span>
            )}
          </div>

          <div
            className={`auth-field${fieldErrors.confirmPassword ? " auth-field--invalid" : ""}`}
          >
            <label htmlFor="register-confirm">Confirm password</label>
            <input
              id="register-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              autoComplete="new-password"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={
                fieldErrors.confirmPassword ? "register-confirm-error" : undefined
              }
            />
            {fieldErrors.confirmPassword && (
              <span id="register-confirm-error" className="auth-field-error">
                {fieldErrors.confirmPassword}
              </span>
            )}
          </div>

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
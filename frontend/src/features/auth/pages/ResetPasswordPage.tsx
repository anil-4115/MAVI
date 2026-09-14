import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/authApi";
import { validateConfirmPassword, validatePassword, validateResetToken } from "../validation";
import "../auth.css";

type FieldErrors = Partial<Record<"password" | "confirmPassword", string | null>>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const rawToken = searchParams.get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // The token never leaves the URL/request when rejected client-side.
  const tokenError = validateResetToken(rawToken);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (tokenError) {
      setFormError(tokenError);
      return;
    }

    const errors: FieldErrors = {
      password: validatePassword(password),
      confirmPassword: validateConfirmPassword(confirmPassword, password),
    };
    setFieldErrors(errors);
    setFormError(null);

    if (errors.password || errors.confirmPassword) {
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword({ token: rawToken, password });
      setIsSuccess(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-brand" aria-hidden="true">
            <span className="auth-brand__mark">M</span>
            <span className="auth-brand__name">MAVI</span>
          </div>
          <h1 className="auth-title">Password updated</h1>
          <div className="auth-success" role="status">
            <div className="auth-success__icon" aria-hidden="true">
              ✓
            </div>
            <p className="auth-success__text">Your password has been reset.</p>
            <p className="auth-success__hint">Sign in with your new password to continue.</p>
          </div>
          <p className="auth-switch">
            <Link to="/login">Go to sign in</Link>
          </p>
        </div>
      </main>
    );
  }

  if (tokenError) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-brand" aria-hidden="true">
            <span className="auth-brand__mark">M</span>
            <span className="auth-brand__name">MAVI</span>
          </div>
          <h1 className="auth-title">Invalid reset link</h1>
          <div className="auth-success auth-success--error" role="alert">
            <div className="auth-success__icon" aria-hidden="true">
              ×
            </div>
            <p className="auth-success__text">This reset link is invalid or has expired.</p>
            <p className="auth-success__hint">
              Request a new link — each one is single-use and only valid for one hour.
            </p>
          </div>
          <p className="auth-switch">
            <Link to="/forgot-password">Request a new link</Link>
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
        <h1 className="auth-title">Choose a new password</h1>
        <p className="auth-subtitle">Enter a new password for your MAVI account.</p>

        {formError && (
          <div className="auth-banner" role="alert">
            {formError}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className={`auth-field${fieldErrors.password ? " auth-field--invalid" : ""}`}>
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters, letters and numbers"
              autoComplete="new-password"
              minLength={8}
              autoFocus
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "reset-password-error" : undefined}
            />
            {fieldErrors.password && (
              <span id="reset-password-error" className="auth-field-error">
                {fieldErrors.password}
              </span>
            )}
          </div>

          <div
            className={`auth-field${fieldErrors.confirmPassword ? " auth-field--invalid" : ""}`}
          >
            <label htmlFor="reset-confirm">Confirm new password</label>
            <input
              id="reset-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your new password"
              autoComplete="new-password"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={
                fieldErrors.confirmPassword ? "reset-confirm-error" : undefined
              }
            />
            {fieldErrors.confirmPassword && (
              <span id="reset-confirm-error" className="auth-field-error">
                {fieldErrors.confirmPassword}
              </span>
            )}
          </div>

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Resetting…" : "Reset password"}
          </button>
        </form>

        <p className="auth-switch">
          Remembered it? <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
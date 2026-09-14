import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/authApi";
import { validateEmail } from "../validation";
import "../auth.css";

type FieldErrors = Partial<Record<"email", string | null>>;

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Single success state for any submitted address — never reveals whether an
  // account exists.
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const errors: FieldErrors = { email: validateEmail(email) };
    setFieldErrors(errors);
    setFormError(null);

    if (errors.email) {
      return;
    }

    setIsSubmitting(true);
    try {
      await forgotPassword({ email });
      setSubmittedEmail(email.trim().toLowerCase());
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedEmail !== null) {
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
            <p className="auth-success__text">Reset link sent</p>
            <p className="auth-success__hint">
              If an account exists for <strong>{submittedEmail}</strong>, a password reset
              link is on its way. Open it within an hour to choose a new password — check
              your spam folder if it does not arrive shortly.
            </p>
          </div>
          <p className="auth-switch">
            Remembered it? <Link to="/login">Back to sign in</Link>
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
        <h1 className="auth-title">Reset your password</h1>
        <p className="auth-subtitle">
          Enter your account email and we&apos;ll send you a link to reset your password.
        </p>

        {formError && (
          <div className="auth-banner" role="alert">
            {formError}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className={`auth-field${fieldErrors.email ? " auth-field--invalid" : ""}`}>
            <label htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "forgot-email-error" : undefined}
            />
            {fieldErrors.email && (
              <span id="forgot-email-error" className="auth-field-error">
                {fieldErrors.email}
              </span>
            )}
          </div>

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="auth-switch">
          Remembered it? <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getErrorMessage } from "../../../services/api";
import { verifyEmail, type VerifyEmailResponse } from "../api/authApi";
import "../auth.css";

type VerifyState = "verifying" | "success" | "already" | "error";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<VerifyState>("verifying");
  const [headline, setHeadline] = useState("Verifying your email…");
  const [detail, setDetail] = useState("");
  // Single-flight cache: React StrictMode double-mounts the effect in dev, which
  // would otherwise fire two requests. Both mounts share one in-flight promise
  // (the endpoint itself is idempotent regardless).
  const inFlight = useRef<{ token: string; promise: Promise<VerifyEmailResponse> } | null>(null);

  useEffect(() => {
    const token = searchParams.get("token")?.trim() ?? "";

    if (!token) {
      setState("error");
      setHeadline("This link is missing its verification token");
      setDetail("Open the verification link from the email you received.");
      return;
    }

    if (!inFlight.current || inFlight.current.token !== token) {
      inFlight.current = {
        token,
        promise: verifyEmail(token).finally(() => {
          if (inFlight.current?.token === token) inFlight.current = null;
        }),
      };
    }

    let active = true;
    inFlight.current.promise
      .then((result) => {
        if (!active) return;
        setDetail(result.message);
        if (result.emailVerified) {
          setState("success");
          setHeadline("Email verified");
        } else {
          setState("already");
          setHeadline("Already verified");
        }
      })
      .catch((error) => {
        if (!active) return;
        setState("error");
        setHeadline("We could not verify this link");
        setDetail(getErrorMessage(error));
      });

    return () => {
      active = false;
    };
  }, [searchParams]);

  const icon = state === "verifying" ? "…" : state === "success" ? "✓" : state === "already" ? "!" : "×";
  const footer = (() => {
    switch (state) {
      case "success":
      case "already":
        return (
          <p className="auth-switch">
            Your account is ready. <Link to="/login">Sign in</Link>
          </p>
        );
      case "error":
        return (
          <p className="auth-switch">
            Need a fresh link? Create an account again with the same email to get one.
            <br />
            <Link to="/register">Create account</Link>
          </p>
        );
      default:
        return undefined;
    }
  })();

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-brand" aria-hidden="true">
          <span className="auth-brand__mark">M</span>
          <span className="auth-brand__name">MAVI</span>
        </div>
        <h1 className="auth-title">{headline}</h1>
        <div
          className={`auth-success auth-success--${state}`}
          role={state === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <div className="auth-success__icon" aria-hidden="true">
            {icon}
          </div>
          {detail && <p className="auth-success__text">{detail}</p>}
          {state === "verifying" && (
            <p className="auth-success__hint">Hold on while we confirm your address.</p>
          )}
        </div>
        {state !== "verifying" && footer}
      </div>
    </main>
  );
}
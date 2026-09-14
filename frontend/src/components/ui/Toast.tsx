import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  addToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const MAX_VISIBLE = 4;
const DISMISS_MS = 5000;

const TONE_ICONS: Record<ToastTone, IconName> = {
  success: "check",
  error: "alert",
  info: "notifications",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (toasts.length === 0) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [toasts]);

  const addToast: ToastContextValue["addToast"] = useCallback((message, tone = "info") => {
    const toast: ToastItem = { id: Date.now() + Math.random(), message, tone };
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), toast]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext value={{ addToast }}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`} role="status">
            <span className="toast__icon" aria-hidden="true">
              <Icon name={TONE_ICONS[toast.tone]} size={13} />
            </span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              type="button"
              className="icon-btn icon-btn--ghost"
              aria-label="Dismiss"
              style={{ width: 28, height: 28, minWidth: 28, minHeight: 28 }}
              onClick={() => dismiss(toast.id)}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
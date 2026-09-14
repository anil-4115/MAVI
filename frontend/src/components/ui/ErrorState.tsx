import { Icon } from "./Icon";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <div className="error-state__icon" aria-hidden="true">
        <Icon name="alert" size={22} />
      </div>
      <p className="error-state__message">{message}</p>
      {onRetry && (
        <button className="btn btn--secondary" type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
interface SkeletonProps {
  variant?: "text" | "title" | "card" | "chip";
  className?: string;
  width?: string;
  height?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

/** Shimmer placeholder block. Combine `variant` with optional inline sizing. */
export function Skeleton({
  variant = "text",
  className,
  width,
  height,
  "aria-hidden": ariaHidden,
}: SkeletonProps) {
  const aria = ariaHidden ?? true;
  if (variant === "card" || variant === "chip") {
    return (
      <div
        className={`skeleton skeleton--${variant}${className ? ` ${className}` : ""}`}
        aria-hidden={aria}
      />
    );
  }
  return (
    <div
      className={`skeleton skeleton--${variant}${className ? ` ${className}` : ""}`}
      style={{ width, height }}
      aria-hidden={aria}
    />
  );
}

/** Column of skeleton lines, mimics a list of rows. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} variant="card" />
      ))}
    </div>
  );
}

/** Compact skeleton for summary cards. */
export function SkeletonSummary({ cards = 4 }: { cards?: number }) {
  return (
    <div className="summary-grid" aria-hidden="true">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="summary-card">
          <Skeleton variant="text" width="45%" />
          <Skeleton variant="title" width="70%" />
        </div>
      ))}
    </div>
  );
}
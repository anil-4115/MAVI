import type { ReactNode } from "react";

type BannerTone = "success" | "error";

interface BannerProps {
  tone: BannerTone;
  children: ReactNode;
}

export function Banner({ tone, children }: BannerProps) {
  return (
    <div className={`banner banner--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
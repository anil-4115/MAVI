import { createContext, type Context } from "react";

export interface UnreadCountContextValue {
  count: number;
  refresh: () => Promise<void>;
}

export const UnreadCountContext: Context<UnreadCountContextValue | undefined> = createContext<
  UnreadCountContextValue | undefined
>(undefined);
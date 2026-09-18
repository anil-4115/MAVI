/** Lifecycle of a settlement record. Only `completed` settlements affect balances. */
export const SETTLEMENT_STATUSES = ["completed", "cancelled"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

/** Validated input for recording a settlement (createSettlement service). */
export interface CreateSettlementInput {
  payerId: string;
  receiverId: string;
  amountMinor: number;
  currency: string;
  date: Date;
  note?: string;
  /** Client-owned correlation id; replaying the same key never duplicates. */
  idempotencyKey: string;
}

/** Safe, serialized settlement. Never includes sensitive user fields. */
export interface PublicSettlement {
  id: string;
  group: string;
  payerId: string;
  receiverId: string;
  amountMinor: number;
  currency: string;
  date: string;
  note: string | null;
  createdBy: string;
  status: SettlementStatus;
  createdAt: string;
  updatedAt: string;
}
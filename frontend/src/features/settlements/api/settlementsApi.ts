import type { ApiEnvelope, PaginatedResult } from "../../../lib/types";
import api from "../../../services/api";

/**
 * Settlement API contract (backend/src/modules/settlements/*.ts).
 * Only `completed` settlements affect balances; cancelled records are
 * preserved for history. Money is integer minor units — the backend is
 * authoritative, the frontend only formats.
 */

export const SETTLEMENT_STATUSES = ["completed", "cancelled"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

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

export interface CreateSettlementPayload {
  payerId: string;
  receiverId: string;
  amountMinor: number;
  currency?: string;
  /** ISO date; defaults to now on the backend when omitted. */
  date?: string;
  note?: string;
}

interface SettlementResponse extends ApiEnvelope<{ settlement: PublicSettlement }> {}
interface SettlementsResponse extends ApiEnvelope<PaginatedResult<PublicSettlement>> {}

/** Active member only. Archived groups remain listable (read-only SRP is enforced on mutations). */
export const listSettlements = async (
  groupId: string,
  params: { page: number; limit: number; status?: SettlementStatus },
): Promise<PaginatedResult<PublicSettlement>> => {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("limit", String(params.limit));
  if (params.status !== undefined) {
    query.set("status", params.status);
  }
  const response = await api.get<SettlementsResponse>(`/groups/${groupId}/settlements?${query.toString()}`);
  return response.data.data;
};

/** Any active member records a settlement between two active members. Archived groups reject (409). */
export const createSettlement = async (
  groupId: string,
  payload: CreateSettlementPayload,
): Promise<PublicSettlement> => {
  const response = await api.post<SettlementResponse>(`/groups/${groupId}/settlements`, payload);
  return response.data.data.settlement;
};

/** Creator or group owner: completed -> cancelled. The record is preserved, never deleted. */
export const cancelSettlement = async (groupId: string, settlementId: string): Promise<PublicSettlement> => {
  const response = await api.patch<SettlementResponse>(`/groups/${groupId}/settlements/${settlementId}/status`);
  return response.data.data.settlement;
};
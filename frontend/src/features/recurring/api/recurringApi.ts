import type { ApiEnvelope } from "../../../lib/types";
import api from "../../../services/api";
import type { SplitMethod, SplitPayload } from "../../expenses/api/expensesApi";

/**
 * Recurring-expense API client (backend/src/modules/recurring/*).
 *
 * Mirrors the backend contract. Recurring rules can be personal (group = null)
 * or belong to a group; the two have separate endpoints but identical response
 * shapes. All money is integer minor units (paise) and the backend stays
 * authoritative. `startDate` / `endDate` / `nextOccurrence` are UTC day keys
 * (`YYYY-MM-DD`), never ISO instants.
 */

export const RECURRING_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

/** Mirrors backend PublicRecurringRule. `splitInput` is the stored engine request (read-only). */
export interface PublicRecurringRule {
  id: string;
  group: string | null;
  owner: string;
  title: string;
  amountMinor: number;
  currency: string;
  payerId: string;
  splitMethod: SplitMethod;
  splitInput: unknown;
  frequency: RecurringFrequency;
  interval: number;
  startDate: string;
  nextOccurrence: string;
  endDate: string | null;
  active: boolean;
  lastGeneratedOccurrence: string | null;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
}

export interface RuleRunResult {
  generated: boolean;
  expenseId: string | null;
  skippedMissed: boolean;
  deactivated: boolean;
}

export interface CreatePersonalRulePayload {
  title: string;
  amountMinor: number;
  currency?: string;
  frequency: RecurringFrequency;
  interval?: number;
  startDate: string;
  endDate: string | null;
}

export interface CreateGroupRulePayload {
  title: string;
  amountMinor: number;
  currency?: string;
  payerId: string;
  split: SplitPayload;
  frequency: RecurringFrequency;
  interval?: number;
  startDate: string;
  endDate: string | null;
}

export interface UpdateRulePayload {
  title?: string;
  amountMinor?: number;
  payerId?: string;
  split?: SplitPayload;
  frequency?: RecurringFrequency;
  interval?: number;
  startDate?: string;
  /** null clears the end date; undefined leaves it unchanged. */
  endDate?: string | null;
}

type RuleResponse = ApiEnvelope<{ rule: PublicRecurringRule }>;
type RuleListResponse = ApiEnvelope<{ rules: PublicRecurringRule[] }>;
type RunResponse = ApiEnvelope<RuleRunResult>;

/* ------------------------------ personal rules ---------------------------- */

export const listPersonalRules = async (): Promise<PublicRecurringRule[]> => {
  const response = await api.get<RuleListResponse>("/recurring/personal");
  return response.data.data.rules;
};

export const createPersonalRule = async (
  payload: CreatePersonalRulePayload,
): Promise<PublicRecurringRule> => {
  const response = await api.post<RuleResponse>("/recurring/personal", payload);
  return response.data.data.rule;
};

export const updatePersonalRule = async (
  ruleId: string,
  payload: UpdateRulePayload,
): Promise<PublicRecurringRule> => {
  const response = await api.patch<RuleResponse>(`/recurring/personal/${ruleId}`, payload);
  return response.data.data.rule;
};

export const deletePersonalRule = async (ruleId: string): Promise<void> => {
  await api.delete<ApiEnvelope<null>>(`/recurring/personal/${ruleId}`);
};

export const pausePersonalRule = async (ruleId: string): Promise<PublicRecurringRule> => {
  const response = await api.post<RuleResponse>(`/recurring/personal/${ruleId}/pause`);
  return response.data.data.rule;
};

export const resumePersonalRule = async (ruleId: string): Promise<PublicRecurringRule> => {
  const response = await api.post<RuleResponse>(`/recurring/personal/${ruleId}/resume`);
  return response.data.data.rule;
};

export const generatePersonalRuleNow = async (ruleId: string): Promise<RuleRunResult> => {
  const response = await api.post<RunResponse>(`/recurring/personal/${ruleId}/generate-now`);
  return response.data.data;
};

/* ------------------------------- group rules ------------------------------ */

export const listGroupRules = async (groupId: string): Promise<PublicRecurringRule[]> => {
  const response = await api.get<RuleListResponse>(`/groups/${groupId}/recurring`);
  return response.data.data.rules;
};

export const createGroupRule = async (
  groupId: string,
  payload: CreateGroupRulePayload,
): Promise<PublicRecurringRule> => {
  const response = await api.post<RuleResponse>(`/groups/${groupId}/recurring`, payload);
  return response.data.data.rule;
};

export const updateGroupRule = async (
  groupId: string,
  ruleId: string,
  payload: UpdateRulePayload,
): Promise<PublicRecurringRule> => {
  const response = await api.patch<RuleResponse>(`/groups/${groupId}/recurring/${ruleId}`, payload);
  return response.data.data.rule;
};

export const deleteGroupRule = async (groupId: string, ruleId: string): Promise<void> => {
  await api.delete<ApiEnvelope<null>>(`/groups/${groupId}/recurring/${ruleId}`);
};

export const pauseGroupRule = async (groupId: string, ruleId: string): Promise<PublicRecurringRule> => {
  const response = await api.post<RuleResponse>(`/groups/${groupId}/recurring/${ruleId}/pause`);
  return response.data.data.rule;
};

export const resumeGroupRule = async (groupId: string, ruleId: string): Promise<PublicRecurringRule> => {
  const response = await api.post<RuleResponse>(`/groups/${groupId}/recurring/${ruleId}/resume`);
  return response.data.data.rule;
};

export const generateGroupRuleNow = async (
  groupId: string,
  ruleId: string,
): Promise<RuleRunResult> => {
  const response = await api.post<RunResponse>(`/groups/${groupId}/recurring/${ruleId}/generate-now`);
  return response.data.data;
};

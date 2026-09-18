import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../../../services/api";
import {
  createGroupRule,
  createPersonalRule,
  deleteGroupRule,
  deletePersonalRule,
  generateGroupRuleNow,
  generatePersonalRuleNow,
  listGroupRules,
  listPersonalRules,
  pauseGroupRule,
  pausePersonalRule,
  resumeGroupRule,
  resumePersonalRule,
  updateGroupRule,
  updatePersonalRule,
  type CreateGroupRulePayload,
  type CreatePersonalRulePayload,
  type PublicRecurringRule,
  type RuleRunResult,
  type UpdateRulePayload,
} from "../api/recurringApi";

export type RecurringScope = { type: "personal" } | { type: "group"; groupId: string };

/**
 * Loads and mutates recurring rules for a single scope (personal or one group).
 * All network calls branch here so pages/components stay presentational. The
 * backend remains authoritative for authorization and idempotency.
 */
export function useRecurringRules(scope: RecurringScope | null) {
  const [rules, setRules] = useState<PublicRecurringRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!scope) {
      setRules(null);
      setError(null);
      return;
    }
    setError(null);
    setRules(null);
    try {
      const next =
        scope.type === "personal"
          ? await listPersonalRules()
          : await listGroupRules(scope.groupId);
      setRules(next);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, [scope]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (
      payload: CreatePersonalRulePayload | CreateGroupRulePayload,
    ): Promise<PublicRecurringRule> => {
      if (!scope) {
        throw new Error("No recurring scope selected");
      }
      const rule =
        scope.type === "personal"
          ? await createPersonalRule(payload as CreatePersonalRulePayload)
          : await createGroupRule(scope.groupId, payload as CreateGroupRulePayload);
      setRules((current) => [rule, ...(current ?? [])]);
      return rule;
    },
    [scope],
  );

  const update = useCallback(
    async (ruleId: string, payload: UpdateRulePayload): Promise<PublicRecurringRule> => {
      if (!scope) {
        throw new Error("No recurring scope selected");
      }
      const rule =
        scope.type === "personal"
          ? await updatePersonalRule(ruleId, payload)
          : await updateGroupRule(scope.groupId, ruleId, payload);
      setRules((current) => (current ?? []).map((entry) => (entry.id === rule.id ? rule : entry)));
      return rule;
    },
    [scope],
  );

  const remove = useCallback(
    async (ruleId: string): Promise<void> => {
      if (!scope) {
        throw new Error("No recurring scope selected");
      }
      if (scope.type === "personal") {
        await deletePersonalRule(ruleId);
      } else {
        await deleteGroupRule(scope.groupId, ruleId);
      }
      setRules((current) => (current ?? []).filter((entry) => entry.id !== ruleId));
    },
    [scope],
  );

  const setActive = useCallback(
    async (ruleId: string, active: boolean): Promise<PublicRecurringRule> => {
      if (!scope) {
        throw new Error("No recurring scope selected");
      }
      let rule: PublicRecurringRule;
      if (scope.type === "personal") {
        rule = active ? await resumePersonalRule(ruleId) : await pausePersonalRule(ruleId);
      } else {
        rule = active
          ? await resumeGroupRule(scope.groupId, ruleId)
          : await pauseGroupRule(scope.groupId, ruleId);
      }
      setRules((current) => (current ?? []).map((entry) => (entry.id === rule.id ? rule : entry)));
      return rule;
    },
    [scope],
  );

  const generateNow = useCallback(
    async (ruleId: string): Promise<RuleRunResult> => {
      if (!scope) {
        throw new Error("No recurring scope selected");
      }
      const result =
        scope.type === "personal"
          ? await generatePersonalRuleNow(ruleId)
          : await generateGroupRuleNow(scope.groupId, ruleId);
      await reload();
      return result;
    },
    [scope, reload],
  );

  return { rules, error, reload, create, update, remove, setActive, generateNow };
}

import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { Group, type GroupDocument } from "../groups/group.model.js";
import { createGroupExpense, createPersonalExpense } from "../expenses/expense.service.js";
import { getParticipantUserIds, validateSplitPayload } from "../expenses/expense.validation.js";
import {
  advanceOccurrence,
  firstOccurrenceOnOrAfter,
  todayUtcDayKey,
} from "./recurrence.js";
import { RecurringGeneration, RecurringRule, type RecurringRuleDocument } from "./recurring.model.js";
import type {
  CreateGroupRuleInput,
  CreatePersonalRuleInput,
  UpdateRuleInput,
} from "./recurring.validation.js";
import type { PublicRecurringRule, RecurringFrequency } from "./recurring.types.js";

/* --------------------------------- helpers -------------------------------- */

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;

const findGroupOrThrow = async (groupId: string): Promise<GroupDocument> => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, "Group not found");
  }
  return group as unknown as GroupDocument;
};

const getMembership = (group: GroupDocument, userId: string) =>
  group.members.find((m) => m.userId.toString() === userId);

/** Active member only; uniform 404 so non-members cannot probe group existence. */
const assertActorActive = (group: GroupDocument, actorId: string): void => {
  const member = getMembership(group, actorId);
  if (!member || member.status !== "active") {
    throw new ApiError(404, "Group not found");
  }
};

const ensureWritable = (group: GroupDocument): void => {
  if (group.archived) {
    throw new ApiError(409, "Archived groups are read-only");
  }
};

const getOwnerId = (group: GroupDocument): string | null => {
  const owner = group.members.find((m) => m.role === "owner" && m.status === "active");
  return owner ? owner.userId.toString() : null;
};

const canManageRule = (rule: RecurringRuleDocument, actorId: string, groupOwnerId: string | null): boolean =>
  rule.owner.toString() === actorId || groupOwnerId === actorId;

/** Rule creator or group owner; requires active membership first. */
const assertCanManageRule = (group: GroupDocument, rule: RecurringRuleDocument, actorId: string): void => {
  assertActorActive(group, actorId);
  if (!canManageRule(rule, actorId, getOwnerId(group))) {
    throw new ApiError(403, "Only the rule creator or the group owner can manage this rule");
  }
};

const toPublicRule = (rule: RecurringRuleDocument, canManage: boolean): PublicRecurringRule => ({
  id: rule._id.toString(),
  group: rule.group ? rule.group.toString() : null,
  owner: rule.owner.toString(),
  title: rule.title,
  amountMinor: rule.amountMinor,
  currency: rule.currency,
  payerId: rule.payerId.toString(),
  splitMethod: rule.splitMethod,
  splitInput: rule.splitInput,
  frequency: rule.frequency,
  interval: rule.interval,
  startDate: rule.startDayKey,
  nextOccurrence: rule.nextOccurrence,
  endDate: rule.endDayKey,
  active: rule.active,
  lastGeneratedOccurrence: rule.lastGeneratedOccurrence,
  createdAt: rule.createdAt.toISOString(),
  updatedAt: rule.updatedAt.toISOString(),
  canManage,
});

/**
 * Pause every active rule created by `userId` inside `groupId`. Called when a
 * member leaves or is removed so their rules stop generating without deleting
 * any history or the rules themselves.
 */
export async function pauseRulesForLeavingMember(groupId: string, userId: string): Promise<void> {
  await RecurringRule.updateMany(
    { group: new Types.ObjectId(groupId), owner: new Types.ObjectId(userId), active: true },
    { $set: { active: false } },
  );
}

/** Remove all recurring rules + generation ledger rows for a group being purged. */
export async function deleteGroupRecurringData(groupId: string): Promise<void> {
  const groupObjectId = new Types.ObjectId(groupId);
  const rules = await RecurringRule.find({ group: groupObjectId }).select("_id");
  const ruleIds = rules.map((r) => r._id);
  if (ruleIds.length > 0) {
    await RecurringGeneration.deleteMany({ rule: { $in: ruleIds } });
  }
  await RecurringRule.deleteMany({ group: groupObjectId });
}

/* ----------------------------- rule validation ---------------------------- */

const assertParticipantsActive = (group: GroupDocument, userIds: string[]): void => {
  for (const userId of [...new Set(userIds)]) {
    const member = getMembership(group, userId);
    if (!member || member.status !== "active") {
      throw new ApiError(400, "Payer and participants must be active members of this group");
    }
  }
};

/* ------------------------------ group rules ------------------------------- */

export async function listGroupRules(groupId: string, viewerId: string): Promise<PublicRecurringRule[]> {
  const group = await findGroupOrThrow(groupId);
  assertActorActive(group, viewerId);

  const ownerId = getOwnerId(group);
  const rules = (await RecurringRule.find({ group: group._id }).sort({
    createdAt: -1,
    _id: -1,
  })) as unknown as RecurringRuleDocument[];

  return rules.map((rule) => toPublicRule(rule, canManageRule(rule, viewerId, ownerId)));
}

export async function createGroupRule(
  groupId: string,
  actorId: string,
  input: CreateGroupRuleInput,
): Promise<PublicRecurringRule> {
  const group = await findGroupOrThrow(groupId);
  ensureWritable(group);
  assertActorActive(group, actorId);
  assertParticipantsActive(group, [input.payerId, ...getParticipantUserIds(input.split)]);

  const todayKey = todayUtcDayKey();
  const nextOccurrence = firstOccurrenceOnOrAfter(
    input.startDate,
    input.frequency,
    input.interval,
    todayKey,
  );
  if (input.endDate && nextOccurrence > input.endDate) {
    throw new ApiError(400, "The recurrence window has already ended");
  }

  const rule = (await RecurringRule.create({
    group: group._id,
    owner: new Types.ObjectId(actorId),
    title: input.title,
    amountMinor: input.amountMinor,
    currency: input.currency,
    payerId: new Types.ObjectId(input.payerId),
    splitMethod: input.split.method,
    splitInput: input.split,
    frequency: input.frequency,
    interval: input.interval,
    startDayKey: input.startDate,
    nextOccurrence,
    endDayKey: input.endDate,
    active: true,
    lastGeneratedOccurrence: null,
  })) as unknown as RecurringRuleDocument;

  return toPublicRule(rule, true);
}

export async function getGroupRule(
  groupId: string,
  ruleId: string,
  viewerId: string,
): Promise<PublicRecurringRule> {
  const group = await findGroupOrThrow(groupId);
  assertActorActive(group, viewerId);

  const rule = (await RecurringRule.findOne({ _id: ruleId, group: group._id })) as unknown as
    | RecurringRuleDocument
    | null;
  if (!rule) {
    throw new ApiError(404, "Recurring rule not found");
  }

  return toPublicRule(rule, canManageRule(rule, viewerId, getOwnerId(group)));
}

export async function updateGroupRule(
  groupId: string,
  ruleId: string,
  actorId: string,
  input: UpdateRuleInput,
): Promise<PublicRecurringRule> {
  const group = await findGroupOrThrow(groupId);
  const rule = (await RecurringRule.findOne({ _id: ruleId, group: group._id })) as unknown as
    | RecurringRuleDocument
    | null;
  if (!rule) {
    throw new ApiError(404, "Recurring rule not found");
  }
  ensureWritable(group);
  assertCanManageRule(group, rule, actorId);

  const effectiveAmount = input.amountMinor ?? rule.amountMinor;
  const participantIds = applyCommonEdits(rule, input, effectiveAmount, true);
  assertParticipantsActive(group, [rule.payerId.toString(), ...participantIds]);

  await rule.save();
  return toPublicRule(rule, true);
}

export async function deleteGroupRule(groupId: string, ruleId: string, actorId: string): Promise<void> {
  const group = await findGroupOrThrow(groupId);
  const rule = (await RecurringRule.findOne({ _id: ruleId, group: group._id })) as unknown as
    | RecurringRuleDocument
    | null;
  if (!rule) {
    throw new ApiError(404, "Recurring rule not found");
  }
  ensureWritable(group);
  assertCanManageRule(group, rule, actorId);

  await RecurringGeneration.deleteMany({ rule: rule._id });
  await RecurringRule.deleteOne({ _id: rule._id });
}

export async function setGroupRuleActive(
  groupId: string,
  ruleId: string,
  actorId: string,
  active: boolean,
): Promise<PublicRecurringRule> {
  const group = await findGroupOrThrow(groupId);
  const rule = (await RecurringRule.findOne({ _id: ruleId, group: group._id })) as unknown as
    | RecurringRuleDocument
    | null;
  if (!rule) {
    throw new ApiError(404, "Recurring rule not found");
  }
  ensureWritable(group);
  assertCanManageRule(group, rule, actorId);

  if (rule.active === active) {
    return toPublicRule(rule, true);
  }

  if (active) {
    const nextOccurrence = firstOccurrenceOnOrAfter(
      rule.startDayKey,
      rule.frequency,
      rule.interval,
      todayUtcDayKey(),
    );
    const exhausted = rule.endDayKey !== null && nextOccurrence > rule.endDayKey;
    rule.active = !exhausted;
    rule.nextOccurrence = nextOccurrence;
  } else {
    rule.active = false;
  }

  await rule.save();
  return toPublicRule(rule, true);
}

export async function generateGroupRuleNow(
  groupId: string,
  ruleId: string,
  actorId: string,
): Promise<RuleRunResult> {
  const group = await findGroupOrThrow(groupId);
  const rule = (await RecurringRule.findOne({ _id: ruleId, group: group._id })) as unknown as
    | RecurringRuleDocument
    | null;
  if (!rule) {
    throw new ApiError(404, "Recurring rule not found");
  }
  ensureWritable(group);
  assertCanManageRule(group, rule, actorId);
  return generateRuleNow(rule);
}

/* ---------------------------- personal rules ------------------------------ */

const findPersonalRuleOrThrow = async (ownerId: string, ruleId: string): Promise<RecurringRuleDocument> => {
  const rule = (await RecurringRule.findOne({
    _id: ruleId,
    owner: new Types.ObjectId(ownerId),
    group: null,
  })) as unknown as RecurringRuleDocument | null;
  if (!rule) {
    throw new ApiError(404, "Recurring rule not found");
  }
  return rule;
};

const toPersonalSplit = (ownerId: string, amountMinor: number, currency: string) => ({
  method: "equal" as const,
  totalMinor: amountMinor,
  currency,
  equal: [{ userId: ownerId }],
});

export async function listPersonalRules(ownerId: string): Promise<PublicRecurringRule[]> {
  const rules = (await RecurringRule.find({
    owner: new Types.ObjectId(ownerId),
    group: null,
  }).sort({ createdAt: -1, _id: -1 })) as unknown as RecurringRuleDocument[];

  return rules.map((rule) => toPublicRule(rule, true));
}

export async function createPersonalRule(
  ownerId: string,
  input: CreatePersonalRuleInput,
): Promise<PublicRecurringRule> {
  const todayKey = todayUtcDayKey();
  const nextOccurrence = firstOccurrenceOnOrAfter(
    input.startDate,
    input.frequency,
    input.interval,
    todayKey,
  );
  if (input.endDate && nextOccurrence > input.endDate) {
    throw new ApiError(400, "The recurrence window has already ended");
  }

  const rule = (await RecurringRule.create({
    group: null,
    owner: new Types.ObjectId(ownerId),
    title: input.title,
    amountMinor: input.amountMinor,
    currency: input.currency,
    payerId: new Types.ObjectId(ownerId),
    splitMethod: "equal",
    splitInput: toPersonalSplit(ownerId, input.amountMinor, input.currency),
    frequency: input.frequency,
    interval: input.interval,
    startDayKey: input.startDate,
    nextOccurrence,
    endDayKey: input.endDate,
    active: true,
    lastGeneratedOccurrence: null,
  })) as unknown as RecurringRuleDocument;

  return toPublicRule(rule, true);
}

export async function getPersonalRule(ownerId: string, ruleId: string): Promise<PublicRecurringRule> {
  const rule = await findPersonalRuleOrThrow(ownerId, ruleId);
  return toPublicRule(rule, true);
}

export async function updatePersonalRule(
  ownerId: string,
  ruleId: string,
  input: UpdateRuleInput,
): Promise<PublicRecurringRule> {
  const rule = await findPersonalRuleOrThrow(ownerId, ruleId);
  const effectiveAmount = input.amountMinor ?? rule.amountMinor;
  applyCommonEdits(rule, input, effectiveAmount, false, ownerId);

  await rule.save();
  return toPublicRule(rule, true);
}

export async function deletePersonalRule(ownerId: string, ruleId: string): Promise<void> {
  const rule = await findPersonalRuleOrThrow(ownerId, ruleId);
  await RecurringGeneration.deleteMany({ rule: rule._id });
  await RecurringRule.deleteOne({ _id: rule._id });
}

export async function setPersonalRuleActive(
  ownerId: string,
  ruleId: string,
  active: boolean,
): Promise<PublicRecurringRule> {
  const rule = await findPersonalRuleOrThrow(ownerId, ruleId);
  if (rule.active === active) {
    return toPublicRule(rule, true);
  }
  if (active) {
    const nextOccurrence = firstOccurrenceOnOrAfter(
      rule.startDayKey,
      rule.frequency,
      rule.interval,
      todayUtcDayKey(),
    );
    const exhausted = rule.endDayKey !== null && nextOccurrence > rule.endDayKey;
    rule.active = !exhausted;
    rule.nextOccurrence = nextOccurrence;
  } else {
    rule.active = false;
  }
  await rule.save();
  return toPublicRule(rule, true);
}

export async function generatePersonalRuleNow(ownerId: string, ruleId: string): Promise<RuleRunResult> {
  const rule = await findPersonalRuleOrThrow(ownerId, ruleId);
  return generateRuleNow(rule);
}

/**
 * Apply shared edit fields. Returns the participant userIds referenced by the
 * effective split so the caller can re-validate group membership.
 */
function applyCommonEdits(
  rule: RecurringRuleDocument,
  input: UpdateRuleInput,
  effectiveAmount: number,
  isGroupRule: boolean,
  ownerId?: string,
): string[] {
  const currency = rule.currency;

  if (input.title !== undefined) rule.title = input.title;
  if (input.payerId !== undefined) rule.payerId = new Types.ObjectId(input.payerId);

  if (isGroupRule) {
    if (input.rawSplit !== undefined) {
      rule.splitInput = validateSplitPayload(input.rawSplit, effectiveAmount, currency);
    } else if (input.amountMinor !== undefined) {
      rule.splitInput = validateSplitPayload(rule.splitInput, effectiveAmount, currency);
    }
  } else if (input.amountMinor !== undefined && ownerId) {
    rule.splitInput = toPersonalSplit(ownerId, effectiveAmount, currency);
  }
  rule.amountMinor = effectiveAmount;
  rule.splitMethod = rule.splitInput.method;

  const scheduleChanged =
    input.frequency !== undefined || input.interval !== undefined || input.startDate !== undefined;
  if (input.frequency !== undefined) rule.frequency = input.frequency;
  if (input.interval !== undefined) rule.interval = input.interval;
  if (input.startDate !== undefined) rule.startDayKey = input.startDate;

  if (scheduleChanged) {
    rule.nextOccurrence = firstOccurrenceOnOrAfter(
      rule.startDayKey,
      rule.frequency,
      rule.interval,
      todayUtcDayKey(),
    );
    rule.active = true;
  }

  if (input.endDate !== undefined) {
    rule.endDayKey = input.endDate;
  }

  if (rule.endDayKey !== null && rule.nextOccurrence > rule.endDayKey) {
    throw new ApiError(400, "The recurrence window has already ended");
  }

  return isGroupRule ? getParticipantUserIds(rule.splitInput) : [rule.owner.toString()];
}

export interface RuleRunResult {
  generated: boolean;
  expenseId: string | null;
  skippedMissed: boolean;
  deactivated: boolean;
}

export async function generateRuleNow(rule: RecurringRuleDocument): Promise<RuleRunResult> {
  if (!rule.active) {
    throw new ApiError(409, "This recurring rule is paused");
  }
  return runRule(rule);
}

/* ------------------------------- generation ------------------------------- */

const createExpenseForRule = async (rule: RecurringRuleDocument, occurrenceKey: string): Promise<string> => {
  const expenseDate = new Date(`${occurrenceKey}T00:00:00.000Z`);

  if (rule.group) {
    const expense = await createGroupExpense(
      rule.group.toString(),
      rule.owner.toString(),
      {
        title: rule.title,
        amountMinor: rule.amountMinor,
        currency: rule.currency,
        expenseDate,
        payerId: rule.payerId.toString(),
        split: rule.splitInput,
      },
      { suppressNotifications: true },
    );
    return expense.id;
  }

  const expense = await createPersonalExpense(rule.owner.toString(), {
    title: rule.title,
    amountMinor: rule.amountMinor,
    currency: rule.currency,
    expenseDate,
  });
  return expense.id;
};

/**
 * Generate the occurrence scheduled for `todayKey` for a single rule.
 *
 * Idempotency is enforced by a unique `{rule, occurrenceKey}` ledger row: the
 * claim is inserted BEFORE the expense is created, so concurrent schedulers or
 * a double-clicked Generate Now can never produce a duplicate. If expense
 * creation fails the claim is removed (never a false success) and the error is
 * surfaced for safe logging.
 *
 * Missed occurrences are skipped, never backfilled: `nextOccurrence` is walked
 * forward to `todayKey` and only an exact match generates an expense.
 */
export async function runRule(rule: RecurringRuleDocument, todayKey = todayUtcDayKey()): Promise<RuleRunResult> {
  const observedNext = rule.nextOccurrence;
  let next = observedNext;
  let skippedMissed = false;

  if (rule.endDayKey !== null && next > rule.endDayKey) {
    await deactivateIfUnchanged(rule, observedNext);
    return { generated: false, expenseId: null, skippedMissed: false, deactivated: true };
  }

  while (next < todayKey) {
    next = advanceOccurrence(next, rule.frequency, rule.interval);
    skippedMissed = true;
  }

  if (rule.endDayKey !== null && next > rule.endDayKey) {
    await deactivateIfUnchanged(rule, observedNext, next);
    return { generated: false, expenseId: null, skippedMissed, deactivated: true };
  }

  if (next !== todayKey) {
    if (next !== observedNext) {
      await RecurringRule.updateOne(
        { _id: rule._id, nextOccurrence: observedNext },
        { $set: { nextOccurrence: next } },
      );
    }
    return { generated: false, expenseId: null, skippedMissed, deactivated: false };
  }

  const advanced = advanceOccurrence(todayKey, rule.frequency, rule.interval);

  let claimId: Types.ObjectId | null = null;
  try {
    const claim = await RecurringGeneration.create({
      rule: rule._id,
      occurrenceKey: todayKey,
      expense: null,
      generatedAt: new Date(),
    });
    claimId = claim._id;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    // Already generated or in flight elsewhere: advance without duplicating.
    await RecurringRule.updateOne(
      { _id: rule._id, nextOccurrence: observedNext },
      { $set: { nextOccurrence: advanced } },
    );
    return { generated: false, expenseId: null, skippedMissed, deactivated: false };
  }

  let expenseId: string;
  try {
    expenseId = await createExpenseForRule(rule, todayKey);
  } catch (err) {
    await RecurringGeneration.deleteOne({ _id: claimId }).catch(() => undefined);
    throw err;
  }

  await RecurringGeneration.updateOne({ _id: claimId }, { $set: { expense: new Types.ObjectId(expenseId) } });

  const willDeactivate = rule.endDayKey !== null && advanced > rule.endDayKey;
  await RecurringRule.updateOne(
    { _id: rule._id, nextOccurrence: observedNext },
    {
      $set: {
        nextOccurrence: advanced,
        lastGeneratedOccurrence: todayKey,
        ...(willDeactivate ? { active: false } : {}),
      },
    },
  );

  return { generated: true, expenseId, skippedMissed, deactivated: willDeactivate };
}

const deactivateIfUnchanged = async (
  rule: RecurringRuleDocument,
  observedNext: string,
  next?: string,
): Promise<void> => {
  const update: Record<string, unknown> = { active: false };
  if (next !== undefined) update.nextOccurrence = next;
  await RecurringRule.updateOne({ _id: rule._id, nextOccurrence: observedNext }, { $set: update });
};

export interface ProcessDueRulesResult {
  processed: number;
  generated: number;
  failed: number;
}

/**
 * One-shot scheduler entry point. Finds every active rule due on or before
 * `todayKey`, skips past missed occurrences, and generates at most one expense
 * per rule for today. Per-rule failures are logged without sensitive data and
 * never abort the batch.
 */
export async function processDueRules(todayKey = todayUtcDayKey()): Promise<ProcessDueRulesResult> {
  const dueRules = (await RecurringRule.find({
    active: true,
    nextOccurrence: { $lte: todayKey },
  })) as unknown as RecurringRuleDocument[];

  let generated = 0;
  let failed = 0;

  for (const rule of dueRules) {
    try {
      const result = await runRule(rule, todayKey);
      if (result.generated) generated++;
    } catch (err) {
      failed++;
      console.error(
        `[recurring] failed to generate rule ${rule._id.toString()}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { processed: dueRules.length, generated, failed };
}

export type { RecurringFrequency };

import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { Group, type GroupDocument } from "../groups/group.model.js";
import { Settlement, type SettlementDocument } from "./settlement.model.js";
import type { CreateSettlementInput, PublicSettlement, SettlementStatus } from "./settlement.types.js";
import { SETTLEMENT_STATUSES } from "./settlement.types.js";
import { assertValidSettlementInput } from "./settlement.validation.js";
import { notify, onSettlementRecorded } from "../notifications/notification.service.js";

const toPublicSettlement = (settlement: SettlementDocument): PublicSettlement => ({
  id: settlement._id.toString(),
  group: settlement.group.toString(),
  payerId: settlement.payerId.toString(),
  receiverId: settlement.receiverId.toString(),
  amountMinor: settlement.amountMinor,
  currency: settlement.currency,
  date: (settlement.date instanceof Date ? settlement.date : new Date(settlement.date)).toISOString(),
  note: settlement.note ?? null,
  createdBy: settlement.createdBy.toString(),
  status: settlement.status,
  createdAt: settlement.createdAt.toISOString(),
  updatedAt: settlement.updatedAt.toISOString(),
});

const findGroupOrThrow = async (groupId: string): Promise<GroupDocument> => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, "Group not found");
  }
  return group as unknown as GroupDocument;
};

const getMembership = (group: GroupDocument, userId: string) =>
  group.members.find((m) => m.userId.toString() === userId);

/** Writer (authed user) must be an active group member. */
const assertActorActive = (group: GroupDocument, actorId: string): void => {
  const member = getMembership(group, actorId);
  if (!member || member.status !== "active") {
    // 404 (not 403) so callers cannot tell whether the group exists.
    throw new ApiError(404, "Group not found");
  }
};

/** Payer/receiver must be an active member of the group. */
const assertParticipantActive = (group: GroupDocument, userId: string, label: string): void => {
  const member = getMembership(group, userId);
  if (!member || member.status !== "active") {
    throw new ApiError(400, `${label} must be an active member of this group`);
  }
};

/** Archived groups reject new financial records; historical records stay readable. */
const ensureWritable = (group: GroupDocument): void => {
  if (group.archived) {
    throw new ApiError(409, "Archived groups are read-only");
  }
};

const getOwnerId = (group: GroupDocument): string | null => {
  const owner = group.members.find((m) => m.role === "owner" && m.status === "active");
  return owner ? owner.userId.toString() : null;
};

export async function createSettlement(
  groupId: string,
  actorId: string,
  input: CreateSettlementInput,
): Promise<PublicSettlement> {
  assertValidSettlementInput(input);

  const group = await findGroupOrThrow(groupId);
  ensureWritable(group);
  assertActorActive(group, actorId);

  assertParticipantActive(group, input.payerId, "Payer");
  assertParticipantActive(group, input.receiverId, "Receiver");

  const settlement = (await Settlement.create({
    group: new Types.ObjectId(groupId),
    payerId: new Types.ObjectId(input.payerId),
    receiverId: new Types.ObjectId(input.receiverId),
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    note: input.note,
    createdBy: new Types.ObjectId(actorId),
    status: "completed",
  })) as unknown as SettlementDocument;

  await notify(
    onSettlementRecorded(group, actorId, {
      id: settlement._id.toString(),
      payerId: settlement.payerId.toString(),
      receiverId: settlement.receiverId.toString(),
      amountMinor: settlement.amountMinor,
      currency: settlement.currency,
    }),
  );

  return toPublicSettlement(settlement);
}

export async function listSettlements(
  groupId: string,
  actorId: string,
  page: number,
  limit: number,
  skip: number,
  status?: SettlementStatus,
): Promise<{ items: PublicSettlement[]; total: number; page: number; limit: number; totalPages: number }> {
  if (status !== undefined && !SETTLEMENT_STATUSES.includes(status)) {
    throw new ApiError(400, "status must be 'completed' or 'cancelled'");
  }

  const group = await findGroupOrThrow(groupId);
  assertActorActive(group, actorId);

  const filter: Record<string, unknown> = { group: new Types.ObjectId(groupId) };
  if (status !== undefined) filter.status = status;

  const [total, docs] = await Promise.all([
    Settlement.countDocuments(filter),
    Settlement.find(filter).sort({ date: -1, _id: -1 }).skip(skip).limit(limit),
  ]);

  return {
    items: (docs as unknown as SettlementDocument[]).map(toPublicSettlement),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Approved MVP transition: completed -> cancelled. The record is preserved
 * (never deleted) and balances automatically exclude it because the derived
 * engine consumes only `completed` settlements.
 */
export async function cancelSettlement(groupId: string, settlementId: string, actorId: string): Promise<PublicSettlement> {
  const group = await findGroupOrThrow(groupId);
  assertActorActive(group, actorId);

  const settlement = await Settlement.findOne({
    _id: settlementId,
    group: new Types.ObjectId(groupId),
  });
  if (!settlement) {
    throw new ApiError(404, "Settlement not found");
  }

  const isCreator = settlement.createdBy.toString() === actorId;
  const isOwner = getOwnerId(group) === actorId;
  if (!isCreator && !isOwner) {
    throw new ApiError(403, "Only the settlement creator or the group owner can cancel this settlement");
  }

  if (settlement.status === "cancelled") {
    throw new ApiError(409, "Settlement is already cancelled");
  }

  settlement.status = "cancelled";
  await settlement.save();
  return toPublicSettlement(settlement as unknown as SettlementDocument);
}
import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { requireObjectId } from "../common/guard.js";
import {
  archiveGroup,
  changeRole,
  createGroup,
  getGroupDetail,
  getGroupForInvitePreview,
  inviteMember,
  listActiveGroups,
  listMembers,
  removeMember,
  respondToInvitation,
  transferOwnership,
  updateGroup,
} from "./group.service.js";
import {
  validateAddMember,
  validateCreateGroup,
  validateRole,
  validateUpdateGroup,
} from "./group.validation.js";

const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  return req.user.id;
};

export const create = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const input = validateCreateGroup(req.body);
  const group = await createGroup(input, actorId);

  res.status(201).json({ success: true, message: "Group created successfully", data: { group } });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groups = await listActiveGroups(actorId);

  res.status(200).json({ success: true, message: "Groups retrieved successfully", data: { groups } });
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const group = await getGroupDetail(groupId, actorId);

  res.status(200).json({ success: true, message: "Group retrieved successfully", data: { group } });
});

export const getInvitePreview = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const preview = await getGroupForInvitePreview(groupId, actorId);

  res.status(200).json({ success: true, message: "Invitation preview", data: { group: preview } });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const input = validateUpdateGroup(req.body);
  const group = await updateGroup(groupId, actorId, input);

  res.status(200).json({ success: true, message: "Group updated successfully", data: { group } });
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const group = await archiveGroup(groupId, actorId);

  res.status(200).json({ success: true, message: "Group archived successfully", data: { group } });
});

export const invite = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const input = validateAddMember(req.body);
  const group = await inviteMember(groupId, actorId, input);

  res.status(200).json({ success: true, message: "Invitation sent successfully", data: { group } });
});

export const members = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const memberList = await listMembers(groupId, actorId);

  res.status(200).json({ success: true, message: "Members retrieved successfully", data: { members: memberList } });
});

export const acceptInvite = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const memberId = requireObjectId(req.params.userId, "User ID");

  if (memberId !== actorId) {
    throw new ApiError(403, "You can only accept your own invitation");
  }

  await respondToInvitation(groupId, actorId, "accept");
  res.status(200).json({ success: true, message: "Invitation accepted", data: null });
});

export const declineInvite = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const memberId = requireObjectId(req.params.userId, "User ID");

  if (memberId !== actorId) {
    throw new ApiError(403, "You can only decline your own invitation");
  }

  await respondToInvitation(groupId, actorId, "decline");
  res.status(200).json({ success: true, message: "Invitation declined", data: null });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const memberId = requireObjectId(req.params.userId, "User ID");
  await removeMember(groupId, actorId, memberId);

  res.status(200).json({ success: true, message: "Member removed", data: null });
});

export const role = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const memberId = requireObjectId(req.params.userId, "User ID");
  const roleInput = validateRole(req.body);
  const group = await changeRole(groupId, actorId, memberId, roleInput);

  res.status(200).json({ success: true, message: "Role updated successfully", data: { group } });
});

export const owner = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const input = validateAddMember(req.body);
  const group = await transferOwnership(groupId, actorId, input.userId);

  res.status(200).json({ success: true, message: "Ownership transferred successfully", data: { group } });
});

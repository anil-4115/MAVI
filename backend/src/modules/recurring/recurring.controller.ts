import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { requireObjectId } from "../common/guard.js";
import { validateCreateGroupRule, validateCreatePersonalRule, validateUpdateRule } from "./recurring.validation.js";
import {
  createGroupRule,
  createPersonalRule,
  deleteGroupRule,
  deletePersonalRule,
  generateGroupRuleNow,
  generatePersonalRuleNow,
  getGroupRule,
  getPersonalRule,
  listGroupRules,
  listPersonalRules,
  setGroupRuleActive,
  setPersonalRuleActive,
  updateGroupRule,
  updatePersonalRule,
  type RuleRunResult,
} from "./recurring.service.js";

const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }
  return req.user.id;
};

const respondGenerated = (res: Response, result: RuleRunResult): void => {
  res.status(200).json({
    success: true,
    message: result.generated ? "Recurring expense generated" : "No occurrence is due today",
    data: result,
  });
};

/* ------------------------------ personal rules ---------------------------- */

export const createPersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const input = validateCreatePersonalRule(req.body);
  const rule = await createPersonalRule(actorId, input);

  res.status(201).json({ success: true, message: "Recurring rule created successfully", data: { rule } });
});

export const listPersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const rules = await listPersonalRules(actorId);

  res.status(200).json({ success: true, message: "Recurring rules retrieved successfully", data: { rules } });
});

export const getPersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  const rule = await getPersonalRule(actorId, ruleId);

  res.status(200).json({ success: true, message: "Recurring rule retrieved successfully", data: { rule } });
});

export const updatePersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  const input = validateUpdateRule(req.body, false);
  const rule = await updatePersonalRule(actorId, ruleId, input);

  res.status(200).json({ success: true, message: "Recurring rule updated successfully", data: { rule } });
});

export const deletePersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  await deletePersonalRule(actorId, ruleId);

  res.status(200).json({ success: true, message: "Recurring rule deleted successfully", data: null });
});

export const pausePersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  const rule = await setPersonalRuleActive(actorId, ruleId, false);

  res.status(200).json({ success: true, message: "Recurring rule paused", data: { rule } });
});

export const resumePersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  const rule = await setPersonalRuleActive(actorId, ruleId, true);

  res.status(200).json({ success: true, message: "Recurring rule resumed", data: { rule } });
});

export const generateNowPersonal = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  const result = await generatePersonalRuleNow(actorId, ruleId);
  respondGenerated(res, result);
});

/* ------------------------------- group rules ------------------------------ */

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const input = validateCreateGroupRule(req.body);
  const rule = await createGroupRule(groupId, actorId, input);

  res.status(201).json({ success: true, message: "Recurring rule created successfully", data: { rule } });
});

export const listGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const rules = await listGroupRules(groupId, actorId);

  res.status(200).json({ success: true, message: "Recurring rules retrieved successfully", data: { rules } });
});

export const getGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  const rule = await getGroupRule(groupId, ruleId, actorId);

  res.status(200).json({ success: true, message: "Recurring rule retrieved successfully", data: { rule } });
});

export const updateGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  const input = validateUpdateRule(req.body, true);
  const rule = await updateGroupRule(groupId, ruleId, actorId, input);

  res.status(200).json({ success: true, message: "Recurring rule updated successfully", data: { rule } });
});

export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  await deleteGroupRule(groupId, ruleId, actorId);

  res.status(200).json({ success: true, message: "Recurring rule deleted successfully", data: null });
});

export const pauseGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  const rule = await setGroupRuleActive(groupId, ruleId, actorId, false);

  res.status(200).json({ success: true, message: "Recurring rule paused", data: { rule } });
});

export const resumeGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  const rule = await setGroupRuleActive(groupId, ruleId, actorId, true);

  res.status(200).json({ success: true, message: "Recurring rule resumed", data: { rule } });
});

export const generateNowGroup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = requireUser(req);
  const groupId = requireObjectId(req.params.groupId, "Group ID");
  const ruleId = requireObjectId(req.params.ruleId, "Rule ID");
  const result = await generateGroupRuleNow(groupId, ruleId, actorId);
  respondGenerated(res, result);
});

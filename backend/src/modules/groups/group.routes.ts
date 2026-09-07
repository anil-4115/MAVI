import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import {
  acceptInvite,
  archive,
  create,
  declineInvite,
  detail,
  getInvitePreview,
  invite,
  list,
  members,
  owner,
  remove,
  role,
  update,
} from "./group.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", list);
router.post("/", create);
router.get("/:groupId/preview", getInvitePreview);
router.get("/:groupId", detail);
router.patch("/:groupId", update);
router.delete("/:groupId", archive);

router.get("/:groupId/members", members);
router.post("/:groupId/members", invite);
router.post("/:groupId/members/:userId/accept", acceptInvite);
router.post("/:groupId/members/:userId/decline", declineInvite);
router.delete("/:groupId/members/:userId", remove);
router.patch("/:groupId/members/:userId/role", role);
router.patch("/:groupId/owner", owner);

export default router;

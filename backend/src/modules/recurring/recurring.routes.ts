import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import {
  createGroup,
  createPersonal,
  deleteGroup,
  deletePersonal,
  generateNowGroup,
  generateNowPersonal,
  getGroup,
  getPersonal,
  listGroup,
  listPersonal,
  pauseGroup,
  pausePersonal,
  resumeGroup,
  resumePersonal,
  updateGroup,
  updatePersonal,
} from "./recurring.controller.js";

const router = Router();

router.use(authenticate);

/* Personal recurring rules */
router.post("/recurring/personal", createPersonal);
router.get("/recurring/personal", listPersonal);
router.get("/recurring/personal/:ruleId", getPersonal);
router.patch("/recurring/personal/:ruleId", updatePersonal);
router.delete("/recurring/personal/:ruleId", deletePersonal);
router.post("/recurring/personal/:ruleId/pause", pausePersonal);
router.post("/recurring/personal/:ruleId/resume", resumePersonal);
router.post("/recurring/personal/:ruleId/generate-now", generateNowPersonal);

/* Group recurring rules */
router.post("/groups/:groupId/recurring", createGroup);
router.get("/groups/:groupId/recurring", listGroup);
router.get("/groups/:groupId/recurring/:ruleId", getGroup);
router.patch("/groups/:groupId/recurring/:ruleId", updateGroup);
router.delete("/groups/:groupId/recurring/:ruleId", deleteGroup);
router.post("/groups/:groupId/recurring/:ruleId/pause", pauseGroup);
router.post("/groups/:groupId/recurring/:ruleId/resume", resumeGroup);
router.post("/groups/:groupId/recurring/:ruleId/generate-now", generateNowGroup);

export default router;

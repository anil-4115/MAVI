import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { uploadAttachment } from "./attachment.middleware.js";
import {
  createGroup,
  createPersonal,
  deleteGroup,
  deleteGroupAttachment,
  deletePersonal,
  deletePersonalAttachment,
  getGroupAttachment,
  getGroupExpenseDetail,
  getPersonal,
  getPersonalAttachment,
  listGroup,
  listPersonal,
  updateGroup,
  updatePersonal,
  uploadGroupAttachment,
  uploadPersonalAttachment,
} from "./expense.controller.js";

const router = Router();

router.use(authenticate);

/* Personal expenses */
router.post("/expenses/personal", createPersonal);
router.get("/expenses/personal", listPersonal);
router.get("/expenses/personal/:expenseId", getPersonal);
router.patch("/expenses/personal/:expenseId", updatePersonal);
router.delete("/expenses/personal/:expenseId", deletePersonal);
router.post("/expenses/personal/:expenseId/attachment", uploadAttachment, uploadPersonalAttachment);
router.get("/expenses/personal/:expenseId/attachment", getPersonalAttachment);
router.delete("/expenses/personal/:expenseId/attachment", deletePersonalAttachment);

/* Group expenses */
router.get("/groups/:groupId/expenses", listGroup);
router.post("/groups/:groupId/expenses", createGroup);
router.get("/groups/:groupId/expenses/:expenseId", getGroupExpenseDetail);
router.patch("/groups/:groupId/expenses/:expenseId", updateGroup);
router.delete("/groups/:groupId/expenses/:expenseId", deleteGroup);
router.post("/groups/:groupId/expenses/:expenseId/attachment", uploadAttachment, uploadGroupAttachment);
router.get("/groups/:groupId/expenses/:expenseId/attachment", getGroupAttachment);
router.delete("/groups/:groupId/expenses/:expenseId/attachment", deleteGroupAttachment);

export default router;
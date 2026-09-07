import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import {
  createGroup,
  createPersonal,
  deleteGroup,
  deletePersonal,
  getGroupExpenseDetail,
  getPersonal,
  listGroup,
  listPersonal,
  updateGroup,
  updatePersonal,
} from "./expense.controller.js";

const router = Router();

router.use(authenticate);

/* Personal expenses */
router.post("/expenses/personal", createPersonal);
router.get("/expenses/personal", listPersonal);
router.get("/expenses/personal/:expenseId", getPersonal);
router.patch("/expenses/personal/:expenseId", updatePersonal);
router.delete("/expenses/personal/:expenseId", deletePersonal);

/* Group expenses */
router.get("/groups/:groupId/expenses", listGroup);
router.post("/groups/:groupId/expenses", createGroup);
router.get("/groups/:groupId/expenses/:expenseId", getGroupExpenseDetail);
router.patch("/groups/:groupId/expenses/:expenseId", updateGroup);
router.delete("/groups/:groupId/expenses/:expenseId", deleteGroup);

export default router;
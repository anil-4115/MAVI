import { Router } from "express";
import healthRouter from "../modules/health/health.routes.js";
import authRouter from "../modules/auth/auth.routes.js";
import usersRouter from "../modules/users/users.routes.js";
import groupsRouter from "../modules/groups/group.routes.js";
import expensesRouter from "../modules/expenses/expense.routes.js";
import balancesRouter from "../modules/balances/balances.routes.js";
import settlementsRouter from "../modules/settlements/settlement.routes.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/groups", groupsRouter);
router.use("/", expensesRouter);
router.use("/", balancesRouter);
router.use("/", settlementsRouter);

export default router;
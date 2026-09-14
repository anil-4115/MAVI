import { Router } from "express";
import type { RateLimiters } from "../middleware/rateLimiters.js";
import healthRouter from "../modules/health/health.routes.js";
import { buildAuthRouter } from "../modules/auth/auth.routes.js";
import usersRouter from "../modules/users/users.routes.js";
import groupsRouter from "../modules/groups/group.routes.js";
import expensesRouter from "../modules/expenses/expense.routes.js";
import balancesRouter from "../modules/balances/balances.routes.js";
import settlementsRouter from "../modules/settlements/settlement.routes.js";
import notificationsRouter from "../modules/notifications/notification.routes.js";
import analyticsRouter from "../modules/analytics/analytics.routes.js";

export const buildApiRouter = (limiters: RateLimiters): Router => {
  const router = Router();

  // Health is mounted first so deployment/platform health checks stay
  // available regardless of rate-limit state.
  router.use("/health", healthRouter);

  // Auth endpoints carry their own stricter limiters (see auth.routes).
  router.use("/auth", buildAuthRouter(limiters));

  // General API limiter protects the remaining API surface.
  router.use(limiters.generalApi);

  router.use("/users", usersRouter);
  router.use("/groups", groupsRouter);
  router.use("/notifications", notificationsRouter);
  router.use("/", expensesRouter);
  router.use("/", balancesRouter);
  router.use("/", settlementsRouter);
  router.use("/", analyticsRouter);

  return router;
};
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { getSpendingAnalyticsController } from "./analytics.controller.js";

const router = Router();

router.use(authenticate);

router.get("/analytics/spending", getSpendingAnalyticsController);

export default router;
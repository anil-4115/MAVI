import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { getReportSummaryController } from "./reports.controller.js";

const router = Router();

router.use(authenticate);

router.get("/reports/summary", getReportSummaryController);

export default router;
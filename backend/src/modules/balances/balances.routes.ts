import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { getDashboardController, getGroupBalancesController } from "./balances.controller.js";

const router = Router();

router.use(authenticate);

router.get("/groups/:groupId/balances", getGroupBalancesController);
router.get("/dashboard", getDashboardController);

export default router;
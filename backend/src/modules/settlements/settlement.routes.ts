import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { cancel, create, list } from "./settlement.controller.js";

const router = Router();

router.use(authenticate);

router.post("/groups/:groupId/settlements", create);
router.get("/groups/:groupId/settlements", list);
router.patch("/groups/:groupId/settlements/:settlementId/status", cancel);

export default router;
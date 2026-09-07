import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { getProfile, search, updateMe } from "./users.controller.js";

const router = Router();

router.use(authenticate);

router.get("/search", search);
router.get("/:userId", getProfile);
router.patch("/me", updateMe);

export default router;

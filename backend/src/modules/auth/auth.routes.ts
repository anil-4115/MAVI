import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { getMe, login, register } from "./auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authenticate, getMe);

export default router;
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { list, markAllRead, markRead, unreadCount } from "./notification.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", list);
router.get("/unread-count", unreadCount);
router.patch("/:notificationId/read", markRead);
router.patch("/read-all", markAllRead);

export default router;
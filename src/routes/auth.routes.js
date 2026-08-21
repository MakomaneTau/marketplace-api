import { Router } from "express";
import { getCurrentUser } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const authRouter = Router();

authRouter.get("/me", authenticate, getCurrentUser);

export default authRouter;

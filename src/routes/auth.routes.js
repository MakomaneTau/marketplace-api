import { Router } from "express";
import {
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  refresh,
  resetPassword,
  signup,
  switchRole,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authRateLimit } from "../middleware/rate-limit.js";
import mfaRouter from "./mfa.routes.js";

const authRouter = Router();
authRouter.use("/mfa", mfaRouter);

authRouter.post("/signup", authRateLimit, signup);
authRouter.post("/login", authRateLimit, login);
authRouter.post("/refresh", refresh);
authRouter.post("/forgot-password", authRateLimit, forgotPassword);
authRouter.post("/reset-password", authenticate, resetPassword);
authRouter.post("/logout", authenticate, logout);
authRouter.get("/me", authenticate, getCurrentUser);
authRouter.post("/switch-role", authenticate, authRateLimit, switchRole);

export default authRouter;

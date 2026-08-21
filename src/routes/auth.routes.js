import { Router } from "express";
import {
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  refresh,
  resetPassword,
  signup,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const authRouter = Router();

authRouter.post("/signup", signup);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", authenticate, resetPassword);
authRouter.post("/logout", authenticate, logout);
authRouter.get("/me", authenticate, getCurrentUser);

export default authRouter;

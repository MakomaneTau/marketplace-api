import { Router } from "express";
import {
  getProfile,
  updateProfile,
} from "../controllers/profile.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const profileRouter = Router();

profileRouter.use(authenticate);
profileRouter.get("/", getProfile);
profileRouter.patch("/", updateProfile);

export default profileRouter;

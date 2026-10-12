import { Router } from "express";

import {
  getOnboarding,
  updateOnboarding,
} from "../controllers/onboarding.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const onboardingRouter = Router();

onboardingRouter.use(authenticate);
onboardingRouter.get("/", getOnboarding);
onboardingRouter.patch("/", updateOnboarding);

export default onboardingRouter;

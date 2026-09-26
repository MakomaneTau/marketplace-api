import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { sendError } from "../http/responses.js";
import { AdminServiceError, requireAdmin } from "../services/admin.service.js";
import * as controller from "../controllers/admin.controller.js";

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(async (req, res, next) => {
  try {
    await requireAdmin(req.user.id);
    next();
  } catch (error) {
    return sendError(res, {
      status: error instanceof AdminServiceError ? error.status : 500,
      code: error instanceof AdminServiceError ? error.code : "INTERNAL_SERVER_ERROR",
      message: error instanceof AdminServiceError ? error.message : "An unexpected error occurred.",
    });
  }
});

adminRouter.get("/access", controller.access);
adminRouter.get("/overview", controller.overview);
adminRouter.get("/users", controller.users);
adminRouter.patch("/users/:id/restriction", controller.restriction);
adminRouter.get("/reports", controller.reports);
adminRouter.patch("/reports/:id", controller.reportDecision);
adminRouter.get("/verifications", controller.verifications);
adminRouter.get("/verifications/:id/images", controller.verificationImages);
adminRouter.patch("/verifications/:id", controller.verificationDecision);

export default adminRouter;

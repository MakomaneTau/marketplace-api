import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { myReports, submitReport } from "../controllers/reports.controller.js";

const reportsRouter = Router();
reportsRouter.use(authenticate);
reportsRouter.get("/", myReports);
reportsRouter.post("/", submitReport);

export default reportsRouter;

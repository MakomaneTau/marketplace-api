import { Router } from "express";
import {
  getCategory,
  getUniversity,
  listCampuses,
  listCategories,
  listUniversities,
} from "../controllers/reference.controller.js";

const referenceRouter = Router();

referenceRouter.get("/categories", listCategories);
referenceRouter.get("/categories/:slug", getCategory);
referenceRouter.get("/universities", listUniversities);
referenceRouter.get("/universities/:slug/campuses", listCampuses);
referenceRouter.get("/universities/:slug", getUniversity);

export default referenceRouter;

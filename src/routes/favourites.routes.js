import { Router } from "express";
import {
  listFavourites,
  removeFavourite,
  saveFavourite,
} from "../controllers/favourites.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireBuyer } from "../middleware/require-buyer.js";

const favouritesRouter = Router();
favouritesRouter.use(authenticate, requireBuyer);
favouritesRouter.get("/", listFavourites);
favouritesRouter.put("/:productId", saveFavourite);
favouritesRouter.delete("/:productId", removeFavourite);
export default favouritesRouter;

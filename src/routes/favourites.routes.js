import { Router } from "express";
import { listFavourites, removeFavourite, saveFavourite } from "../controllers/favourites.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const favouritesRouter = Router();
favouritesRouter.use(authenticate);
favouritesRouter.get("/", listFavourites);
favouritesRouter.put("/:productId", saveFavourite);
favouritesRouter.delete("/:productId", removeFavourite);
export default favouritesRouter;

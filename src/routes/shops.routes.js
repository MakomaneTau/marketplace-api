import { Router } from "express";
import {
  createShop,
  getPublicShop,
  getSellerShop,
  replacePickupAreas,
  updateShop,
  uploadShopImage,
} from "../controllers/shops.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { marketplaceImageUpload } from "../middleware/image-upload.js";

export const publicShopsRouter = Router();
publicShopsRouter.get("/:slug", getPublicShop);

export const sellerShopRouter = Router();
sellerShopRouter.use(authenticate);
sellerShopRouter.get("/", getSellerShop);
sellerShopRouter.post("/", createShop);
sellerShopRouter.patch("/", updateShop);
sellerShopRouter.put("/pickup-areas", replacePickupAreas);
sellerShopRouter.post("/logo", marketplaceImageUpload, uploadShopImage("logo"));
sellerShopRouter.post("/banner", marketplaceImageUpload, uploadShopImage("banner"));

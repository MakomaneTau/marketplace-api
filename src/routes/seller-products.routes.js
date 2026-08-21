import { Router } from "express";
import {
  addProductImage,
  createSellerProduct,
  deleteProduct,
  listSellerProducts,
  removeProductImage,
  updateSellerProduct,
} from "../controllers/products.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { marketplaceImageUpload } from "../middleware/image-upload.js";

const sellerProductsRouter = Router();
sellerProductsRouter.use(authenticate);
sellerProductsRouter.get("/", listSellerProducts);
sellerProductsRouter.post("/", createSellerProduct);
sellerProductsRouter.patch("/:id", updateSellerProduct);
sellerProductsRouter.delete("/:id", deleteProduct);
sellerProductsRouter.post("/:id/images", marketplaceImageUpload, addProductImage);
sellerProductsRouter.delete("/:id/images/:index", removeProductImage);
export default sellerProductsRouter;

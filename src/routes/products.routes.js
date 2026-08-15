import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "../controllers/products.controller.js";
import { authenticate } from "../middleware/authenticate.js";

const productsRouter = Router();

productsRouter.get("/", listProducts);
productsRouter.get("/:id", getProduct);
productsRouter.post("/", authenticate, createProduct);
productsRouter.patch("/:id", authenticate, updateProduct);
productsRouter.delete("/:id", authenticate, deleteProduct);

export default productsRouter;

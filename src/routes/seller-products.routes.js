import { Router } from "express";
import {
  addProductImage,
  createSellerProduct,
  deleteProduct,
  listSellerProducts,
  getSellerProduct,
  removeProductImage,
  updateSellerProduct,
} from "../controllers/products.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { marketplaceImageUpload } from "../middleware/image-upload.js";
import { duplicateProduct } from "../services/products.service.js";
import { checked, invalid } from "../services/community.service.js";
import { supabaseAdmin } from "../config/supabase.js";
import { sendData } from "../http/responses.js";

const sellerProductsRouter = Router();
sellerProductsRouter.use(authenticate);
sellerProductsRouter.post("/bulk-status", async (req, res) => {
  const { ids, status } = req.body || {};
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 100 ||
    ids.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) ||
    new Set(ids).size !== ids.length ||
    !["active", "paused"].includes(status)
  )
    invalid("Choose up to 100 products and a valid status.");
  sendData(
    res,
    checked(
      await supabaseAdmin.rpc("market_bulk_products", {
        p_actor: req.user.id,
        p_ids: ids,
        p_status: status,
      }),
    ),
  );
});
sellerProductsRouter.post("/:id/duplicate", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) invalid("Invalid product.");
  sendData(res, await duplicateProduct(req.params.id, req.user.id), {
    status: 201,
  });
});
sellerProductsRouter.get("/", listSellerProducts);
sellerProductsRouter.get("/:id", getSellerProduct);
sellerProductsRouter.post("/", createSellerProduct);
sellerProductsRouter.patch("/:id", updateSellerProduct);
sellerProductsRouter.delete("/:id", deleteProduct);
sellerProductsRouter.post(
  "/:id/images",
  marketplaceImageUpload,
  addProductImage,
);
sellerProductsRouter.delete("/:id/images/:index", removeProductImage);
export default sellerProductsRouter;

import { Router } from "express";
import {
  createOrder,
  getOrder,
  listBuyerOrders,
  listSellerOrders,
  transitionOrder,
} from "../controllers/orders.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireBuyer } from "../middleware/require-buyer.js";

export const ordersRouter = Router();
ordersRouter.use(authenticate, requireBuyer);
ordersRouter.get("/", listBuyerOrders);
ordersRouter.post("/", createOrder);
ordersRouter.get("/:id", getOrder);
ordersRouter.patch("/:id/status", transitionOrder);

export const sellerOrdersRouter = Router();
sellerOrdersRouter.use(authenticate);
sellerOrdersRouter.get("/", listSellerOrders);
sellerOrdersRouter.get("/:id", getOrder);
sellerOrdersRouter.patch("/:id/status", transitionOrder);

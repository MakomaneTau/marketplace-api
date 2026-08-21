import { Router } from "express";
import authRouter from "./auth.routes.js";
import productsRouter from "./products.routes.js";
import referenceRouter from "./reference.routes.js";
import profileRouter from "./profile.routes.js";
import verificationRouter from "./verification.routes.js";
import { publicShopsRouter, sellerShopRouter } from "./shops.routes.js";
import sellerProductsRouter from "./seller-products.routes.js";
import favouritesRouter from "./favourites.routes.js";
import { ordersRouter, sellerOrdersRouter } from "./orders.routes.js";
import { conversationsRouter, notificationsRouter } from "./messaging.routes.js";
import { reviewsRouter } from "./reviews.routes.js";

const v1Router = Router();

v1Router.use("/auth", authRouter);
v1Router.use("/products", productsRouter);
v1Router.use(referenceRouter);
v1Router.use("/profile", profileRouter);
v1Router.use("/verifications", verificationRouter);
v1Router.use("/shops", publicShopsRouter);
v1Router.use("/seller/shop", sellerShopRouter);
v1Router.use("/seller/products", sellerProductsRouter);
v1Router.use("/favourites", favouritesRouter);
v1Router.use("/orders", ordersRouter);
v1Router.use("/seller/orders", sellerOrdersRouter);
v1Router.use("/conversations", conversationsRouter);
v1Router.use("/notifications", notificationsRouter);
v1Router.use(reviewsRouter);

export default v1Router;

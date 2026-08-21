import { Router } from "express";
import authRouter from "./auth.routes.js";
import productsRouter from "./products.routes.js";
import referenceRouter from "./reference.routes.js";
import profileRouter from "./profile.routes.js";
import verificationRouter from "./verification.routes.js";
import { publicShopsRouter, sellerShopRouter } from "./shops.routes.js";

const v1Router = Router();

v1Router.use("/auth", authRouter);
v1Router.use("/products", productsRouter);
v1Router.use(referenceRouter);
v1Router.use("/profile", profileRouter);
v1Router.use("/verifications", verificationRouter);
v1Router.use("/shops", publicShopsRouter);
v1Router.use("/seller/shop", sellerShopRouter);

export default v1Router;

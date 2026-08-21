import { Router } from "express";
import authRouter from "./auth.routes.js";
import productsRouter from "./products.routes.js";
import referenceRouter from "./reference.routes.js";

const v1Router = Router();

v1Router.use("/auth", authRouter);
v1Router.use("/products", productsRouter);
v1Router.use(referenceRouter);

export default v1Router;

import { Router } from "express";
import authRouter from "./auth.routes.js";
import productsRouter from "./products.routes.js";

const v1Router = Router();

v1Router.use("/auth", authRouter);
v1Router.use("/products", productsRouter);

export default v1Router;

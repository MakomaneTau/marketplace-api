import "dotenv/config";
import express from "express";
import cors from "cors";
import { authenticate } from "./middleware/authenticate.js";
import productsRouter from "./routes/products.routes.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "marketplace-api",
  });
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.status(200).json({
    user: req.user,
  });
});

app.use("/api/products", productsRouter);

export default app;

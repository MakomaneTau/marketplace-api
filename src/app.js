import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.routes.js";
import productsRouter from "./routes/products.routes.js";
import v1Router from "./routes/v1.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { requestContext } from "./middleware/request-context.js";
import { requestLogger } from "./middleware/request-logger.js";
import { securityHeaders } from "./middleware/security-headers.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(requestContext);
app.use(requestLogger);
app.use(securityHeaders);
app.use(rateLimit);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "marketplace-api",
  });
});

app.use("/api/v1", v1Router);

// Temporary compatibility routes. They will be removed after consumers adopt
// the versioned contract.
app.use("/api/auth", authRouter);
app.use("/api/products", productsRouter);

app.use(notFound);
app.use(errorHandler);

export default app;

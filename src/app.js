import express from "express";
import cors from "cors";
import { authenticate } from "./middleware/authenticate.js";

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

export default app;

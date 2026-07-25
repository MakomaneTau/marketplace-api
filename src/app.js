import "dotenv/config";

import express from "express";
import cors from "cors";

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Marketplace API is running",
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});

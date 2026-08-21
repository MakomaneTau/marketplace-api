import { Router } from "express";
import {
  getSellerVerification,
  submitSellerVerification,
} from "../controllers/verification.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { verificationUpload } from "../middleware/image-upload.js";

const verificationRouter = Router();

verificationRouter.use(authenticate);
verificationRouter.get("/seller", getSellerVerification);
verificationRouter.post("/seller", verificationUpload, submitSellerVerification);

export default verificationRouter;

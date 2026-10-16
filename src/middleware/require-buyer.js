import { getProfile } from "../services/profile.service.js";
import { isAdmin } from "../services/admin.service.js";
import { sendError } from "../http/responses.js";

export async function requireBuyer(req, res, next) {
  try {
    const [profile, admin] = await Promise.all([
      getProfile(req.user.id),
      isAdmin(req.user.id),
    ]);
    if (profile.role !== "buyer" || admin) {
      return sendError(res, {
        status: 403,
        code: "BUYER_REQUIRED",
        message: "A buyer account is required for this action.",
      });
    }
    return next();
  } catch {
    return sendError(res, {
      status: 503,
      code: "BUYER_ACCESS_UNAVAILABLE",
      message: "Buyer access could not be verified. Please try again.",
    });
  }
}

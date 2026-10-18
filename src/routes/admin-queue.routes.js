import { Router } from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireAdmin } from "../services/admin.service.js";
import { requireAdminMfa } from "../middleware/require-admin-mfa.js";
import { checked, invalid } from "../services/community.service.js";
import { sendData } from "../http/responses.js";
import { ApiError } from "../errors/api-error.js";
const router = Router();
router.use(authenticate, async (req, res, next) => {
  await requireAdmin(req.user.id);
  next();
});
router.use(requireAdminMfa);
router.use("/:kind/:id", (req, res, next) => {
  if (
    !["report", "verification"].includes(req.params.kind) ||
    !/^[0-9a-f-]{36}$/i.test(req.params.id)
  )
    invalid("Invalid review.");
  next();
});
router.get("/:kind/:id", async (req, res) => {
  const { kind, id } = req.params;
  const item = checked(
    await supabaseAdmin
      .from(kind === "report" ? "safety_reports" : "seller_verifications")
      .select(kind === "report" ? "id" : "id,seller_id")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!item)
    throw new ApiError(404, "QUEUE_ITEM_NOT_FOUND", "Review not found.");
  const claim = checked(
    await supabaseAdmin
      .from("admin_queue_claims")
      .select("*")
      .eq("kind", kind)
      .eq("target_id", id)
      .maybeSingle(),
  );
  const history = checked(
    await supabaseAdmin
      .from("admin_audit_events")
      .select("id,action,reason,created_at,actor_id")
      .eq(
        kind === "report" ? "target_report_id" : "target_user_id",
        kind === "report" ? id : item.seller_id,
      )
      .order("created_at", { ascending: false })
      .limit(30),
  );
  sendData(res, {
    claim,
    history,
    assignedToMe: claim?.assigned_to === req.user.id,
  });
});
router.put("/:kind/:id", async (req, res) => {
  if (typeof req.body?.release !== "boolean")
    invalid("Choose claim or release.");
  checked(
    await supabaseAdmin.rpc("market_claim_queue", {
      p_actor: req.user.id,
      p_kind: req.params.kind,
      p_id: req.params.id,
      p_release: req.body.release,
    }),
  );
  res.status(204).send();
});
export default router;

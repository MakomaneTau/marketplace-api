import { ApiError } from "../errors/api-error.js";
import { supabaseAdmin } from "../config/supabase.js";
import { browserSignedUrl } from "./signed-url.service.js";

export class AdminServiceError extends ApiError {}

function unavailable() {
  return new AdminServiceError(
    503,
    "ADMIN_SERVICE_UNAVAILABLE",
    "Admin tools are temporarily unavailable.",
  );
}

function checked(result) {
  if (result.error) throw unavailable();
  return result;
}

function rpcError(error) {
  const code = error?.message;
  if (code === "QUEUE_ALREADY_ASSIGNED")
    return new AdminServiceError(
      409,
      code,
      "Another admin has claimed this review. Ask them to release it first.",
    );
  if (code === "QUEUE_ITEM_UNAVAILABLE")
    return new AdminServiceError(
      409,
      code,
      "This review has already been completed. Refresh the queue.",
    );
  if (code === "ADMIN_TARGET_FORBIDDEN")
    return new AdminServiceError(
      403,
      code,
      "Admin accounts cannot be suspended here.",
    );
  if (
    code === "USER_NOT_FOUND" ||
    code === "OPEN_REPORT_NOT_FOUND" ||
    code === "PENDING_VERIFICATION_NOT_FOUND"
  ) {
    return new AdminServiceError(
      404,
      code,
      "The requested record is no longer available.",
    );
  }
  if (code === "ADMIN_REQUIRED")
    return new AdminServiceError(403, code, "Admin access is required.");
  if (
    code === "REASON_INVALID" ||
    code === "REPORT_DECISION_INVALID" ||
    code === "VERIFICATION_DECISION_INVALID"
  ) {
    return new AdminServiceError(
      400,
      code,
      "The decision or reason is invalid.",
    );
  }
  return unavailable();
}

export async function isAdmin(userId) {
  const { data } = checked(
    await supabaseAdmin
      .from("admin_members")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
  );
  return Boolean(data);
}

export async function requireAdmin(userId) {
  if (!(await isAdmin(userId)))
    throw new AdminServiceError(
      403,
      "ADMIN_REQUIRED",
      "Admin access is required.",
    );
}

export async function overview() {
  const [buyers, sellers, suspended, reports, verifications] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "buyer"),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "seller"),
      supabaseAdmin
        .from("account_restrictions")
        .select("user_id", { count: "exact", head: true }),
      supabaseAdmin
        .from("safety_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabaseAdmin
        .from("seller_verifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
  [buyers, sellers, suspended, reports, verifications].forEach(checked);
  return {
    buyers: buyers.count || 0,
    sellers: sellers.count || 0,
    suspended: suspended.count || 0,
    openReports: reports.count || 0,
    pendingVerifications: verifications.count || 0,
  };
}

export async function listUsers({ role, search, page, limit }) {
  let query = supabaseAdmin
    .from("profiles")
    .select(
      "id,display_name,role,verification_status,created_at,account_restrictions(reason,suspended_at),admin_members(user_id)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (role) query = query.eq("role", role);
  if (search)
    query = query.ilike(
      "display_name",
      `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
    );
  const { data, count } = checked(await query);
  return {
    users: data.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      role: row.role,
      verificationStatus: row.verification_status,
      createdAt: row.created_at,
      restriction: row.account_restrictions || null,
      isAdmin: Boolean(row.admin_members),
    })),
    total: count || 0,
    page,
    limit,
  };
}

export async function setRestriction(actorId, targetId, suspended, reason) {
  const { error } = await supabaseAdmin.rpc("admin_set_account_restriction", {
    p_actor: actorId,
    p_target: targetId,
    p_suspend: suspended,
    p_reason: reason,
  });
  if (error) throw rpcError(error);
}

export async function listReports({ status, page, limit }) {
  let query = supabaseAdmin
    .from("safety_reports")
    .select(
      "id,category,details,status,created_at,subject_user_id,product_id,resolution_note,reporter:profiles!safety_reports_reporter_id_fkey(display_name),subject:profiles!safety_reports_subject_user_id_fkey(display_name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: status === "open" })
    .range((page - 1) * limit, page * limit - 1);
  if (status) query = query.eq("status", status);
  const { data, count } = checked(await query);
  return {
    reports: data.map((row) => ({
      id: row.id,
      category: row.category,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
      subjectUserId: row.subject_user_id,
      productId: row.product_id,
      reporterName: row.reporter?.display_name || "Account removed",
      subjectName: row.subject?.display_name || null,
      resolutionNote: row.resolution_note,
    })),
    total: count || 0,
    page,
    limit,
  };
}

export async function decideReport(actorId, reportId, status, note) {
  const { error } = await supabaseAdmin.rpc("market_decide_queue", {
    p_actor: actorId,
    p_kind: "report",
    p_id: reportId,
    p_status: status,
    p_note: note,
  });
  if (error) throw rpcError(error);
}

export async function listVerifications({ status, page, limit }) {
  let query = supabaseAdmin
    .from("seller_verifications")
    .select(
      "id,seller_id,status,rejection_reason,created_at,reviewed_at,seller:profiles!seller_verifications_seller_id_fkey(display_name)",
      { count: "exact" },
    )
    .order(status === "resolved" ? "reviewed_at" : "created_at", {
      ascending: status === "pending",
    })
    .range((page - 1) * limit, page * limit - 1);
  if (status === "resolved")
    query = query.in("status", ["verified", "rejected"]);
  else if (status) query = query.eq("status", status);
  const { data, count } = checked(await query);
  return {
    verifications: data.map((row) => ({
      id: row.id,
      sellerId: row.seller_id,
      sellerName: row.seller?.display_name || "Account removed",
      status: row.status,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    })),
    total: count || 0,
    page,
    limit,
  };
}

export async function verificationImages(verificationId) {
  const { data } = checked(
    await supabaseAdmin
      .from("seller_verifications")
      .select("selfie_path,identity_document_path,status")
      .eq("id", verificationId)
      .maybeSingle(),
  );
  if (!data)
    throw new AdminServiceError(
      404,
      "VERIFICATION_NOT_FOUND",
      "Verification request not found.",
    );
  const bucket = supabaseAdmin.storage.from("verification-documents");
  const [selfie, identity] = await Promise.all([
    bucket.createSignedUrl(data.selfie_path, 60),
    bucket.createSignedUrl(data.identity_document_path, 60),
  ]);
  if (selfie.error || identity.error) throw unavailable();
  return {
    selfieUrl: browserSignedUrl(selfie.data.signedUrl),
    identityUrl: browserSignedUrl(identity.data.signedUrl),
    expiresIn: 60,
  };
}

export async function reviewVerification(
  actorId,
  verificationId,
  status,
  reason,
) {
  const { error } = await supabaseAdmin.rpc("market_decide_queue", {
    p_actor: actorId,
    p_kind: "verification",
    p_id: verificationId,
    p_status: status,
    p_note: reason || "",
  });
  if (error) throw rpcError(error);
}

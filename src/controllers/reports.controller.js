import { supabaseAdmin } from "../config/supabase.js";
import { sendData, sendError } from "../http/responses.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function submitReport(req, res) {
  const { category, details, subjectUserId, productId } = req.body || {};
  const errors = [];
  if (
    Object.keys(req.body || {}).some(
      (key) =>
        !["category", "details", "subjectUserId", "productId"].includes(key),
    )
  )
    errors.push({ field: "body", message: "contains unsupported fields" });
  if (!["scam", "harassment", "unsafe_listing", "other"].includes(category))
    errors.push({ field: "category", message: "is invalid" });
  if (
    typeof details !== "string" ||
    details.trim().length < 20 ||
    details.trim().length > 2000
  )
    errors.push({ field: "details", message: "must be 20-2000 characters" });
  if (subjectUserId && !uuid.test(subjectUserId))
    errors.push({ field: "subjectUserId", message: "must be a user ID" });
  if (productId && !uuid.test(productId))
    errors.push({ field: "productId", message: "must be a product ID" });
  if (subjectUserId === req.user.id)
    errors.push({
      field: "subjectUserId",
      message: "cannot be your own account",
    });
  if (errors.length)
    return sendError(res, {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid safety report.",
      details: errors,
    });

  const { data, error } = await supabaseAdmin
    .from("safety_reports")
    .insert({
      reporter_id: req.user.id,
      category,
      details: details.trim(),
      subject_user_id: subjectUserId || null,
      product_id: productId || null,
    })
    .select("id,created_at,status")
    .single();
  if (error)
    return sendError(res, {
      status: 503,
      code: "REPORT_SERVICE_UNAVAILABLE",
      message: "Your report could not be submitted. Please try again.",
    });
  return sendData(
    res,
    { id: data.id, createdAt: data.created_at, status: data.status },
    { status: 201 },
  );
}

export async function myReports(req, res) {
  const { data, error } = await supabaseAdmin
    .from("safety_reports")
    .select("id,category,status,created_at,resolution_note")
    .eq("reporter_id", req.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error)
    return sendError(res, {
      status: 503,
      code: "REPORT_SERVICE_UNAVAILABLE",
      message: "Reports are temporarily unavailable.",
    });
  return sendData(
    res,
    data.map((row) => ({
      id: row.id,
      category: row.category,
      status: row.status,
      createdAt: row.created_at,
      resolutionNote: row.resolution_note,
    })),
  );
}

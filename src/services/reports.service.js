import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../errors/api-error.js";

export class ReportServiceError extends ApiError {}

export async function submitReport(
  userId,
  { category, details, subjectUserId, productId },
) {
  const { data, error } = await supabaseAdmin
    .from("safety_reports")
    .insert({
      reporter_id: userId,
      category,
      details: details.trim(),
      subject_user_id: subjectUserId || null,
      product_id: productId || null,
    })
    .select("id,created_at,status")
    .single();
  if (error)
    throw new ReportServiceError(
      503,
      "REPORT_SERVICE_UNAVAILABLE",
      "Your report could not be submitted. Please try again.",
    );
  return { id: data.id, createdAt: data.created_at, status: data.status };
}

export async function myReports(userId) {
  const { data, error } = await supabaseAdmin
    .from("safety_reports")
    .select("id,category,status,created_at,resolution_note")
    .eq("reporter_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error)
    throw new ReportServiceError(
      503,
      "REPORT_SERVICE_UNAVAILABLE",
      "Reports are temporarily unavailable.",
    );
  return data.map((row) => ({
    id: row.id,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
    resolutionNote: row.resolution_note,
  }));
}

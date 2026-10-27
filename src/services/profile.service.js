import { config } from "../config/env.js";
import { ApiError } from "../errors/api-error.js";
import { supabaseAdmin } from "../config/supabase.js";
import { isAdmin } from "./admin.service.js";

const PROFILE_SELECT = `
  *,
  university:universities(id, name, acronym, slug),
  campus:campuses(id, name, city, province)
`;

export class ProfileServiceError extends ApiError {}

function unavailable() {
  return new ProfileServiceError(
    503,
    "PROFILE_SERVICE_UNAVAILABLE",
    "Profile information is temporarily unavailable.",
  );
}

function toProfileDto(profile) {
  return {
    id: profile.id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    displayName: profile.display_name,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    // `role` remains the active mode in the API contract. The database role
    // retains seller capability so a shop stays sellable while its owner buys.
    role: profile.active_role ?? profile.role,
    canSell: profile.role === "seller",
    isStudent: profile.is_student,
    university: profile.university,
    campus: profile.campus,
    studentNumber: profile.student_number,
    verificationStatus: profile.verification_status,
    rating: Number(profile.rating),
    reviewCount: profile.review_count,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function logProfile(level, event, payload = {}) {
  if (config.nodeEnv === "test") return;
  console[level](
    JSON.stringify({
      level,
      event,
      service: "profile",
      ...payload,
    }),
  );
}

function serializeDatabaseError(error) {
  if (!error) return null;
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

export async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw unavailable();
  if (!data)
    throw new ProfileServiceError(
      404,
      "PROFILE_NOT_FOUND",
      "Profile not found.",
    );
  return toProfileDto(data);
}

export async function resolveUniversityId(slug) {
  if (slug === null) return null;
  const { data, error } = await supabaseAdmin
    .from("universities")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw unavailable();
  if (!data) {
    throw new ProfileServiceError(
      400,
      "UNIVERSITY_REFERENCE_INVALID",
      "The selected university does not exist.",
    );
  }
  return data.id;
}

export async function switchRole(userId, role) {
  if (!["buyer", "seller"].includes(role)) {
    throw new ProfileServiceError(
      400,
      "ROLE_INVALID",
      "Choose buyer or seller.",
    );
  }
  if (await isAdmin(userId)) {
    throw new ProfileServiceError(
      403,
      "ADMIN_MODE_REQUIRED",
      "Admin accounts cannot switch marketplace modes.",
    );
  }
  // Never downgrade the persistent seller capability when switching to buying.
  const update = { active_role: role, ...(role === "seller" ? { role } : {}) };
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select(PROFILE_SELECT)
    .maybeSingle();
  if (error) throw unavailable();
  if (!data)
    throw new ProfileServiceError(
      404,
      "PROFILE_NOT_FOUND",
      "Profile not found.",
    );
  return toProfileDto(data);
}

async function validateCampus(campusId, universityId) {
  if (campusId === null) return null;
  let query = supabaseAdmin
    .from("campuses")
    .select("id, university_id")
    .eq("id", campusId);
  if (universityId) query = query.eq("university_id", universityId);
  const { data, error } = await query.maybeSingle();

  if (error) throw unavailable();
  if (!data) {
    throw new ProfileServiceError(
      400,
      "CAMPUS_REFERENCE_INVALID",
      "The selected campus does not belong to the selected university.",
    );
  }
  return data.university_id;
}

export async function updateProfile(userId, input) {
  const update = {};
  const mappings = {
    firstName: "first_name",
    lastName: "last_name",
    displayName: "display_name",
    phone: "phone",
    avatarUrl: "avatar_url",
    isStudent: "is_student",
    studentNumber: "student_number",
  };

  for (const [apiField, databaseField] of Object.entries(mappings)) {
    if (apiField in input) update[databaseField] = input[apiField];
  }

  let universityId;
  if ("universitySlug" in input) {
    universityId = await resolveUniversityId(input.universitySlug);
    update.university_id = universityId;
    if (input.universitySlug === null && !("campusId" in input))
      update.campus_id = null;
  }
  if ("campusId" in input) {
    const campusUniversityId = await validateCampus(
      input.campusId,
      universityId,
    );
    update.campus_id = input.campusId;
    if (universityId === undefined && campusUniversityId) {
      update.university_id = campusUniversityId;
    }
  }

  if (input.isStudent === false) {
    update.university_id = null;
    update.campus_id = null;
    update.student_number = null;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select(PROFILE_SELECT)
    .maybeSingle();

  logProfile(error ? "error" : "info", "profile_update_result", {
    userId,
    updateFields: Object.keys(update),
    hasData: Boolean(data),
    error: serializeDatabaseError(error),
  });

  if (error) throw unavailable();
  if (!data) {
    logProfile("error", "profile_update_missing_row", {
      userId,
      attemptedFields: Object.keys(update),
    });
    throw new ProfileServiceError(
      404,
      "PROFILE_NOT_FOUND",
      "Profile not found.",
    );
  }
}

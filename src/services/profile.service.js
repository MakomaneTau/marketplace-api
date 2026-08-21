import { supabaseAdmin } from "../config/supabase.js";

const PROFILE_SELECT = `
  *,
  university:universities(id, name, acronym, slug),
  campus:campuses(id, name, city, province)
`;

export class ProfileServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ProfileServiceError";
    this.status = status;
    this.code = code;
  }
}

function unavailable() {
  return new ProfileServiceError(
    503,
    "PROFILE_SERVICE_UNAVAILABLE",
    "Profile information is temporarily unavailable."
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
    role: profile.role,
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

export async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw unavailable();
  if (!data) throw new ProfileServiceError(404, "PROFILE_NOT_FOUND", "Profile not found.");
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
      "The selected university does not exist."
    );
  }
  return data.id;
}

async function validateCampus(campusId, universityId) {
  if (campusId === null) return null;
  let query = supabaseAdmin.from("campuses").select("id, university_id").eq("id", campusId);
  if (universityId) query = query.eq("university_id", universityId);
  const { data, error } = await query.maybeSingle();

  if (error) throw unavailable();
  if (!data) {
    throw new ProfileServiceError(
      400,
      "CAMPUS_REFERENCE_INVALID",
      "The selected campus does not belong to the selected university."
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
    if (input.universitySlug === null && !("campusId" in input)) update.campus_id = null;
  }
  if ("campusId" in input) {
    const campusUniversityId = await validateCampus(input.campusId, universityId);
    update.campus_id = input.campusId;
    if (universityId === undefined && campusUniversityId) {
      update.university_id = campusUniversityId;
    }
  }

  if (input.isStudent === false) {
    const { data: current, error: currentError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (currentError) throw unavailable();
    if (!current) throw new ProfileServiceError(404, "PROFILE_NOT_FOUND", "Profile not found.");
    if (current.role === "buyer") {
      throw new ProfileServiceError(
        400,
        "BUYER_STUDENT_REQUIRED",
        "Buyer accounts must remain student accounts."
      );
    }
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

  if (error) throw unavailable();
  if (!data) throw new ProfileServiceError(404, "PROFILE_NOT_FOUND", "Profile not found.");
  return toProfileDto(data);
}

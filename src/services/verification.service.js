import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import {
  removePrivateImages,
  StorageServiceError,
  uploadPrivateImage,
} from "./storage.service.js";

const BUCKET = "verification-documents";

export class VerificationServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "VerificationServiceError";
    this.status = status;
    this.code = code;
  }
}

function unavailable() {
  return new VerificationServiceError(
    503,
    "VERIFICATION_SERVICE_UNAVAILABLE",
    "Seller verification is temporarily unavailable."
  );
}

function dto(record) {
  return {
    id: record.id,
    status: record.status,
    rejectionReason: record.rejection_reason,
    reviewedAt: record.reviewed_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

async function requireSeller(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw unavailable();
  if (!data || data.role !== "seller") {
    throw new VerificationServiceError(
      403,
      "SELLER_REQUIRED",
      "A seller account is required."
    );
  }
}

export async function getSellerVerification(userId) {
  await requireSeller(userId);
  const { data, error } = await supabaseAdmin
    .from("seller_verifications")
    .select("*")
    .eq("seller_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw unavailable();
  return data ? dto(data) : null;
}

export async function submitSellerVerification(userId, { selfie, sellerId }) {
  await requireSeller(userId);
  const current = await getSellerVerification(userId);
  if (current?.status === "pending") {
    throw new VerificationServiceError(
      409,
      "VERIFICATION_ALREADY_PENDING",
      "A seller verification submission is already pending."
    );
  }

  const verificationId = randomUUID();
  const uploaded = [];
  try {
    const selfiePath = await uploadPrivateImage({
      bucket: BUCKET,
      ownerId: userId,
      scopeId: verificationId,
      label: "selfie",
      file: selfie,
    });
    uploaded.push(selfiePath);
    const identityPath = await uploadPrivateImage({
      bucket: BUCKET,
      ownerId: userId,
      scopeId: verificationId,
      label: "identity",
      file: sellerId,
    });
    uploaded.push(identityPath);

    const { data, error } = await supabaseAdmin
      .from("seller_verifications")
      .insert({
        id: verificationId,
        seller_id: userId,
        selfie_path: selfiePath,
        identity_document_path: identityPath,
      })
      .select("*")
      .single();

    if (error) throw unavailable();
    return dto(data);
  } catch (error) {
    await removePrivateImages(BUCKET, uploaded);
    if (
      error instanceof VerificationServiceError ||
      error instanceof StorageServiceError
    ) {
      throw error;
    }
    throw unavailable();
  }
}

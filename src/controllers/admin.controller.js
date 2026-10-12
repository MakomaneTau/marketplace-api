import { sendData, sendError } from "../http/responses.js";
import * as service from "../services/admin.service.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(res, error) {
  return sendError(res, {
    status: error instanceof service.AdminServiceError ? error.status : 500,
    code:
      error instanceof service.AdminServiceError
        ? error.code
        : "INTERNAL_SERVER_ERROR",
    message:
      error instanceof service.AdminServiceError
        ? error.message
        : "An unexpected error occurred.",
  });
}

function invalid(res, field, message) {
  return sendError(res, {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Invalid admin request.",
    details: [{ field, message }],
  });
}

function pageQuery(req, res, allowed) {
  if (Object.keys(req.query).some((key) => !allowed.includes(key))) {
    invalid(res, "query", "contains unsupported fields");
    return null;
  }
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    invalid(res, "page", "page must be 1-10000 and limit must be 1-50");
    return null;
  }
  return { page, limit };
}

export function access(req, res) {
  return sendData(res, { isAdmin: true });
}

export async function overview(req, res) {
  try {
    return sendData(res, await service.overview());
  } catch (error) {
    return failure(res, error);
  }
}

export async function users(req, res) {
  const paging = pageQuery(req, res, ["page", "limit", "role", "search"]);
  if (!paging) return;
  const role = req.query.role || null;
  const search = String(req.query.search || "").trim();
  if (role && !["buyer", "seller"].includes(role))
    return invalid(res, "role", "must be buyer or seller");
  if (search.length > 100)
    return invalid(res, "search", "must be 100 characters or fewer");
  try {
    return sendData(res, await service.listUsers({ ...paging, role, search }));
  } catch (error) {
    return failure(res, error);
  }
}

export async function restriction(req, res) {
  if (!uuid.test(req.params.id)) return invalid(res, "id", "must be a user ID");
  if (
    Object.keys(req.body || {}).some(
      (key) => !["suspended", "reason"].includes(key),
    ) ||
    typeof req.body?.suspended !== "boolean" ||
    typeof req.body?.reason !== "string" ||
    req.body.reason.trim().length < 10 ||
    req.body.reason.trim().length > 500
  ) {
    return invalid(
      res,
      "body",
      "include suspended and a reason of 10-500 characters",
    );
  }
  try {
    await service.setRestriction(
      req.user.id,
      req.params.id,
      req.body.suspended,
      req.body.reason.trim(),
    );
    return sendData(res, { suspended: req.body.suspended });
  } catch (error) {
    return failure(res, error);
  }
}

export async function reports(req, res) {
  const paging = pageQuery(req, res, ["page", "limit", "status"]);
  if (!paging) return;
  const status = req.query.status || null;
  if (status && !["open", "resolved", "dismissed"].includes(status))
    return invalid(res, "status", "is invalid");
  try {
    return sendData(res, await service.listReports({ ...paging, status }));
  } catch (error) {
    return failure(res, error);
  }
}

export async function reportDecision(req, res) {
  if (!uuid.test(req.params.id))
    return invalid(res, "id", "must be a report ID");
  const { status, note } = req.body || {};
  if (
    Object.keys(req.body || {}).some(
      (key) => !["status", "note"].includes(key),
    ) ||
    !["resolved", "dismissed"].includes(status) ||
    typeof note !== "string" ||
    note.trim().length < 10 ||
    note.trim().length > 1000
  ) {
    return invalid(
      res,
      "body",
      "include a decision and a note of 10-1000 characters",
    );
  }
  try {
    await service.decideReport(req.user.id, req.params.id, status, note.trim());
    return sendData(res, { status });
  } catch (error) {
    return failure(res, error);
  }
}

export async function verifications(req, res) {
  const paging = pageQuery(req, res, ["page", "limit", "status"]);
  if (!paging) return;
  const status = req.query.status || null;
  if (
    status &&
    !["pending", "resolved", "verified", "rejected"].includes(status)
  )
    return invalid(res, "status", "is invalid");
  try {
    return sendData(
      res,
      await service.listVerifications({ ...paging, status }),
    );
  } catch (error) {
    return failure(res, error);
  }
}

export async function verificationImages(req, res) {
  if (!uuid.test(req.params.id))
    return invalid(res, "id", "must be a verification ID");
  try {
    return sendData(res, await service.verificationImages(req.params.id));
  } catch (error) {
    return failure(res, error);
  }
}

export async function verificationDecision(req, res) {
  if (!uuid.test(req.params.id))
    return invalid(res, "id", "must be a verification ID");
  const { status, reason } = req.body || {};
  if (
    Object.keys(req.body || {}).some(
      (key) => !["status", "reason"].includes(key),
    ) ||
    !["verified", "rejected"].includes(status) ||
    (status === "rejected" &&
      (typeof reason !== "string" ||
        reason.trim().length < 10 ||
        reason.trim().length > 500))
  ) {
    return invalid(
      res,
      "body",
      "include a decision and a reason when rejecting",
    );
  }
  try {
    await service.reviewVerification(
      req.user.id,
      req.params.id,
      status,
      typeof reason === "string" ? reason.trim() : "",
    );
    return sendData(res, { status });
  } catch (error) {
    return failure(res, error);
  }
}

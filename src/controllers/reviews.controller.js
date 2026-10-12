import { createServiceErrorHandler } from "../http/service-error.js";
import * as reviewsService from "../services/reviews.service.js";
import { sendData, sendError } from "../http/responses.js";
const U = /^[0-9a-f-]{36}$/i;
const bad = (r, d) =>
  sendError(r, {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Invalid review data.",
    details: d,
  });
const fail = createServiceErrorHandler(
  (error) => error instanceof reviewsService.ReviewServiceError,
);
const opts = (q) => ({
  page: q.page ? Number(q.page) : 1,
  limit: q.limit ? Number(q.limit) : 20,
});
function page(r, x) {
  return sendData(r, x.reviews, {
    meta: {
      page: x.page,
      limit: x.limit,
      total: x.total,
      totalPages: x.totalPages,
    },
  });
}
export async function createReview(req, res) {
  const i = req.body || {},
    e = [];
  if (!U.test(req.params.id)) e.push({ field: "id", message: "invalid UUID" });
  if (!U.test(i.productId))
    e.push({ field: "productId", message: "invalid UUID" });
  if (!Number.isInteger(i.rating) || i.rating < 1 || i.rating > 5)
    e.push({ field: "rating", message: "must be 1-5" });
  if (
    typeof i.comment !== "string" ||
    i.comment.trim().length < 10 ||
    i.comment.length > 1000
  )
    e.push({ field: "comment", message: "must be 10-1000 characters" });
  if (e.length) return bad(res, e);
  try {
    return sendData(
      res,
      await reviewsService.createReview(req.user.id, req.params.id, i),
      {
        status: 201,
      },
    );
  } catch (x) {
    return fail(res, x);
  }
}
export async function productReviews(req, res) {
  if (!U.test(req.params.id))
    return bad(res, [{ field: "id", message: "invalid UUID" }]);
  try {
    return page(
      res,
      await reviewsService.listProductReviews(req.params.id, opts(req.query)),
    );
  } catch (e) {
    return fail(res, e);
  }
}
export async function shopReviews(req, res) {
  try {
    return page(
      res,
      await reviewsService.listShopReviews(req.params.slug, opts(req.query)),
    );
  } catch (e) {
    return fail(res, e);
  }
}

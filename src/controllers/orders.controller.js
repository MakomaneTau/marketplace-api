import * as ordersService from "../services/orders.service.js";
import { sendData, sendError } from "../http/responses.js";
import { validateCreateOrder, validateOrderId, validateOrderListQuery, validateOrderStatus } from "../validators/orders.validator.js";

const validation = (res, details) => sendError(res, { status: 400, code: "VALIDATION_ERROR", message: "The request contains invalid order data.", details });
function handle(res, error) {
  if (error instanceof ordersService.OrderServiceError) return sendError(res, { status: error.status, code: error.code, message: error.message });
  return sendError(res, { status: 500, code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." });
}
function options(query) { return { status: query.status, page: query.page ? Number(query.page) : 1, limit: query.limit ? Number(query.limit) : 24 }; }
function paginated(res, result) { return sendData(res, result.orders, { meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } }); }

export async function listBuyerOrders(req, res) {
  const errors = validateOrderListQuery(req.query); if (errors.length) return validation(res, errors);
  try { return paginated(res, await ordersService.listBuyerOrders(req.user.id, options(req.query))); } catch (error) { return handle(res, error); }
}
export async function listSellerOrders(req, res) {
  const errors = validateOrderListQuery(req.query); if (errors.length) return validation(res, errors);
  try { return paginated(res, await ordersService.listSellerOrders(req.user.id, options(req.query))); } catch (error) { return handle(res, error); }
}
export async function getOrder(req, res) {
  const errors = validateOrderId(req.params.id); if (errors.length) return validation(res, errors);
  try { return sendData(res, await ordersService.getOrder(req.params.id, req.user.id)); } catch (error) { return handle(res, error); }
}
export async function createOrder(req, res) {
  const errors = validateCreateOrder(req.body); if (errors.length) return validation(res, errors);
  try { return sendData(res, await ordersService.createOrder(req.user.id, req.body), { status: 201 }); } catch (error) { return handle(res, error); }
}
export async function transitionOrder(req, res) {
  const errors = [...validateOrderId(req.params.id), ...validateOrderStatus(req.body)]; if (errors.length) return validation(res, errors);
  try { return sendData(res, await ordersService.transitionOrder(req.params.id, req.user.id, req.body.status)); } catch (error) { return handle(res, error); }
}

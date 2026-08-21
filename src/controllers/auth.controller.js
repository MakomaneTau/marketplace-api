import { sendData } from "../http/responses.js";

export function getCurrentUser(req, res) {
  return sendData(res, { user: req.user });
}

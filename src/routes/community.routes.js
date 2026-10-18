import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { requireBuyer } from "../middleware/require-buyer.js";
import { sendData } from "../http/responses.js";
import * as service from "../services/community.service.js";

const router = Router();
router.use(
  [
    "/saved-searches",
    "/follows",
    "/wanted",
    "/conversation-offers",
    "/offers",
    "/pickup-plans",
  ],
  authenticate,
);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
router.param("id", (req, res, next, id) => {
  if (!uuid.test(id)) service.invalid("Invalid identifier.");
  next();
});
router.get("/saved-searches", requireBuyer, async (req, res) =>
  sendData(res, await service.savedSearches(req.user.id)),
);
router.post("/saved-searches", requireBuyer, async (req, res) =>
  sendData(res, await service.saveSearch(req.user.id, req.body), {
    status: 201,
  }),
);
router.delete("/saved-searches/:id", requireBuyer, async (req, res) => {
  await service.removeSearch(req.user.id, req.params.id);
  res.status(204).send();
});
router.get("/follows", requireBuyer, async (req, res) =>
  sendData(res, await service.follows(req.user.id)),
);
router.put("/follows/:slug", requireBuyer, async (req, res) => {
  await service.follow(req.user.id, req.params.slug, true);
  res.status(204).send();
});
router.delete("/follows/:slug", requireBuyer, async (req, res) => {
  await service.follow(req.user.id, req.params.slug, false);
  res.status(204).send();
});
router.get("/wanted", async (req, res) =>
  sendData(res, await service.wanted(req.user.id)),
);
router.post("/wanted", requireBuyer, async (req, res) => {
  if (req.body?.campusId && !uuid.test(req.body.campusId))
    service.invalid("Invalid campus.");
  sendData(res, await service.postWanted(req.user.id, req.body), {
    status: 201,
  });
});
router.patch("/wanted/:id", requireBuyer, async (req, res) =>
  sendData(res, await service.closeWanted(req.user.id, req.params.id)),
);
router.post("/wanted/:id/replies", async (req, res) => {
  if (!uuid.test(req.body?.productId))
    service.invalid("Choose a valid product.");
  sendData(
    res,
    await service.replyWanted(req.user.id, req.params.id, req.body.productId),
    { status: 201 },
  );
});
router.get("/conversation-offers/:id", async (req, res) =>
  sendData(res, await service.offers(req.user.id, req.params.id)),
);
router.post("/conversation-offers/:id", requireBuyer, async (req, res) =>
  sendData(res, await service.makeOffer(req.user.id, req.params.id, req.body), {
    status: 201,
  }),
);
router.get("/offers/:id", requireBuyer, async (req, res) =>
  sendData(res, await service.offerDetails(req.user.id, req.params.id)),
);
router.patch("/offers/:id", async (req, res) => {
  await service.decideOffer(req.user.id, req.params.id, req.body?.status);
  res.status(204).send();
});
router.get("/pickup-plans/:id", async (req, res) =>
  sendData(res, await service.pickup(req.user.id, req.params.id)),
);
router.put("/pickup-plans/:id", async (req, res) =>
  sendData(
    res,
    await service.changePickup(req.user.id, req.params.id, req.body),
  ),
);
export default router;
